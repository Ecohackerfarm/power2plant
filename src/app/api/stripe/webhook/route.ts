import { NextResponse } from 'next/server'
import { applyTopUp } from '@/lib/credits'
import { triggerInvoice } from '@/lib/invoiceService'
import Stripe from 'stripe'

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!secret || !stripeKey) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 })
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'missing signature' }, { status: 400 })

  const stripe = new Stripe(stripeKey)
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret)
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent
    const userId = intent.metadata?.userId
    if (userId && intent.amount > 0) {
      await applyTopUp(userId, intent.amount, intent.id)
      await triggerInvoice({
        userId,
        paymentId: intent.id,
        paymentProvider: 'stripe',
        paidAt: new Date(intent.created * 1000).toISOString(),
        amountCents: intent.amount,
      })
    }
  }

  return NextResponse.json({ received: true })
}
