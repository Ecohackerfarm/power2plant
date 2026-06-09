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

async function sendEmail(to: string, subject: string, text: string, html: string) {
  const smtpHost = process.env.SMTP_HOST
  const smtpPort = process.env.SMTP_PORT
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const smtpFrom = process.env.SMTP_FROM

  if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
    console.log(`[dev] ${subject} → ${to}\n${text}`)
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

  await transporter.sendMail({ from: smtpFrom, to, subject, text, html })
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(
        user.email,
        'Reset your power2plant password',
        `Hi ${user.name},\n\nClick the link below to reset your password:\n\n${url}\n\nThe link expires in 1 hour. If you did not request this, ignore this email.`,
        `<p>Hi ${user.name},</p><p>Click the link below to reset your password:</p><p><a href="${url}">${url}</a></p><p>The link expires in 1 hour. If you did not request this, ignore this email.</p>`,
      )
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(
        user.email,
        'Verify your power2plant account',
        `Hi ${user.name},\n\nClick the link below to verify your email address:\n\n${url}\n\nThe link expires in 24 hours.`,
        `<p>Hi ${user.name},</p><p>Click the link below to verify your email address:</p><p><a href="${url}">${url}</a></p><p>The link expires in 24 hours.</p>`,
      )
    },
    expiresIn: 60 * 60 * 24,
  },
  secret,
  baseURL,
})
