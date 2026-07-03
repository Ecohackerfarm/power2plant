import { test, expect } from '@playwright/test'

// Ko-fi webhook is unauthenticated (shared-token auth) — no storageState needed.
// Token comes from env so the app process and this spec agree on the same value.
// CI wires it in ci-e2e.yml; locally it must be exported (else these tests skip).
const TOKEN = process.env.KOFI_VERIFICATION_TOKEN

test.describe('Ko-fi webhook (live app + DB)', () => {
  test.skip(!TOKEN, 'KOFI_VERIFICATION_TOKEN not set in this environment')

  function postKofi(
    request: import('@playwright/test').APIRequestContext,
    payload: object,
  ) {
    // Ko-fi sends application/x-www-form-urlencoded with a single `data` field
    // holding the JSON payload.
    return request.post('/api/kofi/webhook', {
      form: { data: JSON.stringify(payload) },
    })
  }

  function donation(over: Record<string, unknown> = {}) {
    return {
      verification_token: TOKEN,
      // Unique per run so repeat CI runs don't collide on the idempotency key.
      kofi_transaction_id: `kofi-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: 'Donation',
      amount: '5.00',
      currency: 'EUR',
      is_public: true,
      ...over,
    }
  }

  test('rejects wrong verification token with 401', async ({ request }) => {
    const res = await postKofi(request, donation({ verification_token: 'wrong-token' }))
    expect(res.status()).toBe(401)
  })

  test('rejects malformed payload with 400', async ({ request }) => {
    const res = await request.post('/api/kofi/webhook', { form: { data: 'not-json' } })
    expect(res.status()).toBe(400)
  })

  test('accepts a valid donation with 200', async ({ request }) => {
    const res = await postKofi(request, donation())
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })

  test('rejects unsupported currency with 422', async ({ request }) => {
    const res = await postKofi(request, donation({ currency: 'JPY' }))
    expect(res.status()).toBe(422)
  })

  test('ignores non-donation types with 200 (no-op)', async ({ request }) => {
    const res = await postKofi(request, donation({ type: 'Shop Order' }))
    expect(res.status()).toBe(200)
  })

  test('is idempotent: duplicate transaction id still returns 200', async ({ request }) => {
    const tx = donation()
    const first = await postKofi(request, tx)
    expect(first.status()).toBe(200)
    // Same kofi_transaction_id — recorded=false branch, still a 200 ack.
    const second = await postKofi(request, tx)
    expect(second.status()).toBe(200)
  })
})
