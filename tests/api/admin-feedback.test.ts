import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/admin/feedback/route'
import { PATCH } from '@/app/api/admin/feedback/[id]/route'

vi.mock('@/lib/prisma', () => ({
  default: {
    feedback: {
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/admin-auth', () => ({
  isAdmin: vi.fn(),
}))

import prisma from '@/lib/prisma'
import { isAdmin } from '@/lib/admin-auth'

function makeGetReq(params = '') {
  return new Request(`http://localhost/api/admin/feedback${params}`)
}

function makePatchReq(id: string, body: object) {
  return new Request(`http://localhost/api/admin/feedback/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const sampleItem = {
  id: 'fb-1', mode: 'DATA', pageUrl: '/plants/abc', message: 'wrong tag',
  ipHash: 'abc123', status: 'OPEN', createdAt: new Date(), resolvedAt: null, resolvedNote: null,
  entityType: null, entityId: null, targetKey: null, screenshot: null, annotation: null,
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/admin/feedback', () => {
  it('returns 403 for non-admin', async () => {
    vi.mocked(isAdmin).mockResolvedValue(false)
    const res = await GET(makeGetReq())
    expect(res.status).toBe(403)
  })

  it('returns paginated list for admin', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([sampleItem] as never)
    vi.mocked(prisma.feedback.count).mockResolvedValue(1)
    const res = await GET(makeGetReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(1)
    expect(body.total).toBe(1)
    expect(body.page).toBe(1)
  })

  it('passes status filter to query', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.feedback.count).mockResolvedValue(0)
    await GET(makeGetReq('?status=RESOLVED'))
    expect(vi.mocked(prisma.feedback.findMany).mock.calls[0][0].where).toMatchObject({ status: 'RESOLVED' })
  })

  it('passes mode filter to query', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.feedback.count).mockResolvedValue(0)
    await GET(makeGetReq('?mode=OTHER'))
    expect(vi.mocked(prisma.feedback.findMany).mock.calls[0][0].where).toMatchObject({ mode: 'OTHER' })
  })
})

describe('PATCH /api/admin/feedback/[id]', () => {
  it('returns 403 for non-admin', async () => {
    vi.mocked(isAdmin).mockResolvedValue(false)
    const res = await PATCH(makePatchReq('fb-1', { status: 'RESOLVED' }), { params: Promise.resolve({ id: 'fb-1' }) })
    expect(res.status).toBe(403)
  })

  it('resolves feedback and sets resolvedAt', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    vi.mocked(prisma.feedback.update).mockResolvedValue({ ...sampleItem, status: 'RESOLVED', resolvedAt: new Date() } as never)
    const res = await PATCH(makePatchReq('fb-1', { status: 'RESOLVED', resolvedNote: 'Fixed' }), { params: Promise.resolve({ id: 'fb-1' }) })
    expect(res.status).toBe(200)
    const call = vi.mocked(prisma.feedback.update).mock.calls[0][0]
    expect(call.data.status).toBe('RESOLVED')
    expect(call.data.resolvedAt).toBeDefined()
    expect(call.data.resolvedNote).toBe('Fixed')
  })

  it('dismisses without setting resolvedAt', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    vi.mocked(prisma.feedback.update).mockResolvedValue({ ...sampleItem, status: 'DISMISSED' } as never)
    const res = await PATCH(makePatchReq('fb-1', { status: 'DISMISSED' }), { params: Promise.resolve({ id: 'fb-1' }) })
    expect(res.status).toBe(200)
    const call = vi.mocked(prisma.feedback.update).mock.calls[0][0]
    expect(call.data.resolvedAt).toBeUndefined()
  })

  it('returns 400 for invalid status', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    const res = await PATCH(makePatchReq('fb-1', { status: 'OPEN' }), { params: Promise.resolve({ id: 'fb-1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 404 when item not found', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    vi.mocked(prisma.feedback.update).mockRejectedValue(new Error('not found'))
    const res = await PATCH(makePatchReq('missing', { status: 'RESOLVED' }), { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
  })
})
