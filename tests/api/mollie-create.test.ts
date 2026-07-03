import { describe, it, expect, vi, beforeEach } from 'vitest'

const { paymentsCreate, getMollieClient } = vi.hoisted(() => ({
  paymentsCreate: vi.fn(),
  getMollieClient: vi.fn(),
}))

// Keep the real centsToCurrencyString (pure helper); only stub the client factory.
vi.mock('@/lib/mollie', async (orig) => ({
  ...(await orig<typeof import('@/lib/mollie')>()),
  getMollieClient,
}))

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

// create-payment resolves the session via next/headers, which needs a request scope.
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))

import { POST as createPayment } from '@/app/api/mollie/create-payment/route'
import { POST as createDonation } from '@/app/api/mollie/create-donation/route'
import { auth } from '@/lib/auth'

function makeReq(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
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
  process.env.MOLLIE_REDIRECT_URL_BASE = 'https://app.test'
  getMollieClient.mockReturnValue({ payments: { create: paymentsCreate } })
  paymentsCreate.mockResolvedValue({ _links: { checkout: { href: 'https://pay.mollie/abc' } } })
})

describe('POST /api/mollie/create-payment (top-up)', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)
    const res = await createPayment(makeReq('/api/mollie/create-payment', { amountCents: 500 }))
    expect(res.status).toBe(401)
  })

  it('returns 400 on unparseable body', async () => {
    signedIn()
    const res = await createPayment(makeReq('/api/mollie/create-payment', 'nope'))
    expect(res.status).toBe(400)
  })

  it('returns 400 below MIN_TOPUP_CENTS', async () => {
    signedIn()
    const res = await createPayment(makeReq('/api/mollie/create-payment', { amountCents: 199 }))
    expect(res.status).toBe(400)
  })

  it('returns 503 when MOLLIE_REDIRECT_URL_BASE unset', async () => {
    signedIn()
    delete process.env.MOLLIE_REDIRECT_URL_BASE
    const res = await createPayment(makeReq('/api/mollie/create-payment', { amountCents: 500 }))
    expect(res.status).toBe(503)
  })

  it('returns 503 when Mollie client not configured', async () => {
    signedIn()
    getMollieClient.mockImplementation(() => {
      throw new Error('MOLLIE_API_KEY not configured')
    })
    const res = await createPayment(makeReq('/api/mollie/create-payment', { amountCents: 500 }))
    expect(res.status).toBe(503)
  })

  it('creates topup payment with userId + type metadata, returns checkoutUrl', async () => {
    signedIn('user_42')
    const res = await createPayment(makeReq('/api/mollie/create-payment', { amountCents: 1050 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.checkoutUrl).toBe('https://pay.mollie/abc')
    expect(paymentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: { currency: 'EUR', value: '10.50' },
        metadata: { userId: 'user_42', type: 'topup' },
      }),
    )
  })
})

describe('POST /api/mollie/create-donation', () => {
  it('does not require auth', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never)
    const res = await createDonation(makeReq('/api/mollie/create-donation', { amountCents: 100 }))
    expect(res.status).toBe(200)
  })

  it('returns 400 below minimum donation', async () => {
    const res = await createDonation(makeReq('/api/mollie/create-donation', { amountCents: 99 }))
    expect(res.status).toBe(400)
  })

  it('returns 503 when base url unset', async () => {
    delete process.env.MOLLIE_REDIRECT_URL_BASE
    const res = await createDonation(makeReq('/api/mollie/create-donation', { amountCents: 100 }))
    expect(res.status).toBe(503)
  })

  it('creates donation payment with type:donation metadata', async () => {
    const res = await createDonation(makeReq('/api/mollie/create-donation', { amountCents: 500 }))
    expect(res.status).toBe(200)
    expect(paymentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { type: 'donation' } }),
    )
  })
})
