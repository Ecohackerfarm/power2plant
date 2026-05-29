import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/feedback/route'

vi.mock('@/lib/prisma', () => ({
  default: {
    feedback: {
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import prisma from '@/lib/prisma'

const validBody = {
  mode: 'DATA',
  pageUrl: '/plants/abc',
  message: 'This tag is wrong',
  website: '',
}

function makeReq(body: object, ip = '1.2.3.4') {
  return new Request('http://localhost/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/feedback', () => {
  it('returns 201 on valid submission', async () => {
    vi.mocked(prisma.feedback.count).mockResolvedValue(0)
    vi.mocked(prisma.feedback.create).mockResolvedValue({} as never)
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(201)
    expect(prisma.feedback.create).toHaveBeenCalledOnce()
  })

  it('silently drops when honeypot filled (200, no DB write)', async () => {
    const res = await POST(makeReq({ ...validBody, website: 'spam@evil.com' }))
    expect(res.status).toBe(200)
    expect(prisma.feedback.count).not.toHaveBeenCalled()
    expect(prisma.feedback.create).not.toHaveBeenCalled()
  })

  it('returns 429 when rate limit exceeded', async () => {
    vi.mocked(prisma.feedback.count).mockResolvedValue(20)
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(429)
    expect(prisma.feedback.create).not.toHaveBeenCalled()
  })

  it('returns 400 when message too short', async () => {
    vi.mocked(prisma.feedback.count).mockResolvedValue(0)
    const res = await POST(makeReq({ ...validBody, message: 'no' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when message too long', async () => {
    vi.mocked(prisma.feedback.count).mockResolvedValue(0)
    const res = await POST(makeReq({ ...validBody, message: 'x'.repeat(2001) }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when screenshot exceeds 300 KB', async () => {
    vi.mocked(prisma.feedback.count).mockResolvedValue(0)
    const bigScreenshot = 'x'.repeat(300 * 1024 + 1)
    const res = await POST(makeReq({ ...validBody, screenshot: bigScreenshot }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid mode', async () => {
    vi.mocked(prisma.feedback.count).mockResolvedValue(0)
    const res = await POST(makeReq({ ...validBody, mode: 'INVALID' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing pageUrl', async () => {
    vi.mocked(prisma.feedback.count).mockResolvedValue(0)
    const { pageUrl: _, ...noUrl } = validBody
    const res = await POST(makeReq(noUrl))
    expect(res.status).toBe(400)
  })

  it('returns 400 when pageUrl exceeds 2048 chars', async () => {
    vi.mocked(prisma.feedback.count).mockResolvedValue(0)
    const res = await POST(makeReq({ ...validBody, pageUrl: '/' + 'x'.repeat(2048) }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/2048/)
  })

  it('accepts pageUrl at exactly 2048 chars', async () => {
    vi.mocked(prisma.feedback.count).mockResolvedValue(0)
    vi.mocked(prisma.feedback.create).mockResolvedValue({} as never)
    const res = await POST(makeReq({ ...validBody, pageUrl: '/' + 'x'.repeat(2047) }))
    expect(res.status).toBe(201)
  })

  it('returns 400 when annotation exceeds 50 KB', async () => {
    vi.mocked(prisma.feedback.count).mockResolvedValue(0)
    // Build an annotation JSON object whose serialised form is > 50_000 bytes
    const bigAnnotation = { data: 'x'.repeat(50_001) }
    const res = await POST(makeReq({ ...validBody, annotation: bigAnnotation }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/50 KB/)
  })

  it('accepts annotation within 50 KB', async () => {
    vi.mocked(prisma.feedback.count).mockResolvedValue(0)
    vi.mocked(prisma.feedback.create).mockResolvedValue({} as never)
    const res = await POST(makeReq({ ...validBody, annotation: { x: 0.1, y: 0.2 } }))
    expect(res.status).toBe(201)
  })

  it('stores ipHash not raw IP', async () => {
    vi.mocked(prisma.feedback.count).mockResolvedValue(0)
    vi.mocked(prisma.feedback.create).mockResolvedValue({} as never)
    await POST(makeReq(validBody, '10.0.0.1'))
    const createCall = vi.mocked(prisma.feedback.create).mock.calls[0][0]
    expect(createCall.data.ipHash).not.toBe('10.0.0.1')
    expect(createCall.data.ipHash).toHaveLength(64) // SHA-256 hex
  })

  it('accepts OTHER mode with screenshot', async () => {
    vi.mocked(prisma.feedback.count).mockResolvedValue(0)
    vi.mocked(prisma.feedback.create).mockResolvedValue({} as never)
    const res = await POST(makeReq({
      mode: 'OTHER',
      pageUrl: '/plan',
      message: 'Something looks off',
      website: '',
      screenshot: 'data:image/jpeg;base64,/9j/abc',
      annotation: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
    }))
    expect(res.status).toBe(201)
  })
})
