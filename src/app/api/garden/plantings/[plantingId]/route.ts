import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'

const VALID_STATUSES = ['PLANNED', 'PLANTED', 'HARVESTED'] as const

async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ plantingId: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { plantingId } = await params

  let body: { status?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  if (!VALID_STATUSES.includes(body.status as (typeof VALID_STATUSES)[number])) {
    return NextResponse.json(
      { error: 'status must be PLANNED, PLANTED, or HARVESTED' },
      { status: 400 }
    )
  }

  const planting = await prisma.planting.findUnique({
    where: { id: plantingId },
    include: { bed: { include: { garden: true } } },
  })

  if (!planting || planting.bed.garden.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updated = await prisma.planting.update({
    where: { id: plantingId },
    data: { status: body.status as (typeof VALID_STATUSES)[number] },
  })

  return NextResponse.json({ id: updated.id, status: updated.status })
}
