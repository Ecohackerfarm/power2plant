import { describe, it, expect, vi, beforeEach } from 'vitest'

const { paymentsGet, getMollieClient } = vi.hoisted(() => ({
  paymentsGet: vi.fn(),
  getMollieClient: vi.fn(),
}))

vi.mock('@/lib/mollie', () => ({ getMollieClient }))
vi.mock('@/lib/credits', () => ({ applyTopUp: vi.fn() }))
vi.mock('@/lib/invoiceService', () => ({ triggerInvoice: vi.fn() }))
vi.mock('@/lib/pot', () => ({
  recordMollieDonation: vi.fn(),
  tryFundFromPot: vi.fn(),
}))

import { POST } from '@/app/api/mollie/webhook/route'
import { applyTopUp } from '@/lib/credits'
import { triggerInvoice } from '@/lib/invoiceService'
import { recordMollieDonation, tryFundFromPot } from '@/lib/pot'

function makeReq(id: string | null) {
  const body = id === null ? '' : `id=${encodeURIComponent(id)}`
  return new Request('http://localhost/api/mollie/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
}

function payment(over: Record<string, unknown> = {}) {
  return {
    status: 'paid',
    amount: { currency: 'EUR', value: '10.00' },
    paidAt: '2026-06-01T00:00:00.000Z',
    metadata: { type: 'topup', userId: 'user_1' },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getMollieClient.mockReturnValue({ payments: { get: paymentsGet } })
})

describe('POST /api/mollie/webhook', () => {
  it('returns 400 when id missing', async () => {
    const res = await POST(makeReq(null))
    expect(res.status).toBe(400)
    expect(paymentsGet).not.toHaveBeenCalled()
  })

  it('ignores payments that are not paid', async () => {
    paymentsGet.mockResolvedValue(payment({ status: 'open' }))
    const res = await POST(makeReq('tr_1'))
    expect(res.status).toBe(200)
    expect(applyTopUp).not.toHaveBeenCalled()
  })

  it('top-up: applies credit and triggers invoice', async () => {
    paymentsGet.mockResolvedValue(payment())
    const res = await POST(makeReq('tr_1'))
    expect(res.status).toBe(200)
    expect(applyTopUp).toHaveBeenCalledWith('user_1', 1000, undefined, 'tr_1')
    expect(triggerInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        paymentId: 'tr_1',
        paymentProvider: 'mollie',
        amountCents: 1000,
      }),
    )
  })

  it('derives amount from charged value, NOT metadata (anti-inflation)', async () => {
    paymentsGet.mockResolvedValue(
      payment({
        amount: { currency: 'EUR', value: '5.00' },
        // attacker-supplied inflated amount in metadata must be ignored
        metadata: { type: 'topup', userId: 'user_1', amountCents: 999999 },
      }),
    )
    await POST(makeReq('tr_evil'))
    expect(applyTopUp).toHaveBeenCalledWith('user_1', 500, undefined, 'tr_evil')
  })

  it('top-up: returns 400 on invalid metadata (no userId)', async () => {
    paymentsGet.mockResolvedValue(payment({ metadata: { type: 'topup' } }))
    const res = await POST(makeReq('tr_1'))
    expect(res.status).toBe(400)
    expect(applyTopUp).not.toHaveBeenCalled()
  })

  it('donation: records and attempts pot funding', async () => {
    paymentsGet.mockResolvedValue(payment({ metadata: { type: 'donation' } }))
    vi.mocked(recordMollieDonation).mockResolvedValue(true)
    const res = await POST(makeReq('tr_d'))
    expect(res.status).toBe(200)
    expect(recordMollieDonation).toHaveBeenCalledWith(1000, 'EUR', 'tr_d')
    expect(tryFundFromPot).toHaveBeenCalledOnce()
  })

  it('donation: skips pot funding when duplicate (recorded=false)', async () => {
    paymentsGet.mockResolvedValue(payment({ metadata: { type: 'donation' } }))
    vi.mocked(recordMollieDonation).mockResolvedValue(false)
    await POST(makeReq('tr_d'))
    expect(tryFundFromPot).not.toHaveBeenCalled()
  })
})
