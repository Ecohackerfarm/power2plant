import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'

async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  const beds = garden.beds.map((bed) => ({
    id: bed.id,
    name: bed.name,
    plantings: bed.plantings.map((p) => ({
      cropId: p.cropId,
      cropName: p.crop.commonNames?.[0] ?? p.crop.name,
    })),
  }))

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

  const responseBeds = result.map((bed) => ({
    id: bed.id,
    name: bed.name,
    plantings: bed.plantings.map((p) => ({
      cropId: p.cropId,
      cropName: p.crop.commonNames?.[0] ?? p.crop.name,
    })),
  }))

  return NextResponse.json({ beds: responseBeds })
}