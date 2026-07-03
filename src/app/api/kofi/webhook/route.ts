import { NextResponse } from 'next/server'
import { recordKofiDonation, tryFundFromPot } from '@/lib/pot'

interface KofiPayload {
  verification_token: string
  kofi_transaction_id: string
  type: string
  amount: string
  currency: string
  is_public?: boolean
}

// Currencies Ko-fi supports that use 2 decimal places (standard minor units)
const TWO_DECIMAL_CURRENCIES = new Set([
  'EUR', 'USD', 'GBP', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN',
  'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'MXN', 'BRL', 'INR', 'SGD', 'HKD',
  'NZD', 'ZAR',
])

function parseCents(amount: string, currency: string): number {
  if (!TWO_DECIMAL_CURRENCIES.has(currency.toUpperCase())) return -1
  const value = parseFloat(amount)
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.round(value * 100)
}

export async function POST(req: Request) {
  const expectedToken = process.env.KOFI_VERIFICATION_TOKEN
  if (!expectedToken) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 })
  }

  // Ko-fi sends form-encoded with a `data` field containing JSON
  let payload: KofiPayload
  try {
    const form = await req.formData()
    const data = form.get('data')
    if (typeof data !== 'string') throw new Error('missing data')
    payload = JSON.parse(data) as KofiPayload
  } catch {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }

  if (payload.verification_token !== expectedToken) {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  }

  // Only process donations and subscriptions (not shop orders)
  if (!['Donation', 'Subscription'].includes(payload.type)) {
    return NextResponse.json({ ok: true })
  }

  const amountCents = parseCents(payload.amount, payload.currency)
  if (amountCents === -1) {
    return NextResponse.json({ error: `unsupported currency: ${payload.currency}` }, { status: 422 })
  }
  if (amountCents <= 0) return NextResponse.json({ ok: true })

  const recorded = await recordKofiDonation(
    amountCents,
    payload.currency,
    payload.kofi_transaction_id,
  )

  if (recorded) {
    // Attempt to fund top-voted pair if pot now has enough
    await tryFundFromPot()
  }

  return NextResponse.json({ ok: true })
}
