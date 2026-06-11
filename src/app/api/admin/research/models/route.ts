import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isAdmin } from '@/lib/admin-auth'

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const models = await prisma.researchModel.findMany({ orderBy: { score: 'desc' } })
  return NextResponse.json({ models })
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { id: string; label: string; score: number; notes?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.id?.trim() || !body.label?.trim()) {
    return NextResponse.json({ error: 'id and label are required' }, { status: 422 })
  }
  if (typeof body.score !== 'number' || body.score < 0 || body.score > 100) {
    return NextResponse.json({ error: 'score must be 0–100' }, { status: 422 })
  }

  const existing = await prisma.researchModel.findUnique({ where: { id: body.id } })
  if (existing) return NextResponse.json({ error: 'Model already exists' }, { status: 409 })

  const model = await prisma.researchModel.create({
    data: { id: body.id, label: body.label, score: body.score, notes: body.notes ?? null },
  })

  return NextResponse.json({ model }, { status: 201 })
}
