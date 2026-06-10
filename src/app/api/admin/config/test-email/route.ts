import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'

export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const smtpVars = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM,
  }
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean)

  const missing = (Object.entries(smtpVars) as [string, string | undefined][])
    .filter(([, v]) => !v)
    .map(([k]) => k)
  const set = (Object.entries(smtpVars) as [string, string | undefined][])
    .filter(([, v]) => !!v)
    .map(([k]) => k)

  if (missing.length > 0) {
    return NextResponse.json(
      { error: 'missing_vars', missing, set },
      { status: 422 },
    )
  }

  if (adminEmails.length === 0) {
    return NextResponse.json(
      { error: 'no_recipients', missing: ['ADMIN_EMAILS'], set },
      { status: 422 },
    )
  }

  const { default: nodemailer } = await import('nodemailer')
  const transporter = nodemailer.createTransport({
    host: smtpVars.SMTP_HOST,
    port: parseInt(smtpVars.SMTP_PORT ?? '587', 10),
    secure: smtpVars.SMTP_PORT === '465',
    auth: { user: smtpVars.SMTP_USER, pass: smtpVars.SMTP_PASS },
  })

  try {
    await transporter.sendMail({
      from: smtpVars.SMTP_FROM,
      to: adminEmails.join(', '),
      subject: 'Test email from companion planting app',
      text: 'SMTP is configured correctly.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'send_failed', message, set }, { status: 502 })
  }

  return NextResponse.json({ ok: true, to: adminEmails })
}
