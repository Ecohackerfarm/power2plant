import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import prisma from '@/lib/prisma'

const RATE_LIMIT_PER_HOUR = 20
const MAX_SCREENSHOT_BYTES = 300 * 1024 // 300 KB base64

function hashIp(ip: string): string {
  const salt = process.env.FEEDBACK_IP_SALT ?? ''
  return createHash('sha256').update(ip + salt).digest('hex')
}

function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  // Gate 1: honeypot
  if (body.website !== '' && body.website !== undefined && body.website !== null) {
    return NextResponse.json({}, { status: 200 })
  }

  // Gate 2: rate limit
  const ipHash = hashIp(getClientIp(req))
  const since = new Date(Date.now() - 60 * 60 * 1000)
  const recentCount = await prisma.feedback.count({
    where: { ipHash, createdAt: { gte: since } },
  })
  if (recentCount >= RATE_LIMIT_PER_HOUR) {
    return NextResponse.json({ error: 'rate limit exceeded' }, { status: 429 })
  }

  // Gate 3: validation
  const { mode, pageUrl, entityType, entityId, targetKey, screenshot, annotation, message } = body

  if (mode !== 'DATA' && mode !== 'OTHER') {
    return NextResponse.json({ error: 'invalid mode' }, { status: 400 })
  }
  if (typeof pageUrl !== 'string' || pageUrl.length === 0) {
    return NextResponse.json({ error: 'pageUrl required' }, { status: 400 })
  }
  if (typeof message !== 'string' || message.length < 3 || message.length > 2000) {
    return NextResponse.json({ error: 'message must be 3–2000 chars' }, { status: 400 })
  }
  if (screenshot !== undefined && screenshot !== null) {
    if (typeof screenshot !== 'string' || screenshot.length > MAX_SCREENSHOT_BYTES) {
      return NextResponse.json({ error: 'screenshot exceeds 300 KB' }, { status: 400 })
    }
  }

  await prisma.feedback.create({
    data: {
      mode,
      pageUrl,
      entityType: typeof entityType === 'string' ? entityType : null,
      entityId: typeof entityId === 'string' ? entityId : null,
      targetKey: typeof targetKey === 'string' ? targetKey : null,
      screenshot: typeof screenshot === 'string' ? screenshot : null,
      annotation: annotation && typeof annotation === 'object' ? annotation : undefined,
      message,
      ipHash,
    },
  })

  return NextResponse.json({}, { status: 201 })
}
