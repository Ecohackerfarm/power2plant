import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stripe SDK is a default-exported class; capture the instance method so we can
// assert on the create-intent call and control its return value.
const { paymentIntentsCreate } = vi.hoisted(() => ({
  paymentIntentsCreate: vi.fn(),
}))

vi.mock('stripe', () => ({
  default: vi.fn(() => ({
    paymentIntents: { create: paymentIntentsCreate },
  })),
}))

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

// Route resolves the session via next/headers, which needs a request scope.
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))

import { POST } from '@/app/api/stripe/create-payment-intent/route'
import { auth } from '@/lib/auth'

function makeReq(body: unknown) {
  return new Request('http://localhost/api/stripe/create-payment-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function signedIn(userId = 'user_1') {
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: userId } } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_SECRET_KEY = 'sk_test_x'
})

describe('POST /api/stripe/create-payment-intent', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)
    const res = await POST(makeReq({ amountCents: 500 }))
    expect(res.status).toBe(401)
    expect(paymentIntentsCreate).not.toHaveBeenCalled()
  })

  it('returns 400 on unparseable body', async () => {
    signedIn()
    const res = await POST(makeReq('not-json'))
    expect(res.status).toBe(400)
  })

  it('returns 400 below MIN_TOPUP_CENTS', async () => {
    signedIn()
    const res = await POST(makeReq({ amountCents: 199 }))
    expect(res.status).toBe(400)
    expect(paymentIntentsCreate).not.toHaveBeenCalled()
  })

  it('returns 400 for non-integer amount', async () => {
    signedIn()
    const res = await POST(makeReq({ amountCents: 250.5 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing/non-number amount', async () => {
    signedIn()
    const res = await POST(makeReq({ amountCents: '500' }))
    expect(res.status).toBe(400)
  })

  it('returns 503 when STRIPE_SECRET_KEY not configured', async () => {
    signedIn()
    delete process.env.STRIPE_SECRET_KEY
    const res = await POST(makeReq({ amountCents: 500 }))
    expect(res.status).toBe(503)
    expect(paymentIntentsCreate).not.toHaveBeenCalled()
  })

  it('returns clientSecret and creates intent with amount + userId metadata', async () => {
    signedIn('user_42')
    paymentIntentsCreate.mockResolvedValue({ client_secret: 'cs_test_123' })
    const res = await POST(makeReq({ amountCents: 500 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.clientSecret).toBe('cs_test_123')
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 500,
        currency: 'eur',
        metadata: { userId: 'user_42' },
      }),
    )
  })

  it('accepts amount at exactly MIN_TOPUP_CENTS', async () => {
    signedIn()
    paymentIntentsCreate.mockResolvedValue({ client_secret: 'cs' })
    const res = await POST(makeReq({ amountCents: 200 }))
    expect(res.status).toBe(200)
  })
})
