import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isAdmin } from '@/lib/admin-auth'

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const config = await prisma.appConfig.findUnique({ where: { id: 'singleton' } })
  return NextResponse.json(config)
}

export async function PATCH(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const data: {
    feedbackDigestEnabled?: boolean
    feedbackDigestFreq?: string
    feedbackDigestEmails?: string[]
  } = {}
  if ('feedbackDigestEnabled' in body) data.feedbackDigestEnabled = Boolean(body.feedbackDigestEnabled)
  if ('feedbackDigestFreq' in body) data.feedbackDigestFreq = String(body.feedbackDigestFreq)
  if ('feedbackDigestEmails' in body && Array.isArray(body.feedbackDigestEmails)) {
    data.feedbackDigestEmails = body.feedbackDigestEmails.filter((e: unknown) => typeof e === 'string')
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  const config = await prisma.appConfig.update({
    where: { id: 'singleton' },
    data,
  })
  return NextResponse.json(config)
}
