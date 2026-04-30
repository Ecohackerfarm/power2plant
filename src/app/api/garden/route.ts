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
    select: { lat: true, lng: true, minTempC: true, bedCount: true, bedCapacity: true },
  })

  return NextResponse.json(garden)
}

export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { lat?: number; lng?: number; minTempC?: number; bedCount?: number; bedCapacity?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const { lat, lng, minTempC, bedCount, bedCapacity } = body

  const data = {
    ...(lat !== undefined && { lat }),
    ...(lng !== undefined && { lng }),
    ...(minTempC !== undefined && { minTempC }),
    ...(bedCount !== undefined && bedCount >= 1 && { bedCount }),
    ...(bedCapacity !== undefined && bedCapacity >= 1 && { bedCapacity }),
  }

  const garden = await prisma.userGarden.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...data },
    update: data,
    select: { lat: true, lng: true, minTempC: true, bedCount: true, bedCapacity: true },
  })

  return NextResponse.json(garden)
}
