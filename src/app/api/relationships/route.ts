import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import prisma from '@/lib/prisma'
import { SOURCE_CONFIDENCE } from '@/lib/source-confidence'
import { auth } from '@/lib/auth'

const VALID_TYPES = ['COMPANION', 'AVOID'] as const
const VALID_REASONS = ['PEST_CONTROL', 'POLLINATION', 'NUTRIENT', 'SHADE', 'ALLELOPATHY', 'OTHER'] as const

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 1.0) return 'Peer-reviewed'
  if (confidence >= 0.75) return 'Observed'
  if (confidence >= 0.5) return 'Traditional'
  return 'Anecdotal'
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? ''
  const cursor = searchParams.get('cursor') ?? undefined
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50)

  const cropFilter = q ? {
    OR: [
      { name: { contains: q, mode: 'insensitive' as const } },
      { botanicalName: { contains: q, mode: 'insensitive' as const } },
      { commonNames: { has: q } },
    ],
  } : undefined

  const relationships = await prisma.cropRelationship.findMany({
    where: {
      ...(cropFilter ? { OR: [{ cropA: cropFilter }, { cropB: cropFilter }] } : {}),
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    take: limit + 1,
    orderBy: { id: 'desc' },
    include: {
      cropA: { select: { id: true, name: true, botanicalName: true } },
      cropB: { select: { id: true, name: true, botanicalName: true } },
      _count: { select: { sources: true } },
    },
  })

  const hasNext = relationships.length > limit
  const results = hasNext ? relationships.slice(0, -1) : relationships
  const nextCursor = hasNext ? results[results.length - 1].id : null

  return NextResponse.json({
    relationships: results.map((r) => ({
      id: r.id,
      type: r.type,
      reason: r.reason,
      confidence: getConfidenceLabel(r.confidence),
      notes: r.notes,
      cropA: r.cropA,
      cropB: r.cropB,
      sourceCount: r._count.sources,
    })),
    nextCursor,
  })
}

async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { cropAId?: unknown; cropBId?: unknown; type?: unknown; reason?: unknown; notes?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const { cropAId, cropBId, type, reason, notes } = body

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
  if (notes !== undefined && (typeof notes !== 'string' || notes.length > 500)) {
    return NextResponse.json({ error: 'notes must be a string of at most 500 chars' }, { status: 400 })
  }

  // Verify both crops exist
  const crops = await prisma.crop.findMany({
    where: { id: { in: [cropAId, cropBId] } },
    select: { id: true },
  })
  if (crops.length < 2) {
    const found = new Set(crops.map(c => c.id))
    const unknown = [cropAId, cropBId].filter(id => !found.has(id))
    return NextResponse.json({ error: 'unknown crop ids', ids: unknown }, { status: 422 })
  }

  // Canonical ordering
  const [canonA, canonB] = cropAId < cropBId ? [cropAId, cropBId] : [cropBId, cropAId]

  // Rate limit: one submission per user per pair per day
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

  // Upsert relationship + create source in transaction
  const result = await prisma.$transaction(async (tx) => {
    const rel = await tx.cropRelationship.upsert({
      where: { cropAId_cropBId: { cropAId: canonA, cropBId: canonB } },
      create: {
        cropAId: canonA,
        cropBId: canonB,
        type: type as (typeof VALID_TYPES)[number],
        direction: 'MUTUAL',
        reason: reason as (typeof VALID_REASONS)[number] | undefined ?? null,
        notes: notes as string | undefined ?? null,
        confidence: 0.25,
      },
      update: {},
    })

    const source = await tx.relationshipSource.create({
      data: {
        relationshipId: rel.id,
        source: 'COMMUNITY',
        confidence: SOURCE_CONFIDENCE[sourceType as any] ?? 'ANECDOTAL',
        notes: notes as string | undefined ?? null,
        userId: session.user.id,
      },
    })

    // Recompute confidence as max across all sources
    const allSources = await tx.relationshipSource.findMany({
      where: { relationshipId: rel.id },
      select: { confidence: true },
    })
    const CONFIDENCE_VALUES = { ANECDOTAL: 0.25, TRADITIONAL: 0.5, OBSERVED: 0.75, PEER_REVIEWED: 1.0 }
    const maxConfidence = Math.max(...allSources.map(s => CONFIDENCE_VALUES[s.confidence]))
    await tx.cropRelationship.update({
      where: { id: rel.id },
      data: { confidence: maxConfidence },
    })

    return { id: rel.id, sourceId: source.id }
  })

  return NextResponse.json(result, { status: 201 })
}
