import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/garden/plantings/route'

vi.mock('@/lib/prisma', () => ({
  default: {
    userGarden: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    bed: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    crop: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
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

const fakeCrop = { id: 'crop-1', name: 'Tomato', commonNames: ['Tomato'], botanicalName: 'Solanum lycopersicum' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/garden/plantings', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    const req = new Request('http://localhost/api/garden/plantings')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns { beds: [] } when user has no garden', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.userGarden.findUnique).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ beds: [] })
  })

  it('returns beds with plantings when garden exists', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.userGarden.findUnique).mockResolvedValue({
      id: 'garden-1',
      userId: 'user-1',
      beds: [
        {
          id: 'bed-1',
          name: 'Bed 1',
          plantings: [
            { cropId: 'crop-1', crop: { id: 'crop-1', name: 'Tomato', commonNames: ['Tomato'] } },
          ],
        },
      ],
    } as any)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.beds).toHaveLength(1)
    expect(body.beds[0].name).toBe('Bed 1')
    expect(body.beds[0].plantings[0].cropName).toBe('Tomato')
  })
})

describe('POST /api/garden/plantings', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    const req = new Request('http://localhost/api/garden/plantings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beds: [] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 if beds missing/wrong type', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    const req = new Request('http://localhost/api/garden/plantings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beds: 'not-an-array' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('beds must be an array')
  })

  it('returns 400 if bed name is empty', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    const req = new Request('http://localhost/api/garden/plantings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beds: [{ name: '', cropIds: ['crop-1'] }] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('name must be a non-empty string')
  })

  it('returns 400 if bed name exceeds 50 chars', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    const req = new Request('http://localhost/api/garden/plantings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beds: [{ name: 'a'.repeat(51), cropIds: ['crop-1'] }] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('name must be a non-empty string <= 50 chars')
  })

  it('returns 400 if cropIds empty or too many', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    const req = new Request('http://localhost/api/garden/plantings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beds: [{ name: 'Bed 1', cropIds: [] }] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('cropIds must have 1-20 items')
  })

  it('returns 422 if unknown cropIds', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.crop.findMany).mockResolvedValue([])
    const req = new Request('http://localhost/api/garden/plantings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beds: [{ name: 'Bed 1', cropIds: ['unknown-crop'] }] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('unknown crop ids')
    expect(body.ids).toContain('unknown-crop')
  })

  it('returns 200 happy path (mock transaction)', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.crop.findMany).mockResolvedValue([{ id: 'crop-1' }] as any)
    vi.mocked(prisma.userGarden.upsert).mockResolvedValue({ id: 'garden-1', userId: 'user-1' } as any)
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      const mockTx = {
        bed: {
          deleteMany: vi.fn(),
          create: vi.fn().mockResolvedValue({
            id: 'bed-1',
            name: 'Bed 1',
            plantings: [{ cropId: 'crop-1', crop: { id: 'crop-1', name: 'Tomato', commonNames: ['Tomato'] } }],
          }),
        },
      }
      return await fn(mockTx)
    })

    const req = new Request('http://localhost/api/garden/plantings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beds: [{ name: 'Bed 1', cropIds: ['crop-1'] }] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.beds).toHaveLength(1)
    expect(body.beds[0].name).toBe('Bed 1')
  })
})