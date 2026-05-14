import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'

async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export async function GET(_request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const garden = await prisma.userGarden.findUnique({
    where: { userId: session.user.id },
    select: { lat: true, lng: true, minTempC: true, bedCount: true, bedCapacity: true, wishlist: true },
  })

  return NextResponse.json(garden)
}

export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { lat?: number; lng?: number; minTempC?: number; bedCount?: number; bedCapacity?: number; wishlist?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const { lat, lng, minTempC, bedCount, bedCapacity, wishlist } = body

  // Type validation
  if (lat !== undefined && typeof lat !== 'number') {
    return NextResponse.json({ error: 'lat must be a number' }, { status: 400 })
  }
  if (lng !== undefined && typeof lng !== 'number') {
    return NextResponse.json({ error: 'lng must be a number' }, { status: 400 })
  }
  if (minTempC !== undefined && typeof minTempC !== 'number') {
    return NextResponse.json({ error: 'minTempC must be a number' }, { status: 400 })
  }
  if (bedCount !== undefined && (!Number.isInteger(bedCount) || bedCount < 1)) {
    return NextResponse.json({ error: 'bedCount must be an integer >= 1' }, { status: 400 })
  }
  if (bedCapacity !== undefined && (!Number.isInteger(bedCapacity) || bedCapacity < 1)) {
    return NextResponse.json({ error: 'bedCapacity must be an integer >= 1' }, { status: 400 })
  }

  // Wishlist validation
  if (wishlist !== undefined) {
    if (!Array.isArray(wishlist)) {
      return NextResponse.json({ error: 'wishlist must be an array' }, { status: 400 })
    }
    if (wishlist.length > 50) {
      return NextResponse.json({ error: 'wishlist must have at most 50 items' }, { status: 400 })
    }
    for (const item of wishlist) {
      if (typeof item !== 'string' || item.trim() === '') {
        return NextResponse.json({ error: 'wishlist items must be non-empty strings' }, { status: 400 })
      }
    }
  }

  // Bounds validation
  if (lat !== undefined && (lat < -90 || lat > 90)) {
    return NextResponse.json({ error: 'lat must be between -90 and 90' }, { status: 400 })
  }
  if (lng !== undefined && (lng < -180 || lng > 180)) {
    return NextResponse.json({ error: 'lng must be between -180 and 180' }, { status: 400 })
  }

  const data = {
    ...(lat !== undefined && { lat }),
    ...(lng !== undefined && { lng }),
    ...(minTempC !== undefined && { minTempC }),
    ...(bedCount !== undefined && { bedCount }),
    ...(bedCapacity !== undefined && { bedCapacity }),
    ...(wishlist !== undefined && { wishlist }),
  }

  const [garden] = await prisma.$transaction([
    prisma.userGarden.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, ...data },
      update: data,
      select: { lat: true, lng: true, minTempC: true, bedCount: true, bedCapacity: true, wishlist: true },
    }),
    prisma.gardenShare.deleteMany({ where: { userId: session.user.id } }),
  ])

  return NextResponse.json(garden)
}
