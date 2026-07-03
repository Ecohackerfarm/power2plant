import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getDisplayName, applyTranslations } from '@/lib/recommend'

async function buildTranslationMap(cropIds: string[], locale: string): Promise<Map<string, string[]>> {
  if (locale === 'en' || cropIds.length === 0) return new Map()
  const rows = await prisma.cropTranslation.findMany({
    where: { cropId: { in: cropIds }, locale },
    select: { cropId: true, commonNames: true },
  })
  return new Map(rows.filter(r => r.commonNames.length > 0).map(r => [r.cropId, r.commonNames]))
}

async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const locale = new URL(request.url).searchParams.get('locale') ?? 'en'

  const garden = await prisma.userGarden.findUnique({
    where: { userId: session.user.id },
    include: {
      beds: {
        include: {
          plantings: {
            include: { crop: true },
          },
        },
      },
    },
  })

  if (!garden) {
    return NextResponse.json({ beds: [] })
  }

  const allCropIds = garden.beds.flatMap(b => b.plantings.map(p => p.cropId))
  const tMap = await buildTranslationMap(allCropIds, locale)

  const beds = garden.beds.map((bed) => {
    const translatedPlantings = applyTranslations(
      bed.plantings.map(p => ({ ...p.crop, plantingId: p.id, status: p.status })),
      tMap,
    )
    return {
      id: bed.id,
      name: bed.name,
      plantings: translatedPlantings.map(p => ({
        plantingId: p.plantingId,
        cropId: p.id,
        cropName: getDisplayName(p),
        status: p.status,
      })),
    }
  })

  return NextResponse.json({ beds })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { beds?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const { beds } = body

  if (!Array.isArray(beds)) {
    return NextResponse.json({ error: 'beds must be an array' }, { status: 400 })
  }

  if (beds.length < 1 || beds.length > 20) {
    return NextResponse.json({ error: 'beds must have 1-20 items' }, { status: 400 })
  }

  const allCropIds: string[] = []
  for (let i = 0; i < beds.length; i++) {
    const bed = beds[i]
    if (typeof bed !== 'object' || bed === null) {
      return NextResponse.json({ error: `bed[${i}] must be an object` }, { status: 400 })
    }
    const { name, cropIds } = bed as { name?: unknown; cropIds?: unknown }

    if (typeof name !== 'string' || name.trim() === '' || name.length > 50) {
      return NextResponse.json({ error: `bed[${i}].name must be a non-empty string <= 50 chars` }, { status: 400 })
    }

    if (!Array.isArray(cropIds)) {
      return NextResponse.json({ error: `bed[${i}].cropIds must be an array` }, { status: 400 })
    }

    if (cropIds.length < 1 || cropIds.length > 20) {
      return NextResponse.json({ error: `bed[${i}].cropIds must have 1-20 items` }, { status: 400 })
    }

    for (let j = 0; j < cropIds.length; j++) {
      const cropId = cropIds[j]
      if (typeof cropId !== 'string' || cropId.trim() === '') {
        return NextResponse.json({ error: `bed[${i}].cropIds[${j}] must be a non-empty string` }, { status: 400 })
      }
      allCropIds.push(cropId)
    }
  }

  const existingCrops = await prisma.crop.findMany({
    where: { id: { in: allCropIds } },
    select: { id: true },
  })

  const existingIds = new Set(existingCrops.map((c) => c.id))
  const unknownIds = allCropIds.filter((id) => !existingIds.has(id))

  if (unknownIds.length > 0) {
    return NextResponse.json({ error: 'unknown crop ids', ids: unknownIds }, { status: 422 })
  }

  const garden = await prisma.userGarden.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id },
    update: {},
  })

  const result = await prisma.$transaction(async (tx) => {
    await tx.bed.deleteMany({ where: { gardenId: garden.id } })
    await tx.gardenShare.deleteMany({ where: { userId: session.user.id } })

    const createdBeds = []
    for (const bed of beds) {
      const { name, cropIds } = bed as { name: string; cropIds: string[] }
      const createdBed = await tx.bed.create({
        data: {
          name,
          gardenId: garden.id,
          plantings: {
            create: cropIds.map((cropId) => ({ cropId })),
          },
        },
        include: {
          plantings: { include: { crop: true } },
        },
      })
      createdBeds.push(createdBed)
    }

    return createdBeds
  })

  const locale = new URL(request.url).searchParams.get('locale') ?? 'en'
  const savedCropIds = result.flatMap(b => b.plantings.map(p => p.cropId))
  const tMap = await buildTranslationMap(savedCropIds, locale)

  const responseBeds = result.map((bed) => {
    const translatedPlantings = applyTranslations(
      bed.plantings.map(p => ({ ...p.crop, plantingId: p.id, status: p.status })),
      tMap,
    )
    return {
      id: bed.id,
      name: bed.name,
      plantings: translatedPlantings.map(p => ({
        plantingId: p.plantingId,
        cropId: p.id,
        cropName: getDisplayName(p),
        status: p.status,
      })),
    }
  })

  return NextResponse.json({ beds: responseBeds })
}