import { NextResponse } from 'next/server'
import { getMollieClient, centsToCurrencyString } from '@/lib/mollie'

const MIN_DONATION_CENTS = 100 // €1.00

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { amountCents } = body as Record<string, unknown>
  if (
    typeof amountCents !== 'number' ||
    !Number.isInteger(amountCents) ||
    amountCents < MIN_DONATION_CENTS
  ) {
    return NextResponse.json(
      { error: `minimum donation is ${MIN_DONATION_CENTS} cents` },
      { status: 400 },
    )
  }

  const base = process.env.MOLLIE_REDIRECT_URL_BASE
  if (!base) return NextResponse.json({ error: 'payment provider not configured' }, { status: 503 })

  const payment = await getMollieClient().payments.create({
    amount: { currency: 'EUR', value: centsToCurrencyString(amountCents) },
    description: 'Power2Plant research pot donation',
    redirectUrl: `${base}/donate?mollie=success`,
    webhookUrl: `${base}/api/mollie/webhook`,
    metadata: { type: 'donation', amountCents },
  })

  return NextResponse.json({ checkoutUrl: payment._links.checkout?.href })
}
