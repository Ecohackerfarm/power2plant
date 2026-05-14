import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { randomBytes } from 'crypto'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'

async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export async function POST(_request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const beds = await prisma.bed.findMany({
    where: { garden: { userId: session.user.id } },
    select: {
      name: true,
      plantings: {
        select: { crop: { select: { id: true, name: true, botanicalName: true } } },
      },
    },
    orderBy: { name: 'asc' },
  })

  if (beds.length === 0) {
    return NextResponse.json({ error: 'No beds to share' }, { status: 400 })
  }

  const token = randomBytes(16).toString('hex') // 32 hex chars — 128 bits, unguessable
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  const snapshot = beds.map(b => ({
    name: b.name,
    plants: b.plantings.map(p => ({ id: p.crop.id, name: p.crop.name, botanicalName: p.crop.botanicalName })),
  }))

  // Delete any existing share for this user before creating a new one
  await prisma.gardenShare.deleteMany({ where: { userId: session.user.id } })
  await prisma.gardenShare.create({
    data: { token, userId: session.user.id, beds: snapshot, expiresAt },
  })

  return NextResponse.json({ token }, { status: 201 })
}
