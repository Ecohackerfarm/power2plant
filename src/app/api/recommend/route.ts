import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { recommend, recommendAlternatives, applyTranslations, pairKey, type RelationshipInput, type CropInput, type ResearchStateMap, type ResearchStatus } from '@/lib/recommend'

interface RecommendBody {
  cropIds: string[]
  bedCount: number
  bedCapacity: number
  minTempC: number
  locale?: string
  existingBeds?: string[][]
}

export async function POST(request: Request) {
  let body: RecommendBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const { cropIds, bedCount, bedCapacity, minTempC, locale = 'en', existingBeds } = body

  if (
    !Array.isArray(cropIds) ||
    cropIds.length === 0 ||
    cropIds.length > 50 ||
    cropIds.some(id => typeof id !== 'string') ||
    !Number.isFinite(bedCount) || bedCount < 1 || bedCount > 100 ||
    !Number.isFinite(bedCapacity) || bedCapacity < 1 || bedCapacity > 100 ||
    !Number.isFinite(minTempC)
  ) {
    return NextResponse.json(
      { error: 'cropIds (1–50 strings), bedCount (1–100), bedCapacity (1–100), minTempC required' },
      { status: 400 },
    )
  }

  if (existingBeds !== undefined) {
    if (!Array.isArray(existingBeds) || existingBeds.length > 20) {
      return NextResponse.json({ error: 'existingBeds must be an array of up to 20 beds' }, { status: 400 })
    }
    for (const bed of existingBeds) {
      if (!Array.isArray(bed) || bed.length > 20) {
        return NextResponse.json({ error: 'each existingBed must be an array of up to 20 crop ids' }, { status: 400 })
      }
      for (const id of bed) {
        if (typeof id !== 'string' || id.trim() === '') {
          return NextResponse.json({ error: 'existingBed crop ids must be non-empty strings' }, { status: 400 })
        }
      }
    }
  }

  const allIds = [...new Set([...cropIds, ...(existingBeds ?? []).flat()])]
  const idList = Prisma.join(allIds.map(id => Prisma.sql`${id}`))
  const [rawCrops, relationships, tMapRows, queueRows] = await Promise.all([
    prisma.$queryRaw<CropInput[]>`
      SELECT id, name, "botanicalName", "minTempC", "commonNames"
      FROM "Crop" WHERE id IN (${idList})
    `,
    prisma.cropRelationship.findMany({
      where: {
        AND: [
          { cropAId: { in: allIds } },
          { cropBId: { in: allIds } },
        ],
      },
      select: { cropAId: true, cropBId: true, type: true, confidence: true, claims: { select: { mechanism: true, explanation: true } }, notes: true },
    }),
    locale !== 'en' && allIds.length > 0
      ? prisma.cropTranslation.findMany({
          where: { cropId: { in: allIds }, locale },
          select: { cropId: true, commonNames: true },
        })
      : Promise.resolve([]),
    // Secondary-research state for in-bed pairs, so surfaces don't re-offer research
    // for pairs already researched (or in flight). ResearchQueue is uniquely indexed
    // on (cropAId, cropBId); this is one small extra query.
    prisma.researchQueue.findMany({
      where: { cropAId: { in: allIds }, cropBId: { in: allIds } },
      select: { cropAId: true, cropBId: true, status: true },
    }),
  ])

  // FAILED is intentionally excluded — a failed job stays re-offerable.
  const researchState: ResearchStateMap = new Map()
  for (const q of queueRows) {
    if (q.status === 'PENDING' || q.status === 'IN_PROGRESS' || q.status === 'DONE') {
      researchState.set(pairKey(q.cropAId, q.cropBId), q.status as ResearchStatus)
    }
  }

  const tMap = new Map(
    tMapRows.filter(r => r.commonNames.length > 0).map(r => [r.cropId, r.commonNames])
  )
  const crops = applyTranslations(rawCrops, tMap)

  // Collapse per-source claims into the {type, explanation} reasons the recommender expects.
  const relInputs = relationships.map(r => {
    const { claims, ...rest } = r
    const seen = new Set<string>()
    const reasons: Array<{ type: string; explanation: string }> = []
    for (const c of claims) {
      if (seen.has(c.mechanism)) continue
      seen.add(c.mechanism)
      reasons.push({ type: c.mechanism, explanation: c.explanation })
    }
    return { ...rest, reasons }
  }) as unknown as RelationshipInput[]

  // With locked beds, skip alternative generation — alternatives don't make sense
  // when some beds are already fixed by existingBeds.
  if (existingBeds) {
    const result = recommend(crops, relInputs, bedCount, bedCapacity, minTempC, existingBeds, researchState)
    return NextResponse.json({ ...result, alternatives: [] })
  }

  const [primary, ...alternatives] = recommendAlternatives(
    crops,
    relInputs,
    bedCount,
    bedCapacity,
    minTempC,
    researchState,
  )

  return NextResponse.json({ ...primary, alternatives })
}
