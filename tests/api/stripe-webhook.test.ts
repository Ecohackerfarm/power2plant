import { describe, it, expect, vi, beforeEach } from 'vitest'

const { constructEvent } = vi.hoisted(() => ({
  constructEvent: vi.fn(),
}))

vi.mock('stripe', () => ({
  default: vi.fn(() => ({
    webhooks: { constructEvent },
  })),
}))

vi.mock('@/lib/credits', () => ({ applyTopUp: vi.fn() }))
vi.mock('@/lib/invoiceService', () => ({ triggerInvoice: vi.fn() }))

import { POST } from '@/app/api/stripe/webhook/route'
import { applyTopUp } from '@/lib/credits'
import { triggerInvoice } from '@/lib/invoiceService'

function makeReq(body = 'raw-body', sig: string | null = 'sig_123') {
  const headers: Record<string, string> = {}
  if (sig !== null) headers['stripe-signature'] = sig
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers,
    body,
  })
}

function succeededEvent(over: Record<string, unknown> = {}) {
  return {
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_1',
        amount: 500,
        created: 1_700_000_000,
        metadata: { userId: 'user_1' },
        ...over,
      },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x'
  process.env.STRIPE_SECRET_KEY = 'sk_test_x'
})

describe('POST /api/stripe/webhook', () => {
  it('returns 503 when not configured', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET
    const res = await POST(makeReq())
    expect(res.status).toBe(503)
  })

  it('returns 400 when signature header missing', async () => {
    const res = await POST(makeReq('raw-body', null))
    expect(res.status).toBe(400)
    expect(constructEvent).not.toHaveBeenCalled()
  })

  it('returns 400 when signature verification fails', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('bad signature')
    })
    const res = await POST(makeReq())
    expect(res.status).toBe(400)
    expect(applyTopUp).not.toHaveBeenCalled()
  })

  it('applies top-up and triggers invoice on payment_intent.succeeded', async () => {
    constructEvent.mockReturnValue(succeededEvent())
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(applyTopUp).toHaveBeenCalledWith('user_1', 500, 'pi_1')
    expect(triggerInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        paymentId: 'pi_1',
        paymentProvider: 'stripe',
        amountCents: 500,
      }),
    )
  })

  it('ignores succeeded event with no userId metadata', async () => {
    constructEvent.mockReturnValue(succeededEvent({ metadata: {} }))
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(applyTopUp).not.toHaveBeenCalled()
    expect(triggerInvoice).not.toHaveBeenCalled()
  })

  it('ignores succeeded event with non-positive amount', async () => {
    constructEvent.mockReturnValue(succeededEvent({ amount: 0 }))
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(applyTopUp).not.toHaveBeenCalled()
  })

  it('ignores non-succeeded event types', async () => {
    constructEvent.mockReturnValue({
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_x', amount: 500, metadata: { userId: 'u' } } },
    })
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(applyTopUp).not.toHaveBeenCalled()
  })
})
