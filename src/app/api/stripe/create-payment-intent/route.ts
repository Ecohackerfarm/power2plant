import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { MIN_TOPUP_CENTS } from '@/lib/credits'
import Stripe from 'stripe'

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(key)
}

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

  let stripe: Stripe
  try {
    stripe = getStripe()
  } catch {
    return NextResponse.json({ error: 'payment provider not configured' }, { status: 503 })
  }

  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'eur',
    metadata: { userId: session.user.id },
    automatic_payment_methods: { enabled: true },
    automatic_tax: { enabled: true },
  })

  return NextResponse.json({ clientSecret: intent.client_secret })
}
