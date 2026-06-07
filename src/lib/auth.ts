import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import prisma from '@/lib/prisma'

const secret = process.env.BETTER_AUTH_SECRET
  ?? (process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('BETTER_AUTH_SECRET env var is required in production') })()
    : 'dev-secret-change-in-production')

const baseURL = process.env.BETTER_AUTH_URL
  ?? (process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('BETTER_AUTH_URL env var is required in production') })()
    : 'http://localhost:3000')

async function sendVerificationEmail(user: { email: string; name: string }, url: string) {
  const smtpHost = process.env.SMTP_HOST
  const smtpPort = process.env.SMTP_PORT
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const smtpFrom = process.env.SMTP_FROM

  if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
    console.log(`[dev] email verification link for ${user.email}: ${url}`)
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodemailer = require('nodemailer') as typeof import('nodemailer')
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(smtpPort ?? '587', 10),
    secure: smtpPort === '465',
    auth: { user: smtpUser, pass: smtpPass },
  })

  await transporter.sendMail({
    from: smtpFrom,
    to: user.email,
    subject: 'Verify your power2plant account',
    text: `Hi ${user.name},\n\nClick the link below to verify your email address:\n\n${url}\n\nThe link expires in 24 hours.`,
    html: `<p>Hi ${user.name},</p><p>Click the link below to verify your email address:</p><p><a href="${url}">${url}</a></p><p>The link expires in 24 hours.</p>`,
  })
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user, url)
    },
    expiresIn: 60 * 60 * 24,
  },
  secret,
  baseURL,
})
