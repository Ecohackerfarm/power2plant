import { test, expect } from '@playwright/test'
import { ADMIN_STATE, USER_STATE } from './auth-constants'

// ─── Unauthenticated: pages redirect ────────────────────────────────────────

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
      await expect(page).not.toHaveURL(/\/admin/)
      await expect(page).toHaveURL(/\/(en|de|fr|es|pt|hi|ja|ru|zh-Hans)?\/?$/)
    })
  }
})

// ─── Unauthenticated: API returns 403 ───────────────────────────────────────

test.describe('admin API routes require authentication', () => {
  test('GET /api/admin/config returns 403', async ({ request }) => {
    expect((await request.get('/api/admin/config')).status()).toBe(403)
  })
  test('PATCH /api/admin/config returns 403', async ({ request }) => {
    expect((await request.patch('/api/admin/config', { data: { feedbackDigestEnabled: true } })).status()).toBe(403)
  })
  test('GET /api/admin/feedback returns 403', async ({ request }) => {
    expect((await request.get('/api/admin/feedback')).status()).toBe(403)
  })
  test('PATCH /api/admin/feedback/[id] returns 403', async ({ request }) => {
    expect((await request.patch('/api/admin/feedback/nonexistent-id', { data: { status: 'RESOLVED' } })).status()).toBe(403)
  })
  test('GET /api/admin/research-requests returns 403', async ({ request }) => {
    expect((await request.get('/api/admin/research-requests')).status()).toBe(403)
  })
  test('PATCH /api/admin/research-requests returns 403', async ({ request }) => {
    expect((await request.patch('/api/admin/research-requests', { data: { id: 'x', status: 'approved' } })).status()).toBe(403)
  })
  test('GET /api/admin/research-queue returns 403', async ({ request }) => {
    expect((await request.get('/api/admin/research-queue')).status()).toBe(403)
  })
  test('POST /api/admin/research-queue returns 403', async ({ request }) => {
    expect((await request.post('/api/admin/research-queue', { data: { requestId: 'x' } })).status()).toBe(403)
  })
  test('PATCH /api/admin/research-queue returns 403', async ({ request }) => {
    expect((await request.patch('/api/admin/research-queue', { data: { id: 'x', status: 'done' } })).status()).toBe(403)
  })
  test('POST /api/admin/config/test-email returns 403', async ({ request }) => {
    expect((await request.post('/api/admin/config/test-email')).status()).toBe(403)
  })
})

// ─── Digest: CRON_SECRET auth (not session) ─────────────────────────────────

test.describe('feedback digest endpoint', () => {
  test('returns 401 without Authorization header', async ({ request }) => {
    expect((await request.post('/api/admin/feedback/digest')).status()).toBe(401)
  })
  test('returns 401 with wrong secret', async ({ request }) => {
    expect((await request.post('/api/admin/feedback/digest', {
      headers: { Authorization: 'Bearer wrong-secret' },
    })).status()).toBe(401)
  })
})

// ─── Logged-in non-admin: admin area still blocked ──────────────────────────

test.describe('non-admin user cannot access admin area', () => {
  test.use({ storageState: USER_STATE })

  test('GET /admin redirects away', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).not.toHaveURL(/\/admin/)
  })

  test('GET /api/admin/config returns 403', async ({ request }) => {
    expect((await request.get('/api/admin/config')).status()).toBe(403)
  })

  test('GET /api/admin/feedback returns 403', async ({ request }) => {
    expect((await request.get('/api/admin/feedback')).status()).toBe(403)
  })

  test('GET /api/admin/research-queue returns 403', async ({ request }) => {
    expect((await request.get('/api/admin/research-queue')).status()).toBe(403)
  })

  test('header does not show Admin link', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('banner').getByRole('link', { name: /admin/i })).not.toBeVisible()
  })
})

// ─── Admin user: pages reachable, features available ────────────────────────

test.describe('admin user can access admin area', () => {
  test.use({ storageState: ADMIN_STATE })

  test('header shows Admin link', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('banner').getByRole('link', { name: /admin/i })).toBeVisible()
  })

  test('/admin shows card grid with all sub-sections', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin$/)
    // Scope to main — sub-nav has the same links, causing strict mode violations
    const main = page.locator('main')
    await expect(main.getByRole('link', { name: /feedback/i })).toBeVisible()
    await expect(main.getByRole('link', { name: /research requests/i })).toBeVisible()
    await expect(main.getByRole('link', { name: /research queue/i })).toBeVisible()
    await expect(main.getByRole('link', { name: /settings/i })).toBeVisible()
  })

  test('/admin/feedback page loads', async ({ page }) => {
    await page.goto('/admin/feedback')
    await expect(page).toHaveURL(/\/admin\/feedback/)
    // Page renders without error (either table or empty state)
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('/admin/research-requests page loads', async ({ page }) => {
    await page.goto('/admin/research-requests')
    await expect(page).toHaveURL(/\/admin\/research-requests/)
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('/admin/research-queue page loads', async ({ page }) => {
    await page.goto('/admin/research-queue')
    await expect(page).toHaveURL(/\/admin\/research-queue/)
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('/admin/settings page loads and shows config form', async ({ page }) => {
    await page.goto('/admin/settings')
    await expect(page).toHaveURL(/\/admin\/settings/)
    // Settings page has a save button and frequency selector
    await expect(page.getByRole('button', { name: /save/i })).toBeVisible({ timeout: 5000 })
  })

  test('GET /api/admin/config returns 200', async ({ request }) => {
    const res = await request.get('/api/admin/config')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('feedbackDigestEnabled')
    expect(body).toHaveProperty('feedbackDigestFreq')
    expect(body).toHaveProperty('feedbackDigestEmails')
  })

  test('GET /api/admin/feedback returns 200', async ({ request }) => {
    const res = await request.get('/api/admin/feedback')
    expect(res.status()).toBe(200)
    expect(Array.isArray(await res.json())).toBe(true)
  })

  test('GET /api/admin/research-requests returns 200', async ({ request }) => {
    const res = await request.get('/api/admin/research-requests')
    expect(res.status()).toBe(200)
    expect(Array.isArray(await res.json())).toBe(true)
  })

  test('GET /api/admin/research-queue returns 200', async ({ request }) => {
    const res = await request.get('/api/admin/research-queue')
    expect(res.status()).toBe(200)
    expect(Array.isArray(await res.json())).toBe(true)
  })

  test('admin sub-nav links are shown in /admin layout', async ({ page }) => {
    await page.goto('/admin/feedback')
    const nav = page.locator('nav').first()
    await expect(nav.getByRole('link', { name: /feedback/i })).toBeVisible()
    await expect(nav.getByRole('link', { name: /research requests/i })).toBeVisible()
    await expect(nav.getByRole('link', { name: /research queue/i })).toBeVisible()
    await expect(nav.getByRole('link', { name: /settings/i })).toBeVisible()
  })
})
