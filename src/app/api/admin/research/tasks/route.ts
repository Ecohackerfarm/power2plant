import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isAdmin } from '@/lib/admin-auth'

const TASK_SELECT = {
  id: true, type: true, status: true, prompt: true, context: true,
  deadline: true, agentModel: true, claimedAt: true, submittedAt: true,
  reviewNote: true, reviewedAt: true, createdAt: true, updatedAt: true,
  claimedBy: { select: { id: true, name: true, email: true } },
  cropA: { select: { id: true, name: true, botanicalName: true } },
  cropB: { select: { id: true, name: true, botanicalName: true } },
  importedRelationshipId: true,
  reviewTaskId: true,
} as const

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const tasks = await prisma.externalResearchTask.findMany({
    orderBy: { createdAt: 'desc' },
    select: TASK_SELECT,
  })

  return NextResponse.json({ tasks })
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { cropAId?: string; cropBId?: string; prompt: string; context?: object; deadline?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 422 })
  }

  const task = await prisma.externalResearchTask.create({
    data: {
      type: 'RESEARCH',
      cropAId: body.cropAId ?? null,
      cropBId: body.cropBId ?? null,
      prompt: body.prompt.trim(),
      context: body.context ?? undefined,
      deadline: body.deadline ? new Date(body.deadline) : null,
      status: 'OPEN',
    },
    select: TASK_SELECT,
  })

  return NextResponse.json({ task }, { status: 201 })
}
