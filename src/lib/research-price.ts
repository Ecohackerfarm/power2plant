import prisma from '@/lib/prisma'

/** Returns current research price in cents (latest ResearchPrice row). */
export async function getCurrentPriceCents(): Promise<number> {
  const row = await prisma.researchPrice.findFirst({
    where: { effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: 'desc' },
  })
  return row?.pricePerResearchCents ?? 100
}

/**
 * Records actual LLM cost and computes a new suggested price:
 *   avg(last N costs) * 2, rounded up to nearest 50 cents.
 * Does NOT auto-insert — admin reviews and confirms via admin UI.
 */
export async function computeSuggestedPriceCents(windowSize = 20): Promise<number> {
  const logs = await prisma.researchLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: windowSize,
    select: { costUsd: true },
  })
  if (logs.length === 0) return 100

  const avgUsd =
    logs.reduce((sum, l) => sum + Number(l.costUsd), 0) / logs.length
  const rawCents = avgUsd * 100 * 2 // double for development margin
  return Math.ceil(rawCents / 50) * 50 // round up to nearest 50 cents
}
