import prisma from '@/lib/prisma'
import { getCurrentPriceCents } from './research-price'

/** Current pot balance in cents. */
export async function getPotBalanceCents(): Promise<number> {
  const agg = await prisma.potTransaction.groupBy({
    by: ['type'],
    _sum: { amountCents: true },
  })
  const donations = agg.find((r) => r.type === 'DONATION')?._sum.amountCents ?? 0
  const spends = agg.find((r) => r.type === 'SPEND')?._sum.amountCents ?? 0
  return donations - spends
}

/**
 * Records a Ko-fi donation into the pot.
 * Idempotent via kofiTransactionId unique constraint.
 * Returns false if already recorded (duplicate webhook).
 */
export async function recordKofiDonation(
  amountCents: number,
  currency: string,
  kofiTransactionId: string,
): Promise<boolean> {
  try {
    await prisma.potTransaction.create({
      data: { type: 'DONATION', amountCents, currency, kofiTransactionId },
    })
    return true
  } catch {
    return false // duplicate
  }
}

/**
 * Checks if pot balance covers current price; if so, picks top-voted unfunded
 * ResearchRequest not already in queue, creates a ResearchQueue entry, records
 * a SPEND pot transaction, and marks the ResearchRequest as funded.
 * Returns the queue id or null if pot insufficient / no eligible pairs.
 */
export async function tryFundFromPot(): Promise<string | null> {
  const price = await getCurrentPriceCents()
  const balance = await getPotBalanceCents()
  if (balance < price) return null

  return prisma.$transaction(async (tx) => {
    // Top-voted pair not already queued and not already funded
    const request = await tx.researchRequest.findFirst({
      where: {
        funded: false,
        cropBId: { not: null },
        // Exclude pairs already in execution queue
        cropA: {
          researchQueueA: { none: {} },
        },
      },
      orderBy: { voteCount: 'desc' },
      select: { id: true, cropAId: true, cropBId: true },
    })

    if (!request || !request.cropBId) return null

    // Re-check balance inside transaction
    const agg = await tx.potTransaction.groupBy({
      by: ['type'],
      _sum: { amountCents: true },
    })
    const don = agg.find((r) => r.type === 'DONATION')?._sum.amountCents ?? 0
    const spd = agg.find((r) => r.type === 'SPEND')?._sum.amountCents ?? 0
    if (don - spd < price) return null

    const queue = await tx.researchQueue.create({
      data: {
        cropAId: request.cropAId,
        cropBId: request.cropBId,
        triggeredBy: 'POT',
        priceCents: price,
      },
      select: { id: true },
    })

    await tx.potTransaction.create({
      data: { type: 'SPEND', amountCents: price, researchQueueId: queue.id },
    })

    await tx.researchFunder.create({
      data: { researchQueueId: queue.id, source: 'POT' },
    })

    await tx.researchRequest.update({
      where: { id: request.id },
      data: { funded: true },
    })

    return queue.id
  })
}
