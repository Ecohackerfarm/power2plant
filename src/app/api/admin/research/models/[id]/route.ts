import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isAdmin } from '@/lib/admin-auth'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const existing = await prisma.researchModel.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: { label?: string; score?: number; allowed?: boolean; notes?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.score !== undefined && (typeof body.score !== 'number' || body.score < 0 || body.score > 100)) {
    return NextResponse.json({ error: 'score must be 0–100' }, { status: 422 })
  }

  const model = await prisma.researchModel.update({
    where: { id },
    data: {
      ...(body.label !== undefined && { label: body.label }),
      ...(body.score !== undefined && { score: body.score }),
      ...(body.allowed !== undefined && { allowed: body.allowed }),
      ...(body.notes !== undefined && { notes: body.notes }),
    },
  })

  return NextResponse.json({ model })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const existing = await prisma.researchModel.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.researchModel.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
