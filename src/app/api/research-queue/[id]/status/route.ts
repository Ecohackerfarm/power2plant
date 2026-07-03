import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params

  const item = await prisma.researchQueue.findUnique({
    where: { id },
    select: { status: true, createdAt: true, startedAt: true, completedAt: true },
  })

  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Position = number of PENDING items created before this one
  const position = item.status === 'PENDING'
    ? await prisma.researchQueue.count({
        where: { status: 'PENDING', createdAt: { lt: item.createdAt } },
      })
    : 0

  // Average minutes per completed job (last 20)
  const completed = await prisma.$queryRaw<Array<{ avg_seconds: number | null }>>`
    SELECT AVG(EXTRACT(EPOCH FROM ("completedAt" - "startedAt"))) AS avg_seconds
    FROM (
      SELECT "startedAt", "completedAt"
      FROM "ResearchQueue"
      WHERE status = 'DONE'
        AND "startedAt" IS NOT NULL
        AND "completedAt" IS NOT NULL
      ORDER BY "completedAt" DESC
      LIMIT 20
    ) sub
  `
  const avgSeconds = completed[0]?.avg_seconds ?? null
  const avgMinutes = avgSeconds !== null ? avgSeconds / 60 : null
  const estimatedMinutes = avgMinutes !== null ? Math.ceil((position + 1) * avgMinutes) : null

  return NextResponse.json({
    status: item.status,
    position,
    estimatedMinutes,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
  })
}
