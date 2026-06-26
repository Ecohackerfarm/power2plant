import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  default: {
    creditTransaction: { findFirst: vi.fn(), create: vi.fn() },
    userCredit: { upsert: vi.fn() },
    $transaction: vi.fn(async () => []),
  },
}))

import { applyTopUp } from '@/lib/credits'
import prisma from '@/lib/prisma'

beforeEach(() => vi.clearAllMocks())

describe('applyTopUp', () => {
  it('is idempotent: skips write when payment id already recorded', async () => {
    vi.mocked(prisma.creditTransaction.findFirst).mockResolvedValue({ id: 'existing' } as never)
    await applyTopUp('user_1', 500, 'pi_1')
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.creditTransaction.create).not.toHaveBeenCalled()
  })

  it('Stripe path: records TOP_UP with stripePaymentIntentId and increments balance', async () => {
    vi.mocked(prisma.creditTransaction.findFirst).mockResolvedValue(null)
    await applyTopUp('user_1', 500, 'pi_1')

    expect(prisma.creditTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stripePaymentIntentId: 'pi_1' } }),
    )
    expect(prisma.creditTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_1',
        type: 'TOP_UP',
        amountCents: 500,
        stripePaymentIntentId: 'pi_1',
        description: 'Stripe top-up',
      }),
    })
    expect(prisma.userCredit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_1' },
        update: { balanceCents: { increment: 500 } },
      }),
    )
    expect(prisma.$transaction).toHaveBeenCalledOnce()
  })

  it('Mollie path: records TOP_UP with molliePaymentId', async () => {
    vi.mocked(prisma.creditTransaction.findFirst).mockResolvedValue(null)
    await applyTopUp('user_1', 1000, undefined, 'tr_1')

    expect(prisma.creditTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { molliePaymentId: 'tr_1' } }),
    )
    expect(prisma.creditTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        molliePaymentId: 'tr_1',
        description: 'Mollie top-up',
        amountCents: 1000,
      }),
    })
  })
})
