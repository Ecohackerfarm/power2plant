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

  // Attach queue entry info for every pair (not just `funded` ones) — the credit and
  // admin funding paths create a ResearchQueue row without ever setting `funded`, so
  // gating on `funded` hid their status. Also flag whether a relationship exists, so
  // the UI can distinguish "Researched" from "Researched · no studies found".
  const pairRequests = requests.filter(r => r.cropBId)
  const pairFilter = pairRequests.map(r => ({ cropAId: r.cropAId, cropBId: r.cropBId! }))
  let queueEntries: { id: string; status: string; cropAId: string; cropBId: string }[] = []
  let relPairs: { cropAId: string; cropBId: string }[] = []
  if (pairRequests.length > 0) {
    [queueEntries, relPairs] = await Promise.all([
      prisma.researchQueue.findMany({
        where: { OR: pairFilter },
        select: { id: true, status: true, cropAId: true, cropBId: true },
      }),
      prisma.cropRelationship.findMany({
        where: { OR: pairFilter },
        select: { cropAId: true, cropBId: true },
      }),
    ])
  }

  return NextResponse.json(
    requests.map(r => {
      const queueEntry = r.cropBId
        ? queueEntries.find(q => q.cropAId === r.cropAId && q.cropBId === r.cropBId)
        : undefined
      const hasStudies = r.cropBId
        ? relPairs.some(p => p.cropAId === r.cropAId && p.cropBId === r.cropBId)
        : false
      return {
        id: r.id,
        cropAId: r.cropAId,
        cropBId: r.cropBId,
        voteCount: r.voteCount,
        funded: r.funded,
        createdAt: r.createdAt,
        cropA: r.cropA,
        cropB: r.cropB,
        hasVoted: session ? (r.votes?.length ?? 0) > 0 : false,
        queueId: queueEntry?.id ?? null,
        queueStatus: queueEntry?.status ?? null,
        hasStudies,
      }
    })
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
  if (typeof raw.cropAId !== 'string') {
    return NextResponse.json({ error: 'cropAId required' }, { status: 400 })
  }

  // cropBId is optional — omit or null for a single-plant request
  const hasCropB = raw.cropBId !== undefined && raw.cropBId !== null
  if (hasCropB && typeof raw.cropBId !== 'string') {
    return NextResponse.json({ error: 'cropBId must be a string' }, { status: 400 })
  }
  if (hasCropB && raw.cropAId === raw.cropBId) {
    return NextResponse.json({ error: 'cropAId and cropBId must differ' }, { status: 400 })
  }

  // Normalise pair order so smaller ID is always cropA
  const cropAId = hasCropB
    ? (raw.cropAId < (raw.cropBId as string) ? raw.cropAId : raw.cropBId as string)
    : raw.cropAId
  const cropBId: string | null = hasCropB
    ? (raw.cropAId < (raw.cropBId as string) ? raw.cropBId as string : raw.cropAId)
    : null

  const cropA = await prisma.crop.findUnique({ where: { id: cropAId }, select: { id: true } })
  if (!cropA) return NextResponse.json({ error: 'crop not found' }, { status: 404 })

  if (cropBId) {
    const cropB = await prisma.crop.findUnique({ where: { id: cropBId }, select: { id: true } })
    if (!cropB) return NextResponse.json({ error: 'crop not found' }, { status: 404 })
  }

  const result = await prisma.$transaction(async (tx) => {
    // findFirst + create because Prisma can't upsert on partial DB indexes
    let request = await tx.researchRequest.findFirst({
      where: cropBId ? { cropAId, cropBId } : { cropAId, cropBId: null },
    })
    if (!request) {
      request = await tx.researchRequest.create({
        data: { cropAId, cropBId, voteCount: 0 },
      })
    }

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
