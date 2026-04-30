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

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
  },
  secret,
  baseURL,
})
