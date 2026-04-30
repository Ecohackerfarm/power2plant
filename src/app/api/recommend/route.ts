import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { recommend } from '@/lib/recommend'

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
    typeof bedCount !== 'number' ||
    typeof bedCapacity !== 'number' ||
    typeof minTempC !== 'number'
  ) {
    return NextResponse.json(
      { error: 'cropIds (non-empty array), bedCount, bedCapacity, minTempC are required' },
      { status: 400 },
    )
  }

  const [crops, relationships] = await Promise.all([
    prisma.crop.findMany({
      where: { id: { in: cropIds } },
      select: { id: true, name: true, botanicalName: true, minTempC: true },
    }),
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

  const result = recommend(crops, relationships as any, bedCount, bedCapacity, minTempC)

  return NextResponse.json(result)
}
