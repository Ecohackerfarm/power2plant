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

  const [user, billing] = await Promise.all([
    prisma.user.findUnique({
      where: { id: opts.userId },
      select: { name: true, email: true },
    }),
    prisma.userBillingInfo.findUnique({
      where: { userId: opts.userId },
      select: { companyName: true, street: true, city: true, zip: true, country: true, vatId: true },
    }),
  ])

  if (!user) {
    console.error('[invoice] user not found:', opts.userId)
    return
  }

  const amountGross = Math.round(opts.amountCents) / 100
  const vatRate = DEFAULT_VAT_RATE
  const unitPriceNet = Math.round((amountGross / (1 + vatRate / 100)) * 100) / 100
  const isB2B = !!(billing?.vatId?.trim())

  const payload = {
    paymentId: opts.paymentId,
    paymentProvider: opts.paymentProvider,
    paidAt: opts.paidAt,
    customer: {
      name: billing?.companyName?.trim() || user.name,
      email: user.email,
      type: isB2B ? ('b2b' as const) : ('b2c' as const),
      ...(billing ? {
        address: {
          street: billing.street,
          city: billing.city,
          zip: billing.zip,
          country: billing.country,
        },
      } : {}),
      ...(billing?.vatId?.trim() ? { vatId: billing.vatId.trim() } : {}),
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
