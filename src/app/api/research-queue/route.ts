import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getCurrentPriceCents } from '@/lib/research-price'
import { spendCreditsForResearch, getBalance, AlreadyQueuedError, InsufficientCreditsError } from '@/lib/credits'
import { awardResearchBadges } from '@/lib/badges'
import prisma from '@/lib/prisma'

/** GET /api/research-queue — current price + user balance */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  const priceCents = await getCurrentPriceCents()
  const balanceCents = session ? await getBalance(session.user.id) : null
  return NextResponse.json({ priceCents, balanceCents })
}

/** POST /api/research-queue — spend credits to queue research for a pair */
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

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
  if (rawA === rawB) {
    return NextResponse.json({ error: 'crops must differ' }, { status: 400 })
  }

  // Normalize: ensure cropAId < cropBId
  const [cropAId, cropBId] = rawA < rawB ? [rawA, rawB] : [rawB, rawA]

  // Verify both crops exist
  const [cropA, cropB] = await Promise.all([
    prisma.crop.findUnique({ where: { id: cropAId }, select: { id: true } }),
    prisma.crop.findUnique({ where: { id: cropBId }, select: { id: true } }),
  ])
  if (!cropA) return NextResponse.json({ error: 'cropA not found' }, { status: 404 })
  if (!cropB) return NextResponse.json({ error: 'cropB not found' }, { status: 404 })

  const priceCents = await getCurrentPriceCents()

  try {
    const queueId = await spendCreditsForResearch(
      session.user.id,
      cropAId,
      cropBId,
      priceCents,
    )
    await awardResearchBadges(session.user.id, cropAId, cropBId)
    const balance = await getBalance(session.user.id)
    return NextResponse.json({ queueId, priceCents, balanceCents: balance })
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: 'insufficient_credits', required: e.required, balance: e.balance },
        { status: 402 },
      )
    }
    if (e instanceof AlreadyQueuedError) {
      return NextResponse.json({ error: 'already_queued', queueId: e.queueId }, { status: 409 })
    }
    throw e
  }
}
