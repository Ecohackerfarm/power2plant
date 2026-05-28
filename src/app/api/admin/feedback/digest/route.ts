import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import prisma from '@/lib/prisma'

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await prisma.appConfig.findUnique({ where: { id: 'singleton' } })
  if (!config?.feedbackDigestEnabled) {
    return NextResponse.json({ skipped: true, reason: 'disabled' })
  }

  const freq = config.feedbackDigestFreq
  if (freq === 'never') {
    return NextResponse.json({ skipped: true, reason: 'never' })
  }

  // weekly digest only sends on Mondays
  if (freq === 'weekly' && new Date().getDay() !== 1) {
    return NextResponse.json({ skipped: true, reason: 'not-monday' })
  }

  const windowMs = freq === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  const since = new Date(Date.now() - windowMs)

  const items = await prisma.feedback.findMany({
    where: { status: 'OPEN', createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  if (items.length === 0) {
    return NextResponse.json({ skipped: true, reason: 'no-new-feedback' })
  }

  const recipients = config.feedbackDigestEmails
  if (recipients.length === 0) {
    return NextResponse.json({ skipped: true, reason: 'no-recipients' })
  }

  const smtpHost = process.env.SMTP_HOST
  const smtpPort = process.env.SMTP_PORT
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const smtpFrom = process.env.SMTP_FROM

  if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
    return NextResponse.json({ error: 'SMTP not configured' }, { status: 422 })
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(smtpPort ?? '587', 10),
    secure: smtpPort === '465',
    auth: { user: smtpUser, pass: smtpPass },
  })

  const subject = `[power2plant] ${items.length} new feedback report${items.length === 1 ? '' : 's'}`

  const textLines = items.map(item => {
    const date = item.createdAt.toISOString().slice(0, 10)
    const snippet = item.message.slice(0, 120)
    return `[${date}] ${item.mode} — ${item.pageUrl}\n  ${snippet}`
  })

  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  const htmlRows = items.map(item => {
    const date = escapeHtml(item.createdAt.toISOString().slice(0, 10))
    const mode = escapeHtml(item.mode)
    const pageUrl = escapeHtml(item.pageUrl)
    const snippet = escapeHtml(item.message.slice(0, 120))
    return `<tr><td>${date}</td><td>${mode}</td><td>${pageUrl}</td><td>${snippet}</td></tr>`
  })

  const text = `${items.length} new open feedback report(s) in the last ${freq === 'weekly' ? '7 days' : '24 hours'}:\n\n${textLines.join('\n\n')}`
  const html = `<p>${items.length} new open feedback report(s):</p>
<table border="1" cellpadding="4" cellspacing="0">
  <thead><tr><th>Date</th><th>Mode</th><th>Page</th><th>Message</th></tr></thead>
  <tbody>${htmlRows.join('\n')}</tbody>
</table>`

  await transporter.sendMail({
    from: smtpFrom,
    to: recipients.join(', '),
    subject,
    text,
    html,
  })

  return NextResponse.json({ sent: true, count: items.length })
}
