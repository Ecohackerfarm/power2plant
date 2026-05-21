import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'

export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const smtpHost = process.env.SMTP_HOST
  const smtpPort = process.env.SMTP_PORT
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const smtpFrom = process.env.SMTP_FROM

  if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
    return NextResponse.json({ error: 'SMTP not configured' }, { status: 422 })
  }

  // Resolve at runtime so nodemailer is not bundled unless SMTP is configured
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodemailer = require('nodemailer') as typeof import('nodemailer')

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(smtpPort ?? '587', 10),
    secure: smtpPort === '465',
    auth: { user: smtpUser, pass: smtpPass },
  })

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean)

  if (adminEmails.length === 0) {
    return NextResponse.json({ error: 'No admin email addresses configured' }, { status: 422 })
  }

  await transporter.sendMail({
    from: smtpFrom,
    to: adminEmails.join(', '),
    subject: 'Test email from companion planting app',
    text: 'SMTP is configured correctly.',
  })

  return NextResponse.json({ ok: true })
}
