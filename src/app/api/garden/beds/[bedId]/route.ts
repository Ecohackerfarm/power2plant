import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, c => c.toUpperCase())
}

async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

async function getBedWithOwnership(bedId: string, userId: string) {
  return prisma.bed.findFirst({
    where: { id: bedId, garden: { userId } },
    include: { plantings: { include: { crop: true } } },
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ bedId: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { bedId } = await params
  const locale = new URL(request.url).searchParams.get('locale') ?? 'en'

  let body: { name?: unknown; cropIds?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const { name, cropIds } = body

  if (name !== undefined && (typeof name !== 'string' || name.trim() === '' || name.length > 50)) {
    return NextResponse.json({ error: 'name must be a non-empty string <= 50 chars' }, { status: 400 })
  }

  if (cropIds !== undefined) {
    if (!Array.isArray(cropIds)) return NextResponse.json({ error: 'cropIds must be an array' }, { status: 400 })
    if (cropIds.length < 1 || cropIds.length > 20) return NextResponse.json({ error: 'cropIds must have 1-20 items' }, { status: 400 })
    for (const id of cropIds) {
      if (typeof id !== 'string' || id.trim() === '') return NextResponse.json({ error: 'cropIds must be strings' }, { status: 400 })
    }
  }

  const bed = await getBedWithOwnership(bedId, session.user.id)
  if (!bed) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (cropIds !== undefined) {
    const existing = await prisma.crop.findMany({ where: { id: { in: cropIds as string[] } }, select: { id: true } })
    const found = new Set(existing.map(c => c.id))
    const unknown = (cropIds as string[]).filter(id => !found.has(id))
    if (unknown.length > 0) return NextResponse.json({ error: 'unknown crop ids', ids: unknown }, { status: 422 })
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (name !== undefined) {
      await tx.bed.update({ where: { id: bedId }, data: { name: (name as string).trim() } })
    }
    if (cropIds !== undefined) {
      await tx.planting.deleteMany({ where: { bedId } })
      await tx.planting.createMany({
        data: (cropIds as string[]).map(cropId => ({ bedId, cropId })),
      })
    }
    return tx.bed.findUnique({
      where: { id: bedId },
      include: { plantings: { include: { crop: true } } },
    })
  })

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const allCropIds = updated.plantings.map(p => p.cropId)
  let tMap: Map<string, string[]> = new Map()
  if (locale !== 'en' && allCropIds.length > 0) {
    const rows = await prisma.cropTranslation.findMany({
      where: { cropId: { in: allCropIds }, locale },
      select: { cropId: true, commonNames: true },
    })
    tMap = new Map(rows.filter(r => r.commonNames.length > 0).map(r => [r.cropId, r.commonNames]))
  }

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    plantings: updated.plantings.map(p => ({
      plantingId: p.id,
      cropId: p.cropId,
      cropName: toTitleCase(tMap.get(p.cropId)?.[0] ?? p.crop.commonNames?.[0] ?? (p.crop.name !== p.crop.botanicalName ? p.crop.name : p.crop.botanicalName)),
      status: p.status,
    })),
  })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ bedId: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { bedId } = await params

  const bed = await prisma.bed.findFirst({
    where: { id: bedId, garden: { userId: session.user.id } },
  })
  if (!bed) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.bed.delete({ where: { id: bedId } })

  return NextResponse.json({ ok: true })
}
