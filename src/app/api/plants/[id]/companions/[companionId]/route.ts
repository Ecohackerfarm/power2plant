import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { detectRank, extractGenusWord } from '@/lib/crop-rank'

type ReasonRow = { type: string; explanation: string }

type RelRow = {
  relId: string; type: string; reasons: ReasonRow[]; confidence: number
  notes: string | null; direction: string
  cropAId: string; cropAName: string; cropABotanical: string; cropACommonNames: string[]
  cropANitrogen: boolean
  cropBId: string; cropBName: string; cropBBotanical: string; cropBCommonNames: string[]
  cropBNitrogen: boolean
}

type GenusRow = { id: string; botanicalName: string }

async function findRelationship(cropAId: string, cropBId: string): Promise<RelRow | null> {
  const rows = await prisma.$queryRaw<RelRow[]>`
    SELECT
      cr.id AS "relId", cr.type, cr.confidence, cr.notes, cr.direction,
      COALESCE((
        SELECT json_agg(json_build_object('type', rr.mechanism, 'explanation', rr.explanation))
        FROM "RelationshipClaim" rr WHERE rr."relationshipId" = cr.id
      ), '[]'::json) AS reasons,
      ca.id AS "cropAId", ca.name AS "cropAName", ca."botanicalName" AS "cropABotanical",
      ca."commonNames" AS "cropACommonNames", ca."isNitrogenFixer" AS "cropANitrogen",
      cb.id AS "cropBId", cb.name AS "cropBName", cb."botanicalName" AS "cropBBotanical",
      cb."commonNames" AS "cropBCommonNames", cb."isNitrogenFixer" AS "cropBNitrogen"
    FROM "CropRelationship" cr
    JOIN "Crop" ca ON cr."cropAId" = ca.id
    JOIN "Crop" cb ON cr."cropBId" = cb.id
    WHERE (cr."cropAId" = ${cropAId} AND cr."cropBId" = ${cropBId})
       OR (cr."cropAId" = ${cropBId} AND cr."cropBId" = ${cropAId})
  `
  return rows[0] ?? null
}

