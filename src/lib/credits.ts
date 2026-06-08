import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const MIN_TOPUP_CENTS = 200 // €2.00 minimum

export async function getBalance(userId: string): Promise<number> {
  const credit = await prisma.userCredit.findUnique({ where: { userId } })
  return credit?.balanceCents ?? 0
}

/**
 * Atomically deducts priceCents from user balance and creates a SPEND transaction.
 * Returns the ResearchQueue entry id that was created/found.
 * Throws if balance insufficient or pair already queued.
 */
export async function spendCreditsForResearch(
  userId: string,
  cropAId: string,
  cropBId: string,
  priceCents: number,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    // Upsert credit row with pessimistic lock
    const credit = await tx.userCredit.upsert({
      where: { userId },
      create: { userId, balanceCents: 0 },
      update: {},
    })

    if (credit.balanceCents < priceCents) {
      throw new InsufficientCreditsError(credit.balanceCents, priceCents)
    }

    // Deduct balance
    await tx.userCredit.update({
      where: { userId },
      data: { balanceCents: { decrement: priceCents } },
    })

    // Create queue entry — unique constraint handles dedup
    let queue: { id: string }
    try {
      queue = await tx.researchQueue.create({
        data: {
          cropAId,
          cropBId,
          triggeredBy: 'PERSONAL',
          priceCents,
        },
        select: { id: true },
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Already queued — refund and surface to caller
        await tx.userCredit.update({
          where: { userId },
          data: { balanceCents: { increment: priceCents } },
        })
        const existing = await tx.researchQueue.findUnique({
          where: { cropAId_cropBId: { cropAId, cropBId } },
          select: { id: true },
        })
        throw new AlreadyQueuedError(existing!.id)
      }
      throw e
    }

    await tx.creditTransaction.create({
      data: {
        userId,
        type: 'SPEND',
        amountCents: -priceCents,
        description: `Research: ${cropAId} + ${cropBId}`,
        researchQueueId: queue.id,
      },
    })

    await tx.researchFunder.create({
      data: { researchQueueId: queue.id, userId, source: 'PERSONAL' },
    })

    return queue.id
  })
}

/** Records a confirmed Stripe top-up. */
export async function applyTopUp(
  userId: string,
  amountCents: number,
  stripePaymentIntentId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.userCredit.upsert({
      where: { userId },
      create: { userId, balanceCents: amountCents },
      update: { balanceCents: { increment: amountCents } },
    }),
    prisma.creditTransaction.create({
      data: {
        userId,
        type: 'TOP_UP',
        amountCents,
        stripePaymentIntentId,
        description: 'Stripe top-up',
      },
    }),
  ])
}

/** Refunds credits to user (e.g. admin triggers research that user already queued). */
export async function refundCredits(
  userId: string,
  amountCents: number,
  researchQueueId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.userCredit.update({
      where: { userId },
      data: { balanceCents: { increment: amountCents } },
    }),
    prisma.creditTransaction.create({
      data: {
        userId,
        type: 'REFUND',
        amountCents,
        researchQueueId,
        description: 'Research funded by another source',
      },
    }),
  ])
}

export class InsufficientCreditsError extends Error {
  constructor(
    public readonly balance: number,
    public readonly required: number,
  ) {
    super(`Insufficient credits: have ${balance}, need ${required}`)
    this.name = 'InsufficientCreditsError'
  }
}

export class AlreadyQueuedError extends Error {
  constructor(public readonly queueId: string) {
    super(`Pair already in research queue: ${queueId}`)
    this.name = 'AlreadyQueuedError'
  }
}
