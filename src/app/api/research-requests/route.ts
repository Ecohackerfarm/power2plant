import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'

async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export async function GET() {
  const session = await getSession()

  const requests = await prisma.researchRequest.findMany({
    orderBy: { voteCount: 'desc' },
    include: {
      cropA: { select: { id: true, name: true, botanicalName: true, commonNames: true } },
      cropB: { select: { id: true, name: true, botanicalName: true, commonNames: true } },
      votes: session
        ? { where: { userId: session.user.id }, select: { id: true } }
        : false,
    },
  })

  return NextResponse.json(
    requests.map(r => ({
      id: r.id,
      cropAId: r.cropAId,
      cropBId: r.cropBId,
      voteCount: r.voteCount,
      createdAt: r.createdAt,
      cropA: r.cropA,
      cropB: r.cropB,
      hasVoted: session ? (r.votes?.length ?? 0) > 0 : false,
    }))
  )
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const raw = body as { cropAId?: unknown; cropBId?: unknown }
  if (typeof raw.cropAId !== 'string' || typeof raw.cropBId !== 'string') {
    return NextResponse.json({ error: 'cropAId and cropBId required' }, { status: 400 })
  }
  if (raw.cropAId === raw.cropBId) {
    return NextResponse.json({ error: 'cropAId and cropBId must differ' }, { status: 400 })
  }

  // Normalize: smaller ID always goes to cropAId (matches recommend.ts pairKey logic)
  const cropAId = raw.cropAId < raw.cropBId ? raw.cropAId : raw.cropBId
  const cropBId = raw.cropAId < raw.cropBId ? raw.cropBId : raw.cropAId

  const [cropA, cropB] = await Promise.all([
    prisma.crop.findUnique({ where: { id: cropAId }, select: { id: true } }),
    prisma.crop.findUnique({ where: { id: cropBId }, select: { id: true } }),
  ])
  if (!cropA || !cropB) {
    return NextResponse.json({ error: 'crop not found' }, { status: 404 })
  }

  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.researchRequest.upsert({
      where: { cropAId_cropBId: { cropAId, cropBId } },
      create: { cropAId, cropBId, voteCount: 0 },
      update: {},
    })

    const existing = await tx.researchRequestVote.findUnique({
      where: { requestId_userId: { requestId: request.id, userId: session.user.id } },
    })

    if (existing) {
      return { alreadyVoted: true, voteCount: request.voteCount }
    }

    await tx.researchRequestVote.create({
      data: { requestId: request.id, userId: session.user.id },
    })
    const updated = await tx.researchRequest.update({
      where: { id: request.id },
      data: { voteCount: { increment: 1 } },
    })

    return { alreadyVoted: false, voteCount: updated.voteCount }
  })

  return NextResponse.json(result)
}
