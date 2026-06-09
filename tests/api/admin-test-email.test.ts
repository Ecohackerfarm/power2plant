import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/admin/config/test-email/route'

vi.mock('@/lib/admin-auth', () => ({
  isAdmin: vi.fn(),
}))

const sendMailMock = vi.fn().mockResolvedValue({})
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
  createTransport: () => ({ sendMail: sendMailMock }),
}))

import { isAdmin } from '@/lib/admin-auth'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('SMTP_HOST', 'smtp.example.com')
  vi.stubEnv('SMTP_PORT', '587')
  vi.stubEnv('SMTP_USER', 'user')
  vi.stubEnv('SMTP_PASS', 'pass')
  vi.stubEnv('SMTP_FROM', 'noreply@example.com')
  vi.stubEnv('ADMIN_EMAILS', 'admin@example.com')
})

describe('POST /api/admin/config/test-email', () => {
  it('returns 403 for non-admin', async () => {
    vi.mocked(isAdmin).mockResolvedValue(false)
    const res = await POST()
    expect(res.status).toBe(403)
  })

  it('returns 422 when SMTP_HOST missing', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    vi.stubEnv('SMTP_HOST', '')
    const res = await POST()
    expect(res.status).toBe(422)
  })

  it('returns 422 when SMTP_USER missing', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    vi.stubEnv('SMTP_USER', '')
    const res = await POST()
    expect(res.status).toBe(422)
  })

  it('returns 422 when ADMIN_EMAILS not set', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    vi.stubEnv('ADMIN_EMAILS', '')
    const res = await POST()
    expect(res.status).toBe(422)
  })

  it('returns { ok: true } and calls sendMail', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    const res = await POST()
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    expect(sendMailMock).toHaveBeenCalledOnce()
  })

  it('sends to all ADMIN_EMAILS', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    vi.stubEnv('ADMIN_EMAILS', 'a@example.com,b@example.com')
    await POST()
    expect(sendMailMock.mock.calls[0]?.[0].to).toBe('a@example.com, b@example.com')
  })

  it('sends from SMTP_FROM address', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    await POST()
    expect(sendMailMock.mock.calls[0]?.[0].from).toBe('noreply@example.com')
  })

  it('does not send when non-admin even if SMTP configured', async () => {
    vi.mocked(isAdmin).mockResolvedValue(false)
    await POST()
    expect(sendMailMock).not.toHaveBeenCalled()
  })
})
