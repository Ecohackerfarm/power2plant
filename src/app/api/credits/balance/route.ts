import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getBalance } from '@/lib/credits'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const balanceCents = await getBalance(session.user.id)
  return NextResponse.json({ balanceCents })
}
