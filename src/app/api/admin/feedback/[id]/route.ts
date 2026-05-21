import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isAdmin } from '@/lib/admin-auth'
import type { FeedbackStatus } from '@prisma/client'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const { status, resolvedNote } = body as { status?: FeedbackStatus; resolvedNote?: string }
  if (status !== 'RESOLVED' && status !== 'DISMISSED') {
    return NextResponse.json({ error: 'status must be RESOLVED or DISMISSED' }, { status: 400 })
  }

  const updated = await prisma.feedback.update({
    where: { id },
    data: {
      status,
      resolvedAt: status === 'RESOLVED' ? new Date() : undefined,
      resolvedNote: typeof resolvedNote === 'string' ? resolvedNote : null,
    },
  }).catch(() => null)

  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json(updated)
}
