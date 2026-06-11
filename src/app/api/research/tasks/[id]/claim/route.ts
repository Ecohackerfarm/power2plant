import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isTrustedResearcher, getSessionUser } from '@/lib/admin-auth'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isTrustedResearcher())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const task = await prisma.externalResearchTask.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (task.status !== 'OPEN') {
    return NextResponse.json({ error: 'Task is not available for claiming' }, { status: 409 })
  }

  const updated = await prisma.externalResearchTask.update({
    where: { id, status: 'OPEN' },
    data: { status: 'CLAIMED', claimedById: user.id, claimedAt: new Date() },
    select: {
      id: true, type: true, status: true, prompt: true, context: true,
      deadline: true, claimedAt: true,
      cropA: { select: { id: true, name: true, botanicalName: true } },
      cropB: { select: { id: true, name: true, botanicalName: true } },
    },
  }).catch(() => null)

  if (!updated) {
    return NextResponse.json({ error: 'Task was claimed by another user' }, { status: 409 })
  }

  return NextResponse.json({ task: updated })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isTrustedResearcher())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const task = await prisma.externalResearchTask.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (task.claimedById !== user.id) {
    return NextResponse.json({ error: 'You have not claimed this task' }, { status: 403 })
  }
  if (task.status !== 'CLAIMED') {
    return NextResponse.json({ error: 'Task cannot be released' }, { status: 409 })
  }

  await prisma.externalResearchTask.update({
    where: { id },
    data: { status: 'OPEN', claimedById: null, claimedAt: null },
  })

  return NextResponse.json({ ok: true })
}
