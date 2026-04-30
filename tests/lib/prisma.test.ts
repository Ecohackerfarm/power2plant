import { describe, it, expect } from 'vitest'
import prisma from '@/lib/prisma'

describe('prisma singleton', () => {
  it('exports a PrismaClient instance', () => {
    expect(prisma).toBeDefined()
    expect(typeof prisma.$connect).toBe('function')
  })

  it('returns same instance on repeated imports', async () => {
    const { default: prisma2 } = await import('@/lib/prisma')
    expect(prisma2).toBe(prisma)
  })
})
