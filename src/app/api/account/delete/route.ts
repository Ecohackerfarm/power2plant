import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { getBalance } from '@/lib/credits'

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { confirmEmail } = body as Record<string, unknown>
  if (typeof confirmEmail !== 'string' || confirmEmail.trim().toLowerCase() !== session.user.email.toLowerCase()) {
    return NextResponse.json({ error: 'Email does not match' }, { status: 422 })
  }

  const balanceCents = await getBalance(session.user.id)

  // Cascade in schema handles UserCredit, CreditTransaction, garden, etc.
  await prisma.user.delete({ where: { id: session.user.id } })

  return NextResponse.json({ ok: true, forfeitedCents: balanceCents })
}
