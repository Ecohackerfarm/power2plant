import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/admin/feedback/digest/route'

vi.mock('@/lib/prisma', () => ({
  default: {
    appConfig: { findUnique: vi.fn() },
    feedback: { findMany: vi.fn() },
  },
}))

const sendMailMock = vi.fn().mockResolvedValue({})
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
  createTransport: () => ({ sendMail: sendMailMock }),
}))

import prisma from '@/lib/prisma'

const baseConfig = {
  id: 'singleton',
  feedbackDigestEnabled: true,
  feedbackDigestFreq: 'daily',
  feedbackDigestEmails: ['admin@example.com'],
}

const sampleItem = {
  id: 'fb-1',
  mode: 'DATA',
  pageUrl: '/plants/abc',
  message: 'wrong data',
  status: 'OPEN',
  createdAt: new Date(),
}

function makeReq(secret = 'secret') {
  return new Request('http://localhost/api/admin/feedback/digest', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'secret')
  vi.stubEnv('SMTP_HOST', 'smtp.example.com')
  vi.stubEnv('SMTP_USER', 'user')
  vi.stubEnv('SMTP_PASS', 'pass')
  vi.stubEnv('SMTP_FROM', 'noreply@example.com')
})

describe('POST /api/admin/feedback/digest', () => {
  it('returns 401 for wrong secret', async () => {
    const res = await POST(makeReq('wrong'))
    expect(res.status).toBe(401)
  })

  it('skips when digest disabled', async () => {
    vi.mocked(prisma.appConfig.findUnique).mockResolvedValue({ ...baseConfig, feedbackDigestEnabled: false } as never)
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toBe(true)
    expect(body.reason).toBe('disabled')
  })

  it('skips when freq is never', async () => {
    vi.mocked(prisma.appConfig.findUnique).mockResolvedValue({ ...baseConfig, feedbackDigestFreq: 'never' } as never)
    const res = await POST(makeReq())
    const body = await res.json()
    expect(body.skipped).toBe(true)
    expect(body.reason).toBe('never')
  })

  it('skips when no new feedback', async () => {
    vi.mocked(prisma.appConfig.findUnique).mockResolvedValue(baseConfig as never)
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([] as never)
    const res = await POST(makeReq())
    const body = await res.json()
    expect(body.skipped).toBe(true)
    expect(body.reason).toBe('no-new-feedback')
  })

  it('skips when no recipients configured', async () => {
    vi.mocked(prisma.appConfig.findUnique).mockResolvedValue({ ...baseConfig, feedbackDigestEmails: [] } as never)
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([sampleItem] as never)
    const res = await POST(makeReq())
    const body = await res.json()
    expect(body.skipped).toBe(true)
    expect(body.reason).toBe('no-recipients')
  })

  it('returns 422 when SMTP not configured', async () => {
    vi.stubEnv('SMTP_HOST', '')
    vi.mocked(prisma.appConfig.findUnique).mockResolvedValue(baseConfig as never)
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([sampleItem] as never)
    const res = await POST(makeReq())
    expect(res.status).toBe(422)
  })

  it('sends email and returns count when items found', async () => {
    vi.mocked(prisma.appConfig.findUnique).mockResolvedValue(baseConfig as never)
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([sampleItem, sampleItem] as never)
    sendMailMock.mockResolvedValue({})

    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sent).toBe(true)
    expect(body.count).toBe(2)
    expect(sendMailMock).toHaveBeenCalledOnce()
  })
})
