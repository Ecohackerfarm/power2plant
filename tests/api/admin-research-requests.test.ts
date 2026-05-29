import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, PATCH } from '@/app/api/admin/research-requests/route'

vi.mock('@/lib/prisma', () => ({
  default: {
    researchRequest: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/admin-auth', () => ({
  isAdmin: vi.fn(),
}))

import prisma from '@/lib/prisma'
import { isAdmin } from '@/lib/admin-auth'

function makeReq() {
  return new Request('http://localhost/api/admin/research-requests')
}

function makePatch(body: object) {
  return new Request('http://localhost/api/admin/research-requests', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const sampleItem = {
  id: 'rr-1', cropAId: 'crop-a', cropBId: 'crop-b', voteCount: 5, funded: false, createdAt: new Date(),
  cropA: { id: 'crop-a', name: 'Tomato', botanicalName: 'Solanum lycopersicum', commonNames: [] },
  cropB: { id: 'crop-b', name: 'Basil', botanicalName: 'Ocimum basilicum', commonNames: [] },
  _count: { votes: 5 },
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/admin/research-requests', () => {
  it('returns 403 for non-admin', async () => {
    vi.mocked(isAdmin).mockResolvedValue(false)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('returns list ordered by funded desc then voteCount desc', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([sampleItem] as never)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('rr-1')
    const call = vi.mocked(prisma.researchRequest.findMany).mock.calls[0][0]
    expect(call?.orderBy).toEqual([{ funded: 'desc' }, { voteCount: 'desc' }])
  })

  it('includes _count.votes in response', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    vi.mocked(prisma.researchRequest.findMany).mockResolvedValue([sampleItem] as never)
    const res = await GET()
    const body = await res.json()
    expect(body[0]._count.votes).toBe(5)
  })
})

describe('PATCH /api/admin/research-requests', () => {
  it('returns 403 for non-admin', async () => {
    vi.mocked(isAdmin).mockResolvedValue(false)
    const res = await PATCH(makePatch({ id: 'rr-1', funded: true }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when id is missing', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    const res = await PATCH(makePatch({ funded: true }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when funded is missing', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    const res = await PATCH(makePatch({ id: 'rr-1' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when funded is not boolean', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    const res = await PATCH(makePatch({ id: 'rr-1', funded: 'true' }))
    expect(res.status).toBe(400)
  })

  it('updates funded flag and returns updated item', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    vi.mocked(prisma.researchRequest.update).mockResolvedValue({ ...sampleItem, funded: true } as never)
    const res = await PATCH(makePatch({ id: 'rr-1', funded: true }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.funded).toBe(true)
    expect(prisma.researchRequest.update).toHaveBeenCalledWith({
      where: { id: 'rr-1' },
      data: { funded: true },
    })
  })

  it('returns 404 when ID does not exist', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    const err = Object.assign(new Error('not found'), { code: 'P2025' })
    vi.mocked(prisma.researchRequest.update).mockRejectedValue(err)
    const res = await PATCH(makePatch({ id: 'missing', funded: true }))
    expect(res.status).toBe(404)
  })
})
