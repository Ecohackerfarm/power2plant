import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isAdmin } from '@/lib/admin-auth'

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const items = await prisma.researchRequest.findMany({
    orderBy: [{ funded: 'desc' }, { voteCount: 'desc' }],
    include: {
      cropA: { select: { id: true, name: true, botanicalName: true, commonNames: true } },
      cropB: { select: { id: true, name: true, botanicalName: true, commonNames: true } },
      _count: { select: { votes: true } },
    },
  })

  return NextResponse.json(items)
}

export async function PATCH(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body.id !== 'string' || typeof body.funded !== 'boolean') {
    return NextResponse.json({ error: 'id and funded required' }, { status: 400 })
  }

  const updated = await prisma.researchRequest.update({
    where: { id: body.id as string },
    data: { funded: body.funded as boolean },
  }).catch((e: unknown) => {
    if ((e as { code?: string }).code === 'P2025') return null
    throw e
  })

  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(updated)
}
