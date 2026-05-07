import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/relationships/route'

vi.mock('@/lib/prisma', () => ({
  default: {
    crop: { findMany: vi.fn() },
    relationshipSource: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    cropRelationship: { upsert: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}))

import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'

const fakeSession = {
  user: { id: 'user-1', email: 'test@example.com', name: 'Test' },
  session: { id: 'sess-1', token: 'tok', expiresAt: new Date(Date.now() + 86400000) },
}

function makeReq(body: unknown) {
  return new Request('http://localhost/api/relationships', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = { cropAId: 'crop-a', cropBId: 'crop-b', type: 'COMPANION' }

beforeEach(() => vi.clearAllMocks())

describe('POST /api/relationships', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(401)
  })

  it('returns 400 when cropAId equals cropBId', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    const res = await POST(makeReq({ cropAId: 'crop-a', cropBId: 'crop-a', type: 'COMPANION' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('different')
  })

  it('returns 400 when type is invalid', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    const res = await POST(makeReq({ ...validBody, type: 'ATTRACTS' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('COMPANION or AVOID')
  })

  it('returns 400 when notes exceed 500 chars', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.crop.findMany).mockResolvedValue([{ id: 'crop-a' }, { id: 'crop-b' }] as any)
    const res = await POST(makeReq({ ...validBody, notes: 'x'.repeat(501) }))
    expect(res.status).toBe(400)
  })

  it('returns 422 when crop ids are unknown', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.crop.findMany).mockResolvedValue([{ id: 'crop-a' }] as any)
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.ids).toContain('crop-b')
  })

  it('returns 429 when user already submitted this pair today', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.crop.findMany).mockResolvedValue([{ id: 'crop-a' }, { id: 'crop-b' }] as any)
    vi.mocked(prisma.relationshipSource.findFirst).mockResolvedValue({ id: 'existing' } as any)
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(429)
  })

  it('returns 201 on happy path', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.crop.findMany).mockResolvedValue([{ id: 'crop-a' }, { id: 'crop-b' }] as any)
    vi.mocked(prisma.relationshipSource.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      const mockTx = {
        cropRelationship: {
          upsert: vi.fn().mockResolvedValue({ id: 'rel-1' }),
          update: vi.fn().mockResolvedValue({}),
        },
        relationshipSource: {
          create: vi.fn().mockResolvedValue({ id: 'src-1' }),
          findMany: vi.fn().mockResolvedValue([{ confidence: 'ANECDOTAL' }]),
        },
      }
      return fn(mockTx)
    })
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('rel-1')
    expect(body.sourceId).toBe('src-1')
  })
})
