import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, PATCH } from '@/app/api/admin/config/route'

vi.mock('@/lib/prisma', () => ({
  default: {
    appConfig: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/admin-auth', () => ({
  isAdmin: vi.fn(),
}))

import prisma from '@/lib/prisma'
import { isAdmin } from '@/lib/admin-auth'

const sampleConfig = {
  id: 'singleton',
  feedbackDigestEnabled: false,
  feedbackDigestFreq: 'daily',
  feedbackDigestEmails: [],
}

function makeReq(body?: object) {
  return new Request('http://localhost/api/admin/config', {
    method: body ? 'PATCH' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/admin/config', () => {
  it('returns 403 for non-admin', async () => {
    vi.mocked(isAdmin).mockResolvedValue(false)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('returns config for admin', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    vi.mocked(prisma.appConfig.findUnique).mockResolvedValue(sampleConfig as never)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.feedbackDigestEnabled).toBe(false)
  })
})

describe('PATCH /api/admin/config', () => {
  it('returns 403 for non-admin', async () => {
    vi.mocked(isAdmin).mockResolvedValue(false)
    const res = await PATCH(makeReq({ feedbackDigestEnabled: true }))
    expect(res.status).toBe(403)
  })

  it('returns 400 for empty patch body', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    const res = await PATCH(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('updates feedbackDigestEnabled', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    vi.mocked(prisma.appConfig.update).mockResolvedValue({ ...sampleConfig, feedbackDigestEnabled: true } as never)
    const res = await PATCH(makeReq({ feedbackDigestEnabled: true }))
    expect(res.status).toBe(200)
    const call = vi.mocked(prisma.appConfig.update).mock.calls[0]![0]!
    expect(call.data.feedbackDigestEnabled).toBe(true)
    expect(call.where).toMatchObject({ id: 'singleton' })
  })

  it('updates digest emails array', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    const emails = ['a@example.com', 'b@example.com']
    vi.mocked(prisma.appConfig.update).mockResolvedValue({ ...sampleConfig, feedbackDigestEmails: emails } as never)
    const res = await PATCH(makeReq({ feedbackDigestEmails: emails }))
    expect(res.status).toBe(200)
    const call = vi.mocked(prisma.appConfig.update).mock.calls[0]![0]!
    expect(call.data.feedbackDigestEmails).toEqual(emails)
  })

  it('filters non-string values from emails array', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    vi.mocked(prisma.appConfig.update).mockResolvedValue(sampleConfig as never)
    await PATCH(makeReq({ feedbackDigestEmails: ['valid@test.com', 123, null] }))
    const call = vi.mocked(prisma.appConfig.update).mock.calls[0]![0]!
    expect(call.data.feedbackDigestEmails).toEqual(['valid@test.com'])
  })
})
