import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { recommend, recommendAlternatives, type RelationshipInput, type CropInput } from '@/lib/recommend'

interface RecommendBody {
  cropIds: string[]
  bedCount: number
  bedCapacity: number
  minTempC: number
  existingBeds?: string[][]
}

export async function POST(request: Request) {
  let body: RecommendBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const { cropIds, bedCount, bedCapacity, minTempC, existingBeds } = body

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
  const [crops, relationships] = await Promise.all([
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
      select: { cropAId: true, cropBId: true, type: true, confidence: true, reason: true, notes: true },
    }),
  ])

  // With locked beds, skip alternative generation — alternatives don't make sense
  // when some beds are already fixed by existingBeds.
  if (existingBeds) {
    const result = recommend(crops, relationships as RelationshipInput[], bedCount, bedCapacity, minTempC, existingBeds)
    return NextResponse.json({ ...result, alternatives: [] })
  }

  const [primary, ...alternatives] = recommendAlternatives(
    crops,
    relationships as RelationshipInput[],
    bedCount,
    bedCapacity,
    minTempC,
  )

  return NextResponse.json({ ...primary, alternatives })
}
