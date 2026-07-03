import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { getCurrentPriceCents } from '@/lib/research-price'
import { getPotBalanceCents } from '@/lib/pot'
import { refundCredits } from '@/lib/credits'
import prisma from '@/lib/prisma'

/** GET /api/admin/research-queue — queue list + pot balance + current price */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [queue, priceCents, potBalanceCents] = await Promise.all([
    prisma.researchQueue.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        cropA: { select: { id: true, name: true, botanicalName: true } },
        cropB: { select: { id: true, name: true, botanicalName: true } },
        funders: {
          select: { source: true, user: { select: { id: true, name: true } } },
        },
        log: { select: { model: true, promptTokens: true, completionTokens: true, costUsd: true } },
      },
    }),
    getCurrentPriceCents(),
    getPotBalanceCents(),
  ])

  return NextResponse.json({ queue, priceCents, potBalanceCents })
}

/** POST /api/admin/research-queue — admin manually enqueues a pair */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { cropAId: rawA, cropBId: rawB } = body as Record<string, unknown>
  if (typeof rawA !== 'string' || typeof rawB !== 'string') {
    return NextResponse.json({ error: 'cropAId and cropBId required' }, { status: 400 })
  }

  const [cropAId, cropBId] = rawA < rawB ? [rawA, rawB] : [rawB, rawA]

  const [cropA, cropB] = await Promise.all([
    prisma.crop.findUnique({ where: { id: cropAId }, select: { id: true } }),
    prisma.crop.findUnique({ where: { id: cropBId }, select: { id: true } }),
  ])
  if (!cropA) return NextResponse.json({ error: 'cropA not found' }, { status: 404 })
  if (!cropB) return NextResponse.json({ error: 'cropB not found' }, { status: 404 })

  const priceCents = await getCurrentPriceCents()

  // Check if a user has already paid for this pair — refund them, since admin is covering it
  const existing = await prisma.researchQueue.findUnique({
    where: { cropAId_cropBId: { cropAId, cropBId } },
    include: { funders: { where: { source: 'PERSONAL' }, include: { user: true } } },
  })

  if (existing) {
    if (existing.status === 'PENDING') {
      // Mark as admin-triggered and refund any personal funders
      await prisma.researchQueue.update({
        where: { id: existing.id },
        data: { triggeredBy: 'ADMIN' },
      })
      for (const funder of existing.funders) {
        if (funder.userId) {
          await refundCredits(funder.userId, existing.priceCents, existing.id)
        }
      }
    }
    return NextResponse.json({ queueId: existing.id, alreadyExisted: true })
  }

  const queue = await prisma.researchQueue.create({
    data: {
      cropAId,
      cropBId,
      triggeredBy: 'ADMIN',
      priceCents,
      funders: { create: { source: 'POT' } },
    },
    select: { id: true },
  })

  return NextResponse.json({ queueId: queue.id })
}

/** PATCH /api/admin/research-queue — update queue item status */
export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { id, status } = body as Record<string, unknown>
  if (typeof id !== 'string') return NextResponse.json({ error: 'id required' }, { status: 400 })

  const VALID_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE', 'FAILED']
  if (typeof status !== 'string' || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  const updated = await prisma.researchQueue
    .update({
      where: { id },
      data: {
        status: status as 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'FAILED',
        ...(status === 'IN_PROGRESS' ? { startedAt: new Date() } : {}),
        ...(status === 'DONE' || status === 'FAILED' ? { completedAt: new Date() } : {}),
      },
    })
    .catch((e: unknown) => {
      if ((e as { code?: string }).code === 'P2025') return null
      throw e
    })

  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
