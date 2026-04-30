import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, PUT } from '@/app/api/garden/route'

vi.mock('@/lib/prisma', () => ({
  default: {
    userGarden: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
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

const fakeGarden = {
  id: 'garden-1',
  userId: 'user-1',
  lat: 51.5,
  lng: -0.1,
  minTempC: -12.2,
  bedCount: 3,
  bedCapacity: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/garden', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    const req = new Request('http://localhost/api/garden')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns null when user has no garden', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.userGarden.findUnique).mockResolvedValue(null)
    const req = new Request('http://localhost/api/garden')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toBeNull()
  })

  it('returns garden data when found', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.userGarden.findUnique).mockResolvedValue(fakeGarden as any)
    const req = new Request('http://localhost/api/garden')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.lat).toBeCloseTo(51.5)
    expect(body.minTempC).toBeCloseTo(-12.2)
  })
})

describe('PUT /api/garden', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    const req = new Request('http://localhost/api/garden', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 51.5, lng: -0.1, minTempC: -12.2, bedCount: 3, bedCapacity: 3 }),
    })
    const res = await PUT(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid lat bounds', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    const req = new Request('http://localhost/api/garden', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 200, lng: -0.1 }),
    })
    const res = await PUT(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid bedCount', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    const req = new Request('http://localhost/api/garden', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bedCount: 0 }),
    })
    const res = await PUT(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for fractional bedCount', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    const req = new Request('http://localhost/api/garden', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bedCount: 1.5 }),
    })
    const res = await PUT(req)
    expect(res.status).toBe(400)
  })

  it('upserts garden and returns updated data', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.userGarden.upsert).mockResolvedValue(fakeGarden as any)
    const req = new Request('http://localhost/api/garden', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 51.5, lng: -0.1, minTempC: -12.2, bedCount: 3, bedCapacity: 3 }),
    })
    const res = await PUT(req)
    expect(res.status).toBe(200)
    expect(prisma.userGarden.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        create: expect.objectContaining({ userId: 'user-1', lat: 51.5 }),
        update: expect.objectContaining({ lat: 51.5 }),
      })
    )
  })
})
