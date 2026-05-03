import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { recommend, type RelationshipInput, type CropInput } from '@/lib/recommend'

interface RecommendBody {
  cropIds: string[]
  bedCount: number
  bedCapacity: number
  minTempC: number
}

export async function POST(request: Request) {
  let body: RecommendBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const { cropIds, bedCount, bedCapacity, minTempC } = body

  if (
    !Array.isArray(cropIds) ||
    cropIds.length === 0 ||
    cropIds.length > 50 ||
    cropIds.some(id => typeof id !== 'string') ||
    typeof bedCount !== 'number' || bedCount < 1 ||
    typeof bedCapacity !== 'number' || bedCapacity < 1 ||
    typeof minTempC !== 'number'
  ) {
    return NextResponse.json(
      { error: 'cropIds (1–50 strings), bedCount (≥1), bedCapacity (≥1), minTempC required' },
      { status: 400 },
    )
  }

  const idList = Prisma.join(cropIds.map(id => Prisma.sql`${id}`))
  const [crops, relationships] = await Promise.all([
    prisma.$queryRaw<CropInput[]>`
      SELECT id, name, "botanicalName", "minTempC", "commonNames"
      FROM "Crop" WHERE id IN (${idList})
    `,
    prisma.cropRelationship.findMany({
      where: {
        AND: [
          { cropAId: { in: cropIds } },
          { cropBId: { in: cropIds } },
        ],
      },
      select: { cropAId: true, cropBId: true, type: true, confidence: true },
    }),
  ])

  const result = recommend(crops, relationships as RelationshipInput[], bedCount, bedCapacity, minTempC)

  return NextResponse.json(result)
}
