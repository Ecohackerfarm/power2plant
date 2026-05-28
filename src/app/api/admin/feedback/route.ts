import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isAdmin } from '@/lib/admin-auth'
import type { FeedbackMode, FeedbackStatus } from '@prisma/client'

const VALID_FEEDBACK_STATUSES: FeedbackStatus[] = ['OPEN', 'RESOLVED', 'DISMISSED']
const VALID_FEEDBACK_MODES: FeedbackMode[] = ['DATA', 'OTHER']

export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const rawStatus = searchParams.get('status')
  const rawMode = searchParams.get('mode')

  if (rawStatus !== null && !VALID_FEEDBACK_STATUSES.includes(rawStatus as FeedbackStatus)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }
  if (rawMode !== null && !VALID_FEEDBACK_MODES.includes(rawMode as FeedbackMode)) {
    return NextResponse.json({ error: 'invalid mode' }, { status: 400 })
  }

  const status = rawStatus as FeedbackStatus | null
  const mode = rawMode as FeedbackMode | null
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))

  const where = {
    ...(status ? { status } : {}),
    ...(mode ? { mode } : {}),
  }

  const [items, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.feedback.count({ where }),
  ])

  return NextResponse.json({ items, total, page, limit })
}
