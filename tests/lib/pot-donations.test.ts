import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  default: {
    potTransaction: { create: vi.fn() },
  },
}))

import { recordKofiDonation, recordMollieDonation } from '@/lib/pot'
import { centsToCurrencyString } from '@/lib/mollie'
import prisma from '@/lib/prisma'

beforeEach(() => vi.clearAllMocks())

describe('recordKofiDonation', () => {
  it('returns true and writes a DONATION pot transaction', async () => {
    vi.mocked(prisma.potTransaction.create).mockResolvedValue({} as never)
    const ok = await recordKofiDonation(750, 'USD', 'kofi_1')
    expect(ok).toBe(true)
    expect(prisma.potTransaction.create).toHaveBeenCalledWith({
      data: { type: 'DONATION', amountCents: 750, currency: 'USD', kofiTransactionId: 'kofi_1' },
    })
  })

  it('returns false on duplicate (unique constraint violation)', async () => {
    vi.mocked(prisma.potTransaction.create).mockRejectedValue(new Error('unique'))
    const ok = await recordKofiDonation(750, 'USD', 'kofi_1')
    expect(ok).toBe(false)
  })
})

describe('recordMollieDonation', () => {
  it('returns true and writes a DONATION pot transaction', async () => {
    vi.mocked(prisma.potTransaction.create).mockResolvedValue({} as never)
    const ok = await recordMollieDonation(1000, 'EUR', 'tr_1')
    expect(ok).toBe(true)
    expect(prisma.potTransaction.create).toHaveBeenCalledWith({
      data: { type: 'DONATION', amountCents: 1000, currency: 'EUR', molliePaymentId: 'tr_1' },
    })
  })

  it('returns false on duplicate', async () => {
    vi.mocked(prisma.potTransaction.create).mockRejectedValue(new Error('unique'))
    const ok = await recordMollieDonation(1000, 'EUR', 'tr_1')
    expect(ok).toBe(false)
  })
})

describe('centsToCurrencyString', () => {
  it.each([
    [1050, '10.50'],
    [200, '2.00'],
    [99, '0.99'],
    [100000, '1000.00'],
  ])('formats %d cents as "%s"', (cents, expected) => {
    expect(centsToCurrencyString(cents)).toBe(expected)
  })
})
