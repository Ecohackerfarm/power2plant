import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isAdmin } from '@/lib/admin-auth'
import { ExternalResearchTaskStatus } from '@prisma/client'

const VALID_STATUSES = new Set<ExternalResearchTaskStatus>([
  'OPEN', 'CLAIMED', 'SUBMITTED', 'REVIEW_PENDING', 'REVIEW_CLAIMED', 'REVIEWED', 'REJECTED',
])

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const task = await prisma.externalResearchTask.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: { status?: string; reviewNote?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}

  if (body.status !== undefined) {
    if (!VALID_STATUSES.has(body.status as ExternalResearchTaskStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 422 })
    }
    data.status = body.status
    if (body.status === 'REVIEWED' || body.status === 'REJECTED') {
      data.reviewedAt = new Date()
    }
  }

  if (body.reviewNote !== undefined) {
    data.reviewNote = body.reviewNote
  }

  const updated = await prisma.externalResearchTask.update({
    where: { id },
    data,
    select: {
      id: true, type: true, status: true, reviewNote: true, reviewedAt: true,
      claimedBy: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({ task: updated })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const task = await prisma.externalResearchTask.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.externalResearchTask.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
