import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'

async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const garden = await prisma.userGarden.findUnique({
    where: { userId: session.user.id },
    select: { inspirations: true },
  })

  const inspirationIds = garden?.inspirations ?? []
  if (inspirationIds.length === 0) return NextResponse.json({ inspirations: [] })

  const crops = await prisma.crop.findMany({
    where: { id: { in: inspirationIds } },
    select: { id: true, name: true, botanicalName: true, commonNames: true },
  })

  // Preserve insertion order
  const cropMap = new Map(crops.map(c => [c.id, c]))
  const ordered = inspirationIds.flatMap(id => {
    const c = cropMap.get(id)
    return c ? [c] : []
  })

  return NextResponse.json({ inspirations: ordered })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { cropId?: string; action?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const { cropId, action } = body
  if (typeof cropId !== 'string' || cropId.trim() === '') {
    return NextResponse.json({ error: 'cropId required' }, { status: 400 })
  }
  if (action !== 'add' && action !== 'remove') {
    return NextResponse.json({ error: 'action must be add or remove' }, { status: 400 })
  }

  const existing = await prisma.userGarden.findUnique({
    where: { userId: session.user.id },
    select: { inspirations: true },
  })

  let next: string[]
  if (action === 'add') {
    const current = existing?.inspirations ?? []
    next = current.includes(cropId) ? current : [...current, cropId]
  } else {
    next = (existing?.inspirations ?? []).filter(id => id !== cropId)
  }

  await prisma.userGarden.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, inspirations: next },
    update: { inspirations: { set: next } },
  })

  return NextResponse.json({ inspirations: next })
}
