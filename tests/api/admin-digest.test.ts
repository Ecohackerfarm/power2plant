import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

  describe('weekly frequency', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('skips on non-Monday', async () => {
      vi.setSystemTime(new Date('2025-01-07T10:00:00Z')) // Tuesday
      vi.mocked(prisma.appConfig.findUnique).mockResolvedValue({ ...baseConfig, feedbackDigestFreq: 'weekly' } as never)
      const res = await POST(makeReq())
      const body = await res.json()
      expect(body.skipped).toBe(true)
      expect(body.reason).toBe('not-monday')
    })

    it('proceeds on Monday', async () => {
      vi.setSystemTime(new Date('2025-01-06T10:00:00Z')) // Monday
      vi.mocked(prisma.appConfig.findUnique).mockResolvedValue({ ...baseConfig, feedbackDigestFreq: 'weekly' } as never)
      vi.mocked(prisma.feedback.findMany).mockResolvedValue([] as never)
      const res = await POST(makeReq())
      const body = await res.json()
      expect(body.reason).not.toBe('not-monday')
    })
  })

  describe('date window', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('queries last 24h for daily', async () => {
      const now = new Date('2025-01-15T12:00:00Z')
      vi.setSystemTime(now)
      vi.mocked(prisma.appConfig.findUnique).mockResolvedValue(baseConfig as never)
      vi.mocked(prisma.feedback.findMany).mockResolvedValue([] as never)
      await POST(makeReq())
      const call = vi.mocked(prisma.feedback.findMany).mock.calls[0]?.[0] as { where: { createdAt: { gte: Date } } }
      expect(call.where.createdAt.gte.getTime()).toBe(now.getTime() - 24 * 60 * 60 * 1000)
    })

    it('queries last 7 days for weekly', async () => {
      const now = new Date('2025-01-06T12:00:00Z') // Monday
      vi.setSystemTime(now)
      vi.mocked(prisma.appConfig.findUnique).mockResolvedValue({ ...baseConfig, feedbackDigestFreq: 'weekly' } as never)
      vi.mocked(prisma.feedback.findMany).mockResolvedValue([] as never)
      await POST(makeReq())
      const call = vi.mocked(prisma.feedback.findMany).mock.calls[0]?.[0] as { where: { createdAt: { gte: Date } } }
      expect(call.where.createdAt.gte.getTime()).toBe(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    })
  })

  describe('email content', () => {
    beforeEach(() => {
      vi.mocked(prisma.appConfig.findUnique).mockResolvedValue(baseConfig as never)
      vi.mocked(prisma.feedback.findMany).mockResolvedValue([sampleItem] as never)
    })

    it('sends from SMTP_FROM address', async () => {
      await POST(makeReq())
      expect(sendMailMock.mock.calls[0]?.[0].from).toBe('noreply@example.com')
    })

    it('sends to all configured recipients', async () => {
      const emails = ['a@example.com', 'b@example.com']
      vi.mocked(prisma.appConfig.findUnique).mockResolvedValue({ ...baseConfig, feedbackDigestEmails: emails } as never)
      await POST(makeReq())
      expect(sendMailMock.mock.calls[0]?.[0].to).toBe('a@example.com, b@example.com')
    })

    it('subject includes item count', async () => {
      vi.mocked(prisma.feedback.findMany).mockResolvedValue([sampleItem, sampleItem, sampleItem] as never)
      await POST(makeReq())
      expect(sendMailMock.mock.calls[0]?.[0].subject).toContain('3')
    })

    it('includes both text and html body', async () => {
      await POST(makeReq())
      const mail = sendMailMock.mock.calls[0]?.[0]
      expect(mail.text).toBeTruthy()
      expect(mail.html).toBeTruthy()
    })

    it('html body contains table row per item', async () => {
      vi.mocked(prisma.feedback.findMany).mockResolvedValue([sampleItem, sampleItem] as never)
      await POST(makeReq())
      const html: string = sendMailMock.mock.calls[0]?.[0].html
      const rowCount = (html.match(/<tr>/g) ?? []).length
      // thead row + 2 data rows
      expect(rowCount).toBe(3)
    })
  })
})
