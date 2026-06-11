import { NextResponse } from 'next/server'
import { mollieClient } from '@/lib/mollie'
import { applyTopUp } from '@/lib/credits'
import { triggerInvoice } from '@/lib/invoiceService'
import { recordMollieDonation, tryFundFromPot } from '@/lib/pot'

export async function POST(req: Request) {
  // Mollie sends form-encoded body: id=tr_xxx
  const body = await req.text()
  const id = new URLSearchParams(body).get('id')
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  // Verify by fetching from Mollie — this is Mollie's recommended auth approach
  const payment = await mollieClient.payments.get(id)
  if (payment.status !== 'paid') {
    return NextResponse.json({ ok: true }) // not paid yet, ignore
  }

  const meta = payment.metadata as Record<string, unknown> | null
  const type = meta?.type

  if (type === 'topup') {
    const userId = meta?.userId
    const amountCents = Number(meta?.amountCents ?? 0)
    if (typeof userId !== 'string' || !userId || amountCents <= 0) {
      return NextResponse.json({ error: 'invalid metadata' }, { status: 400 })
    }
    await applyTopUp(userId, amountCents, undefined, id)
    await triggerInvoice({
      userId,
      paymentId: id,
      paymentProvider: 'mollie',
      paidAt: payment.paidAt ?? new Date().toISOString(),
      amountCents,
    })
  } else if (type === 'donation') {
    const amountCents = Number(meta?.amountCents ?? 0)
    const currency = (payment.amount.currency as string) ?? 'EUR'
    if (amountCents <= 0) {
      return NextResponse.json({ error: 'invalid metadata' }, { status: 400 })
    }
    const recorded = await recordMollieDonation(amountCents, currency, id)
    if (recorded) {
      await tryFundFromPot()
    }
  }

  return NextResponse.json({ ok: true })
}
