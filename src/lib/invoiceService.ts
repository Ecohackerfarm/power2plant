import prisma from '@/lib/prisma'

const INVOICE_SERVICE_URL = process.env.INVOICE_SERVICE_URL
const INVOICE_SERVICE_SECRET = process.env.INVOICE_SERVICE_SECRET
const DEFAULT_VAT_RATE = parseInt(process.env.INVOICE_DEFAULT_VAT_RATE ?? '19', 10)

interface TriggerInvoiceOptions {
  userId: string
  paymentId: string
  paymentProvider: 'stripe' | 'mollie'
  paidAt: string
  amountCents: number
}

export async function triggerInvoice(opts: TriggerInvoiceOptions): Promise<void> {
  if (!INVOICE_SERVICE_URL || !INVOICE_SERVICE_SECRET) return

  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { name: true, email: true },
  })
  if (!user) {
    console.error('[invoice] user not found:', opts.userId)
    return
  }

  const amountGross = Math.round(opts.amountCents) / 100
  const vatRate = DEFAULT_VAT_RATE
  const unitPriceNet = Math.round((amountGross / (1 + vatRate / 100)) * 100) / 100

  const payload = {
    paymentId: opts.paymentId,
    paymentProvider: opts.paymentProvider,
    paidAt: opts.paidAt,
    customer: {
      name: user.name,
      email: user.email,
      type: 'b2c' as const,
    },
    lineItems: [
      {
        description: 'AI Research Credits',
        quantity: 1,
        unitPriceNet,
        vatRate,
      },
    ],
    currency: 'EUR' as const,
    amountGross,
  }

  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 10_000)

    const res = await fetch(`${INVOICE_SERVICE_URL}/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${INVOICE_SERVICE_SECRET}`,
      },
      body: JSON.stringify(payload),
      signal: ac.signal,
    }).finally(() => clearTimeout(timer))

    if (!res.ok && res.status !== 409) {
      const body = await res.text().catch(() => '')
      console.error(`[invoice] service returned ${res.status}:`, body)
    }
  } catch (err) {
    console.error('[invoice] failed to reach invoice service:', err)
  }
}
