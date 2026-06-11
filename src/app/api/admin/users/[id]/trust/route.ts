import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isAdmin } from '@/lib/admin-auth'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: { trusted: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof body.trusted !== 'boolean') {
    return NextResponse.json({ error: 'trusted must be a boolean' }, { status: 422 })
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { trustedResearcher: body.trusted },
    select: { id: true, name: true, email: true, trustedResearcher: true },
  })

  return NextResponse.json({ user: updated })
}