async function findGenusCrop(botanicalName: string): Promise<GenusRow | null> {
  const genusWord = extractGenusWord(botanicalName).replace(/[$()*+.[\]?\\^{}|]/g, '\\$&')
  const rows = await prisma.$queryRaw<GenusRow[]>`
    SELECT id, "botanicalName" FROM "Crop"
    WHERE "botanicalName" ~ ${`^${genusWord} [A-Z]`}
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; companionId: string }> },
) {
  const { id, companionId } = await params
  const locale = new URL(req.url).searchParams.get('locale') ?? 'en'

  // Try direct relationship
  const directRel = await findRelationship(id, companionId)

  let rel: RelRow | null = directRel
  let genusA: GenusRow | undefined
  let genusB: GenusRow | undefined
  let resolvedToGenus = false

  if (!rel) {
    // Genus fallback: only when both are species
    const cropRows = await prisma.$queryRaw<Array<{ id: string; botanicalName: string }>>`
      SELECT id, "botanicalName" FROM "Crop" WHERE id IN (${id}, ${companionId})
    `
    const cropA = cropRows.find(r => r.id === id)
    const cropB = cropRows.find(r => r.id === companionId)

    if (
      cropA && cropB &&
      detectRank(cropA.botanicalName) === 'species' &&
      detectRank(cropB.botanicalName) === 'species'
    ) {
      const [genusForA, genusForB] = await Promise.all([
        findGenusCrop(cropA.botanicalName),
        findGenusCrop(cropB.botanicalName),
      ])

      if (genusForA && genusForB) {
        const genusRel = await findRelationship(genusForA.id, genusForB.id)
        if (genusRel) {
          rel = genusRel
          genusA = genusForA
          genusB = genusForB
          resolvedToGenus = true
        }
      }
    }
  }

  // Query research attempts for this pair regardless of whether a relationship was found
  const [cA, cB] = id < companionId ? [id, companionId] : [companionId, id]
  const researchAttempts = await prisma.relationshipResearchAttempt.findMany({
    where: { cropAId: cA, cropBId: cB },
    select: { id: true, model: true, result: true, confidence: true, notes: true, attemptedAt: true },
    orderBy: { attemptedAt: 'desc' },
  })

  if (!rel) {
    if (researchAttempts.length === 0) {
      return NextResponse.json({ error: 'relationship not found' }, { status: 404 })
    }
    return NextResponse.json({
      relationship: null,
      sources: [],
      researchAttempts: researchAttempts.map(a => ({ ...a, attemptedAt: a.attemptedAt.toISOString() })),
    })
  }

  const rawSources = await prisma.relationshipSource.findMany({
    where: { relationshipId: rel.relId },
    select: { source: true, sourceType: true, confidence: true, url: true, notes: true, fetchedAt: true, userId: true },
    orderBy: { confidence: 'desc' },
  })

  const community: (typeof rawSources)[number][] = []
  const other: (typeof rawSources)[number][] = []
  for (const s of rawSources) {
    if (s.source === 'COMMUNITY') community.push(s)
    else other.push(s)
  }

  const groupedCommunity: Array<{
    source: string
    confidence: string
    notes: string | null
    fetchedAt: string
    urls: Array<{ url: string; sourceType: string | null; confidence: string }>
  }> = []

  const groups = new Map<string, typeof community>()
  for (const s of community) {
    const date = s.fetchedAt.toISOString().slice(0, 10)
    const key = `${s.userId ?? 'anon'}|${date}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }

  for (const rows of groups.values()) {
    const testimony = rows.find(r => !r.url) ?? rows[0]
    const urls = rows.filter(r => r.url).map(r => ({
      url: r.url!,
      sourceType: r.sourceType,
      confidence: r.confidence,
    }))
    groupedCommunity.push({
      source: 'COMMUNITY',
      confidence: testimony.confidence,
      notes: testimony.notes,
      fetchedAt: testimony.fetchedAt.toISOString(),
      urls,
    })
  }

  const sources = [
    ...other.map(s => ({
      source: s.source,
      confidence: s.confidence,
      url: s.url,
      notes: s.notes,
      fetchedAt: s.fetchedAt.toISOString(),
      sourceType: s.sourceType,
    })),
    ...groupedCommunity,
  ]

  // Fetch genus sources for species relationships (case: direct rel exists but genus also has sources)
  let genusSources: typeof sources = []
  if (!resolvedToGenus && rel) {
    const cropRows2 = await prisma.$queryRaw<Array<{ id: string; botanicalName: string }>>`
      SELECT id, "botanicalName" FROM "Crop" WHERE id IN (${rel.cropAId}, ${rel.cropBId})
    `
    const cA2 = cropRows2.find(r => r.id === rel!.cropAId)
    const cB2 = cropRows2.find(r => r.id === rel!.cropBId)
    if (
      cA2 && cB2 &&
      detectRank(cA2.botanicalName) === 'species' &&
      detectRank(cB2.botanicalName) === 'species'
    ) {
      const [gA, gB] = await Promise.all([findGenusCrop(cA2.botanicalName), findGenusCrop(cB2.botanicalName)])
      if (gA && gB) {
        const genusRel = await findRelationship(gA.id, gB.id)
        if (genusRel && genusRel.relId !== rel.relId) {
          const genusSrcRaw = await prisma.relationshipSource.findMany({
            where: { relationshipId: genusRel.relId },
            select: { source: true, sourceType: true, confidence: true, url: true, notes: true, fetchedAt: true },
            orderBy: { confidence: 'desc' },
          })
          const existingUrls = new Set(sources.filter(s => s.url).map(s => s.url))
          genusSources = genusSrcRaw
            .filter(s => !s.url || !existingUrls.has(s.url))
            .map(s => ({
              source: s.source,
              confidence: s.confidence,
              url: s.url,
              notes: s.notes,
              fetchedAt: s.fetchedAt.toISOString(),
              sourceType: s.sourceType,
            }))
        }
      }
    }
  }

  if (locale !== 'en') {
    const translations = await prisma.cropTranslation.findMany({
      where: { cropId: { in: [rel.cropAId, rel.cropBId] }, locale },
      select: { cropId: true, commonNames: true },
    })
    const tMap = new Map(translations.filter(t => t.commonNames.length > 0).map(t => [t.cropId, t.commonNames]))
    if (tMap.has(rel.cropAId)) rel = { ...rel, cropACommonNames: tMap.get(rel.cropAId)! }
    if (tMap.has(rel.cropBId)) rel = { ...rel, cropBCommonNames: tMap.get(rel.cropBId)! }
  }

  return NextResponse.json({
    relationship: {
      ...rel,
      ...(resolvedToGenus ? { resolvedToGenus: true, genusA, genusB } : {}),
    },
    sources,
    genusSources,
    researchAttempts: researchAttempts.map(a => ({ ...a, attemptedAt: a.attemptedAt.toISOString() })),
  })
}
