import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from '@/app/api/garden/plantings/[plantingId]/route'

vi.mock('@/lib/prisma', () => ({
  default: {
    planting: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
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

const fakePlanting = {
  id: 'planting-1',
  bedId: 'bed-1',
  cropId: 'crop-1',
  status: 'PLANNED',
  bed: { garden: { userId: 'user-1' } },
}

function makeReq(body: unknown) {
  return new Request('http://localhost/api/garden/plantings/planting-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe('PATCH /api/garden/plantings/[plantingId]', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)
    const res = await PATCH(makeReq({ status: 'PLANTED' }), { params: Promise.resolve({ plantingId: 'planting-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid status value', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    const res = await PATCH(makeReq({ status: 'GROWING' }), { params: Promise.resolve({ plantingId: 'planting-1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('PLANNED, PLANTED, or HARVESTED')
  })

  it('returns 404 when planting belongs to different user', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.planting.findUnique).mockResolvedValue({
      ...fakePlanting,
      bed: { garden: { userId: 'other-user' } },
    } as any)
    const res = await PATCH(makeReq({ status: 'PLANTED' }), { params: Promise.resolve({ plantingId: 'planting-1' }) })
    expect(res.status).toBe(404)
  })

  it('returns 200 and updated status on happy path', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(fakeSession as any)
    vi.mocked(prisma.planting.findUnique).mockResolvedValue(fakePlanting as any)
    vi.mocked(prisma.planting.update).mockResolvedValue({ id: 'planting-1', status: 'PLANTED' } as any)
    const res = await PATCH(makeReq({ status: 'PLANTED' }), { params: Promise.resolve({ plantingId: 'planting-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('PLANTED')
  })
})
