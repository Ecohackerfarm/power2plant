import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import prisma from '@/lib/prisma'
import { SOURCE_CONFIDENCE } from '@/lib/source-confidence'
import { classifyUrl } from '@/lib/classify-url'
import { computeAndSaveTrustScore } from '@/lib/trust-score'
import { Prisma } from '@prisma/client'
import type { SourceClassification, ConfidenceLevel, RelationshipType, RelationshipReasonType, Direction } from '@prisma/client'
import { auth } from '@/lib/auth'

const VALID_TYPES = ['COMPANION', 'AVOID'] as const
const VALID_REASONS = ['PEST_CONTROL', 'POLLINATION', 'NUTRIENT', 'SHADE', 'ALLELOPATHY', 'OTHER'] as const
const VALID_SOURCE_TYPES = ['SCIENTIFIC_PAPER', 'ACADEMIC_RESOURCE', 'GARDENING_GUIDE', 'BLOG_FORUM', 'PERSONAL_OBSERVATION'] as const
const VALID_EVIDENCE_LEVELS = ['ANECDOTAL', 'TRADITIONAL', 'OBSERVED', 'PEER_REVIEWED'] as const

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.875) return 'PEER_REVIEWED'
  if (confidence >= 0.625) return 'OBSERVED'
  if (confidence >= 0.375) return 'TRADITIONAL'
  return 'ANECDOTAL'
}

/** Collapse per-source claims into distinct {type, explanation} for display. */
function claimsToReasons(
  claims: { mechanism: RelationshipReasonType; explanation: string }[],
): { type: RelationshipReasonType; explanation: string }[] {
  const seen = new Set<string>()
  const out: { type: RelationshipReasonType; explanation: string }[] = []
  for (const c of claims) {
    if (seen.has(c.mechanism)) continue
    seen.add(c.mechanism)
    out.push({ type: c.mechanism, explanation: c.explanation })
  }
  return out
}

async function findCropIds(term: string, locale: string): Promise<string[]> {
  const like = `%${term.toLowerCase()}%`
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT c.id FROM "Crop" c
    LEFT JOIN "CropTranslation" t ON t."cropId" = c.id AND t.locale = ${locale}
    WHERE
      lower(c.name) LIKE ${like}
      OR lower(c."botanicalName") LIKE ${like}
      OR lower(c."canonicalName") LIKE ${like}
      OR EXISTS (SELECT 1 FROM unnest(c."commonNames") cn WHERE lower(cn) LIKE ${like})
      OR EXISTS (SELECT 1 FROM unnest(COALESCE(t."commonNames", ARRAY[]::TEXT[])) cn WHERE lower(cn) LIKE ${like})
      OR EXISTS (SELECT 1 FROM "BotanicalSynonym" bs WHERE bs."cropId" = c.id AND lower(bs.name) LIKE ${like})
    LIMIT 50
  `
  return rows.map(r => r.id)
}

async function findExactCropIds(term: string, locale: string): Promise<string[]> {
  const exact = term.toLowerCase()
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT c.id FROM "Crop" c
    LEFT JOIN "CropTranslation" t ON t."cropId" = c.id AND t.locale = ${locale}
    WHERE
      lower(c.name) = ${exact}
      OR lower(c."botanicalName") = ${exact}
      OR lower(c."canonicalName") = ${exact}
      OR EXISTS (SELECT 1 FROM unnest(c."commonNames") cn WHERE lower(cn) = ${exact})
      OR EXISTS (SELECT 1 FROM unnest(COALESCE(t."commonNames", ARRAY[]::TEXT[])) cn WHERE lower(cn) = ${exact})
  `
  return rows.map(r => r.id)
}

