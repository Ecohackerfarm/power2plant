import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { MIN_TOPUP_CENTS } from '@/lib/credits'
import { getMollieClient, centsToCurrencyString } from '@/lib/mollie'

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

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
    amountCents < MIN_TOPUP_CENTS
  ) {
    return NextResponse.json(
      { error: `minimum top-up is ${MIN_TOPUP_CENTS} cents` },
      { status: 400 },
    )
  }

  const base = process.env.MOLLIE_REDIRECT_URL_BASE
  if (!base) return NextResponse.json({ error: 'payment provider not configured' }, { status: 503 })

  const payment = await getMollieClient().payments.create({
    amount: { currency: 'EUR', value: centsToCurrencyString(amountCents) },
    description: 'Power2Plant credit top-up',
    redirectUrl: `${base}/credits?mollie=success`,
    webhookUrl: `${base}/api/mollie/webhook`,
    metadata: { userId: session.user.id, type: 'topup', amountCents },
  })

  return NextResponse.json({ checkoutUrl: payment._links.checkout?.href })
}
