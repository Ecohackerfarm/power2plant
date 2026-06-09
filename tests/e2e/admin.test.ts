import { test, expect } from '@playwright/test'

// Unauthenticated: all /admin/* pages redirect away
test.describe('admin pages redirect unauthenticated users', () => {
  const adminPages = [
    '/admin',
    '/admin/feedback',
    '/admin/research-requests',
    '/admin/research-queue',
    '/admin/settings',
  ]

  for (const path of adminPages) {
    test(`GET ${path} redirects to home`, async ({ page }) => {
      await page.goto(path)
      // next-intl prefixes the redirect target with locale
      await expect(page).not.toHaveURL(new RegExp(`/admin`))
      // Should land on root (e.g. /en or /)
      await expect(page).toHaveURL(/^\/(en|de|fr|es|pt|hi|ja|ru|zh-Hans)?\/?$/)
    })
  }
})

// Unauthenticated: admin API routes return 403
test.describe('admin API routes require authentication', () => {
  test('GET /api/admin/config returns 403', async ({ request }) => {
    const res = await request.get('/api/admin/config')
    expect(res.status()).toBe(403)
  })

  test('PATCH /api/admin/config returns 403', async ({ request }) => {
    const res = await request.patch('/api/admin/config', {
      data: { feedbackDigestEnabled: true },
    })
    expect(res.status()).toBe(403)
  })

  test('GET /api/admin/feedback returns 403', async ({ request }) => {
    const res = await request.get('/api/admin/feedback')
    expect(res.status()).toBe(403)
  })

  test('PATCH /api/admin/feedback/[id] returns 403', async ({ request }) => {
    const res = await request.patch('/api/admin/feedback/nonexistent-id', {
      data: { status: 'RESOLVED' },
    })
    expect(res.status()).toBe(403)
  })

  test('GET /api/admin/research-requests returns 403', async ({ request }) => {
    const res = await request.get('/api/admin/research-requests')
    expect(res.status()).toBe(403)
  })

  test('PATCH /api/admin/research-requests returns 403', async ({ request }) => {
    const res = await request.patch('/api/admin/research-requests', {
      data: { id: 'x', status: 'approved' },
    })
    expect(res.status()).toBe(403)
  })

  test('GET /api/admin/research-queue returns 403', async ({ request }) => {
    const res = await request.get('/api/admin/research-queue')
    expect(res.status()).toBe(403)
  })

  test('POST /api/admin/research-queue returns 403', async ({ request }) => {
    const res = await request.post('/api/admin/research-queue', {
      data: { requestId: 'x' },
    })
    expect(res.status()).toBe(403)
  })

  test('PATCH /api/admin/research-queue returns 403', async ({ request }) => {
    const res = await request.patch('/api/admin/research-queue', {
      data: { id: 'x', status: 'done' },
    })
    expect(res.status()).toBe(403)
  })

  test('POST /api/admin/config/test-email returns 403', async ({ request }) => {
    const res = await request.post('/api/admin/config/test-email')
    expect(res.status()).toBe(403)
  })
})

// Digest endpoint uses CRON_SECRET auth, not session
test.describe('feedback digest endpoint', () => {
  test('POST /api/admin/feedback/digest returns 401 without Authorization header', async ({ request }) => {
    const res = await request.post('/api/admin/feedback/digest')
    expect(res.status()).toBe(401)
  })

  test('POST /api/admin/feedback/digest returns 401 with wrong secret', async ({ request }) => {
    const res = await request.post('/api/admin/feedback/digest', {
      headers: { Authorization: 'Bearer wrong-secret' },
    })
    expect(res.status()).toBe(401)
  })
})
