import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { isValidVatFormat } from '@/lib/vatValidation'
import { z } from 'zod'

const BillingSchema = z.object({
  companyName: z.string().max(200).optional().nullable(),
  street: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  zip: z.string().min(1).max(20),
  country: z.string().length(2),
  vatId: z.string().max(20).optional().nullable(),
})

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const info = await prisma.userBillingInfo.findUnique({
    where: { userId: session.user.id },
    select: { companyName: true, street: true, city: true, zip: true, country: true, vatId: true },
  })

  return NextResponse.json({ billingInfo: info ?? null })
}

export async function PUT(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const parsed = BillingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation error', details: parsed.error.flatten() }, { status: 400 })
  }

  const { companyName, street, city, zip, country, vatId } = parsed.data

  if (vatId && vatId.trim() !== '' && !isValidVatFormat(vatId)) {
    return NextResponse.json({ error: 'invalid_vat_format' }, { status: 422 })
  }

  const info = await prisma.userBillingInfo.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      companyName: companyName ?? null,
      street,
      city,
      zip,
      country,
      vatId: vatId?.trim() || null,
    },
    update: {
      companyName: companyName ?? null,
      street,
      city,
      zip,
      country,
      vatId: vatId?.trim() || null,
    },
    select: { companyName: true, street: true, city: true, zip: true, country: true, vatId: true },
  })

  return NextResponse.json({ billingInfo: info })
}
