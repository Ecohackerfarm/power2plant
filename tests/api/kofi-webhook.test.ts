import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/pot', () => ({
  recordKofiDonation: vi.fn(),
  tryFundFromPot: vi.fn(),
}))

import { POST } from '@/app/api/kofi/webhook/route'
import { recordKofiDonation, tryFundFromPot } from '@/lib/pot'

const TOKEN = 'kofi-test-token'

function makeReq(payload: object | null, raw?: string) {
  const form = new URLSearchParams()
  if (raw !== undefined) form.set('data', raw)
  else if (payload !== null) form.set('data', JSON.stringify(payload))
  return new Request('http://localhost/api/kofi/webhook', { method: 'POST', body: form })
}

function donation(over: Record<string, unknown> = {}) {
  return {
    verification_token: TOKEN,
    kofi_transaction_id: 'kofi_1',
    type: 'Donation',
    amount: '5.00',
    currency: 'EUR',
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.KOFI_VERIFICATION_TOKEN = TOKEN
  vi.mocked(recordKofiDonation).mockResolvedValue(true)
})

describe('POST /api/kofi/webhook', () => {
  it('returns 503 when token not configured', async () => {
    delete process.env.KOFI_VERIFICATION_TOKEN
    const res = await POST(makeReq(donation()))
    expect(res.status).toBe(503)
  })

  it('returns 400 on malformed payload (non-JSON data)', async () => {
    const res = await POST(makeReq(null, 'not-json'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when data field missing', async () => {
    const res = await POST(makeReq(null))
    expect(res.status).toBe(400)
  })

  it('returns 401 on wrong verification token', async () => {
    const res = await POST(makeReq(donation({ verification_token: 'wrong' })))
    expect(res.status).toBe(401)
    expect(recordKofiDonation).not.toHaveBeenCalled()
  })

  it('ignores non-donation/subscription types', async () => {
    const res = await POST(makeReq(donation({ type: 'Shop Order' })))
    expect(res.status).toBe(200)
    expect(recordKofiDonation).not.toHaveBeenCalled()
  })

  it('returns 422 for unsupported currency', async () => {
    const res = await POST(makeReq(donation({ currency: 'JPY' })))
    expect(res.status).toBe(422)
    expect(recordKofiDonation).not.toHaveBeenCalled()
  })

  it('noops (200) on zero/negative amount', async () => {
    const res = await POST(makeReq(donation({ amount: '0' })))
    expect(res.status).toBe(200)
    expect(recordKofiDonation).not.toHaveBeenCalled()
  })

  it('records donation and attempts pot funding', async () => {
    const res = await POST(makeReq(donation({ amount: '7.50', currency: 'USD' })))
    expect(res.status).toBe(200)
    expect(recordKofiDonation).toHaveBeenCalledWith(750, 'USD', 'kofi_1')
    expect(tryFundFromPot).toHaveBeenCalledOnce()
  })

  it('processes Subscription type', async () => {
    const res = await POST(makeReq(donation({ type: 'Subscription' })))
    expect(res.status).toBe(200)
    expect(recordKofiDonation).toHaveBeenCalled()
  })

  it('skips pot funding on duplicate (recorded=false)', async () => {
    vi.mocked(recordKofiDonation).mockResolvedValue(false)
    await POST(makeReq(donation()))
    expect(tryFundFromPot).not.toHaveBeenCalled()
  })
})
