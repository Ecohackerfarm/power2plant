import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import prisma from '@/lib/prisma'

/** GET /api/admin/research-queue/[id]/log — full session detail (prompt + raw response) for one queue item */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const log = await prisma.researchLog.findUnique({ where: { researchQueueId: id } })
  if (!log) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({ log })
}