async function detectTwoCropIds(q: string, locale: string): Promise<[string[], string[]] | null> {
  const trimmed = q.trim()
  if (!trimmed.includes(' ') && !trimmed.includes(',')) return null

  // Generate candidate splits: comma/semicolon splits first, then space splits
  const splits: [string, string][] = []
  for (const sep of [',', ';', '&']) {
    const parts = trimmed.split(sep).map(s => s.trim()).filter(Boolean)
    if (parts.length === 2) splits.push([parts[0], parts[1]])
  }
  // Space splits: try all positions
  const words = trimmed.split(/\s+/)
  for (let i = 1; i < words.length; i++) {
    splits.push([words.slice(0, i).join(' '), words.slice(i).join(' ')])
  }

  for (const [a, b] of splits) {
    if (!a || !b) continue
    const [idsA, idsB] = await Promise.all([findCropIds(a, locale), findCropIds(b, locale)])
    if (idsA.length > 0 && idsB.length > 0) {
      // Skip if one set is a subset of the other — this means the query is a single
      // botanical name (genus + species epithet) not two distinct crops.
      const setA = new Set(idsA)
      const setB = new Set(idsB)
      if (idsB.every(id => setA.has(id)) || idsA.every(id => setB.has(id))) continue
      return [idsA, idsB]
    }
  }
  return null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? ''
  const locale = searchParams.get('locale') ?? 'en'
  const cursor = searchParams.get('cursor') ?? undefined
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50)

  try {
    // Two-crop detection: if query matches two distinct crop names, filter their relationship
    let whereClause: Record<string, unknown> = {}
    let exactCropIds = new Set<string>()
    if (q) {
      const twoCropIds = await detectTwoCropIds(q, locale)
      if (twoCropIds) {
        const [idsA, idsB] = twoCropIds
        whereClause = {
          OR: [
            { cropAId: { in: idsA }, cropBId: { in: idsB } },
            { cropAId: { in: idsB }, cropBId: { in: idsA } },
          ],
        }
      } else {
        const [ids, exactIds] = await Promise.all([findCropIds(q, locale), findExactCropIds(q, locale)])
        exactCropIds = new Set(exactIds)
        whereClause = { OR: [{ cropAId: { in: ids } }, { cropBId: { in: ids } }] }
      }
    }

    const cropSelect = {
      id: true,
      name: true,
      botanicalName: true,
      commonNames: true,
      translations: { where: { locale }, select: { commonNames: true } },
    }

    const relationships = await prisma.cropRelationship.findMany({
      where: {
        ...whereClause,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      take: limit + 1,
      orderBy: { id: 'desc' },
      include: {
        cropA: { select: cropSelect },
        cropB: { select: cropSelect },
        claims: { select: { mechanism: true, explanation: true } },
        _count: { select: { sources: true } },
      },
    })

    const hasNext = relationships.length > limit
    const page = hasNext ? relationships.slice(0, -1) : relationships
    // Exact-match crops surface first; stable (preserves id:desc within each tier)
    if (exactCropIds.size > 0) {
      page.sort((a, b) => {
        const aExact = exactCropIds.has(a.cropAId) || exactCropIds.has(a.cropBId)
        const bExact = exactCropIds.has(b.cropAId) || exactCropIds.has(b.cropBId)
        return (aExact === bExact) ? 0 : aExact ? -1 : 1
      })
    }
    const results = page
    const nextCursor = hasNext ? page[page.length - 1].id : null

    function localisedCrop(crop: { id: string; name: string; botanicalName: string; commonNames: string[]; translations: { commonNames: string[] }[] }) {
      const { translations, ...rest } = crop
      return { ...rest, commonNames: translations?.[0]?.commonNames ?? rest.commonNames }
    }

    return NextResponse.json({
      relationships: results.map((r) => ({
        id: r.id,
        type: r.type,
        reasons: claimsToReasons(r.claims),
        confidence: getConfidenceLabel(r.confidence),
        notes: r.notes,
        cropA: localisedCrop(r.cropA),
        cropB: localisedCrop(r.cropB),
        sourceCount: r._count.sources,
      })),
      nextCursor,
    })
  } catch (err) {
    console.error('[GET /api/relationships]', err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}

async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { cropAId?: unknown; cropBId?: unknown; type?: unknown; reason?: unknown; notes?: unknown; sourceType?: unknown; sources?: unknown; evidenceLevel?: unknown; sourceTypeOverrides?: unknown; position?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const { cropAId, cropBId, type, reason, notes, sources } = body

  if (typeof cropAId !== 'string' || cropAId.trim() === '') {
    return NextResponse.json({ error: 'cropAId must be a non-empty string' }, { status: 400 })
  }
  if (typeof cropBId !== 'string' || cropBId.trim() === '') {
    return NextResponse.json({ error: 'cropBId must be a non-empty string' }, { status: 400 })
  }
  if (cropAId === cropBId) {
    return NextResponse.json({ error: 'cropAId and cropBId must be different' }, { status: 400 })
  }
  if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return NextResponse.json({ error: 'type must be COMPANION or AVOID' }, { status: 400 })
  }
  if (reason !== undefined && !VALID_REASONS.includes(reason as (typeof VALID_REASONS)[number])) {
    return NextResponse.json({ error: 'invalid reason' }, { status: 400 })
  }
  if (notes !== undefined && (typeof notes !== 'string' || notes.length > 2000)) {
    return NextResponse.json({ error: 'notes must be a string of at most 2000 chars' }, { status: 400 })
  }
  if (sources !== undefined) {
    if (!Array.isArray(sources) || !sources.every(s => typeof s === 'string')) {
      return NextResponse.json({ error: 'sources must be an array of strings' }, { status: 400 })
    }
    if (sources.length > 20) {
      return NextResponse.json({ error: 'sources must have at most 20 items' }, { status: 400 })
    }
  }
  const { sourceType } = body
  if (sourceType !== undefined && !VALID_SOURCE_TYPES.includes(sourceType as (typeof VALID_SOURCE_TYPES)[number])) {
    return NextResponse.json({ error: 'invalid sourceType' }, { status: 400 })
  }

  const { evidenceLevel } = body
  if (evidenceLevel !== undefined && !VALID_EVIDENCE_LEVELS.includes(evidenceLevel as (typeof VALID_EVIDENCE_LEVELS)[number])) {
    return NextResponse.json({ error: 'invalid evidenceLevel' }, { status: 400 })
  }

  // position: what this observation says about the pair (defaults to type, so "pro" submissions need not specify)
  const { position: positionRaw } = body
  const position: RelationshipType = (
    positionRaw !== undefined && VALID_TYPES.includes(positionRaw as (typeof VALID_TYPES)[number])
      ? positionRaw
      : type
  ) as RelationshipType

  const { sourceTypeOverrides } = body
  if (sourceTypeOverrides !== undefined) {
    if (typeof sourceTypeOverrides !== 'object' || sourceTypeOverrides === null || Array.isArray(sourceTypeOverrides)) {
      return NextResponse.json({ error: 'sourceTypeOverrides must be an object' }, { status: 400 })
    }
    for (const [key, val] of Object.entries(sourceTypeOverrides)) {
      if (!VALID_SOURCE_TYPES.includes(val as (typeof VALID_SOURCE_TYPES)[number])) {
        return NextResponse.json({ error: 'invalid sourceTypeOverrides entry' }, { status: 400 })
      }
    }
  }

  const crops = await prisma.crop.findMany({
    where: { id: { in: [cropAId, cropBId] } },
    select: { id: true },
  })
  if (crops.length < 2) {
    const found = new Set(crops.map(c => c.id))
    const unknown = [cropAId, cropBId].filter(id => !found.has(id))
    return NextResponse.json({ error: 'unknown crop ids', ids: unknown }, { status: 422 })
  }

  const [canonA, canonB] = cropAId < cropBId ? [cropAId, cropBId] : [cropBId, cropAId]

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const existing = await prisma.relationshipSource.findFirst({
    where: {
      userId: session.user.id,
      source: 'COMMUNITY',
      fetchedAt: { gte: todayStart },
      relationship: { cropAId: canonA, cropBId: canonB },
    },
  })
  if (existing) {
    return NextResponse.json(
      { error: 'You already submitted a relationship for this pair today' },
      { status: 429 }
    )
  }

  const result = await prisma.$transaction(async (tx) => {
    const rel = await tx.cropRelationship.upsert({
      where: { cropAId_cropBId: { cropAId: canonA, cropBId: canonB } },
      create: {
        cropAId: canonA,
        cropBId: canonB,
        type: type as (typeof VALID_TYPES)[number],
        direction: 'MUTUAL',
        notes: notes as string | undefined ?? null,
        confidence: 0.25,
      },
      update: {},
    })

    // Each source carries the submission's polarity (position) + mechanism as a
    // claim. The polarity/direction live on the claim now, not the source.
    const claimMechanism: RelationshipReasonType =
      reason && VALID_REASONS.includes(reason as (typeof VALID_REASONS)[number])
        ? (reason as RelationshipReasonType)
        : 'OTHER'
    const claimExplanation = (notes as string | undefined) ?? (reason as string | undefined) ?? ''
    async function addClaim(srcId: string) {
      await tx.relationshipClaim.create({
        data: {
          mechanism: claimMechanism,
          relationshipType: position,
          direction: 'UNKNOWN' as Direction,
          explanation: claimExplanation,
          relationshipId: rel.id,
          sourceId: srcId,
        },
      })
    }

    let sourceId: string

    if (sources && Array.isArray(sources) && sources.length > 0) {
      for (const [index, url] of sources.entries()) {
        const autoType = classifyUrl(url)
        const st: SourceClassification = (sourceTypeOverrides as Record<string, SourceClassification> | undefined)?.[index] ?? autoType
        const src = await tx.relationshipSource.create({
          data: {
            relationshipId: rel.id,
            source: 'MANUAL',
            sourceType: st,
            confidence: SOURCE_CONFIDENCE[st],
            url,
            notes: notes as string | undefined ?? null,
            userId: session.user.id,
          },
        })
        await addClaim(src.id)
        sourceId = src.id
      }
      const testimonyConfidence = evidenceLevel as ConfidenceLevel | undefined ?? 'ANECDOTAL'
      const testimony = await tx.relationshipSource.create({
        data: {
          relationshipId: rel.id,
          source: 'COMMUNITY',
          sourceType: 'PERSONAL_OBSERVATION',
          confidence: testimonyConfidence,
          notes: notes as string | undefined ?? null,
          userId: session.user.id,
        },
      })
      await addClaim(testimony.id)
      sourceId = testimony.id
    } else {
      const testimonyConfidence = (evidenceLevel as ConfidenceLevel | undefined) ?? (SOURCE_CONFIDENCE[sourceType as keyof typeof SOURCE_CONFIDENCE] ?? 'ANECDOTAL')
      const source = await tx.relationshipSource.create({
        data: {
          relationshipId: rel.id,
          source: 'COMMUNITY',
          sourceType: sourceType as (typeof VALID_SOURCE_TYPES)[number] | undefined ?? undefined,
          confidence: testimonyConfidence,
          notes: notes as string | undefined ?? null,
          userId: session.user.id,
        },
      })
      await addClaim(source.id)
      sourceId = source.id
    }

    const allSources = await tx.relationshipSource.findMany({
      where: { relationshipId: rel.id },
      select: { confidence: true, source: true, userId: true },
    })
    const CONFIDENCE_VALUES = { ANECDOTAL: 0.25, TRADITIONAL: 0.5, OBSERVED: 0.75, PEER_REVIEWED: 1.0 }

    // Collect unique userIds from COMMUNITY sources to batch-fetch trust scores
    const communityUserIds = [...new Set(
      allSources.filter(s => s.source === 'COMMUNITY' && s.userId).map(s => s.userId!)
    )]
    const userTrustScores = communityUserIds.length > 0
      ? await tx.user.findMany({
          where: { id: { in: communityUserIds } },
          select: { id: true, trustScore: true },
        })
      : []
    const trustByUser = Object.fromEntries(userTrustScores.map(u => [u.id, u.trustScore]))

    const weightedConfidences = allSources.map(s => {
      const base = CONFIDENCE_VALUES[s.confidence]
      if (s.source === 'COMMUNITY' && s.userId) {
        const trust = trustByUser[s.userId] ?? 1.0
        return base * trust
      }
      return base
    })
    const maxConfidence = Math.max(...weightedConfidences)
    await tx.cropRelationship.update({
      where: { id: rel.id },
      data: { confidence: maxConfidence },
    })

    return { id: rel.id, sourceId }
  })

  // Recompute trust score outside transaction (reads own writes)
  await computeAndSaveTrustScore(session.user.id, prisma)

  return NextResponse.json(result, { status: 201 })
}
