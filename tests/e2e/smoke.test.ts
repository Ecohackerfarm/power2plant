import { test, expect } from '@playwright/test'

test('landing page shows 3 use-case cards', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'power2plant' })).toBeVisible()
  // Landing page has both hero CTA buttons and card links pointing to the same destinations.
  // Use .first() to avoid strict-mode violations from duplicate role+name matches.
  await expect(page.getByRole('link', { name: /find companion plant/i }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: /plan beds/i }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: /my garden/i })).toBeVisible()
})

test('plan page has site header with nav', async ({ page }) => {
  await page.goto('/plan')
  await expect(page.getByRole('banner')).toBeVisible()
  // Hamburger nav: the toggle button is always visible; its presence proves the nav is mounted.
  await expect(page.getByRole('banner').getByRole('button', { name: /toggle menu/i })).toBeVisible()
})

test('contribute page shows sign-in gate when unauthenticated', async ({ page }) => {
  await page.goto('/contribute')
  await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /contribute/i })).not.toBeVisible()
})

test('crop search API returns results', async ({ request }) => {
  const res = await request.get('/api/crops?q=tomato')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(Array.isArray(body.crops)).toBe(true)
  expect(body.crops.length).toBeGreaterThan(0)
  expect(body.crops[0]).toHaveProperty('id')
  expect(body.crops[0]).toHaveProperty('name')
})

test('zone API returns USDA zone for valid coords', async ({ request }) => {
  const res = await request.get('/api/zone?lat=40.7&lng=-74.0')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body).toHaveProperty('minTempC')
})

test('recommendation flow: zone + 2 plants → beds render', async ({ page, request }) => {
  // Fetch two real crop IDs and a zone value via API
  const [cropsRes, zoneRes] = await Promise.all([
    request.get('/api/crops?q=tomato'),
    request.get('/api/zone?lat=40.7&lng=-74.0'),
  ])
  const { crops } = await cropsRes.json()
  const { minTempC } = await zoneRes.json()
  const [cropA, cropB] = crops

  // Pre-seed localStorage so zone + wishlist are already set
  await page.goto('/')
  await page.evaluate(
    ({ ids, zone }) => {
      localStorage.setItem(
        'power2plant:garden',
        JSON.stringify({ lat: 40.7, lng: -74.0, minTempC: zone, bedCount: 3, bedCapacity: 3, wishlist: ids }),
      )
    },
    { ids: [cropA.id, cropB.id], zone: minTempC },
  )
  // Navigate directly to results with compute flag — wizard skips to compute when state pre-seeded
  await page.goto('/plan/results?compute=1')

  // At least one bed card should render
  await expect(page.getByText(/bed 1/i)).toBeVisible({ timeout: 10000 })
})

test('relationships API returns 401 for unauthenticated POST', async ({ request }) => {
  const res = await request.post('/api/relationships', {
    data: { cropAId: 'any', cropBId: 'other', type: 'COMPANION' },
  })
  expect(res.status()).toBe(401)
})

test('map picker: renders when toggled', async ({ page }) => {
  await page.goto('/plan')
  await page.getByRole('button', { name: /pick on map instead/i }).click()
  // Leaflet mounts inside the div — wait for the container class it adds
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 8000 })
})

test('map picker: stays visible during zone fetch, hides after success', async ({ page }) => {
  await page.goto('/plan')

  // Delay zone response so we can assert the map is still visible mid-flight
  let resolveZone!: (value: unknown) => void
  const zonePending = new Promise(r => { resolveZone = r })

  await page.route('/api/zone**', async route => {
    await zonePending
    await route.fulfill({ json: { minTempC: -12.2 } })
  })

  await page.getByRole('button', { name: /pick on map instead/i }).click()
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 8000 })

  // Click on the map — triggers onSelect → fetchZone (pending)
  await page.locator('.leaflet-container').click({ position: { x: 150, y: 160 } })

  // Map must still be visible while zone fetch is in flight
  await expect(page.locator('.leaflet-container')).toBeVisible()

  // Unblock the zone API
  resolveZone(undefined)

  // Map hides and wizard advances to plant selection
  await expect(page.locator('.leaflet-container')).not.toBeVisible({ timeout: 5000 })
  await expect(page).toHaveURL(/\/plan\/plants/, { timeout: 5000 })
})

test('plan page shows plant search', async ({ page }) => {
  await page.goto('/plan/plants')
  await expect(page.getByRole('textbox', { name: /search/i })).toBeVisible()
})

test('sign-in panel: opens as dropdown without shifting header layout', async ({ page }) => {
  await page.goto('/plan')
  const header = page.getByRole('banner')
  const headerBox = await header.boundingBox()
  expect(headerBox).not.toBeNull()

  await page.getByRole('button', { name: /sign in/i }).click()

  const form = page.getByLabel(/email/i).first()
  await expect(form).toBeVisible()

  // Header height must not change
  const headerBoxAfter = await header.boundingBox()
  expect(headerBoxAfter!.height).toBe(headerBox!.height)

  // Form must be fully within viewport
  const formCard = page.getByLabel(/email/i).first()
  const cardBox = await formCard.boundingBox()
  expect(cardBox).not.toBeNull()
  const viewport = page.viewportSize()!
  expect(cardBox!.x).toBeGreaterThanOrEqual(0)
  expect(cardBox!.y).toBeGreaterThanOrEqual(0)
  expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(viewport.width)
})

test('sign-in panel: opens on landing page without layout shift', async ({ page }) => {
  await page.goto('/')
  const heading = page.getByRole('heading', { name: 'power2plant' })
  const headingBoxBefore = await heading.boundingBox()
  expect(headingBoxBefore).not.toBeNull()

  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByLabel(/email/i).first()).toBeVisible()

  const headingBoxAfter = await heading.boundingBox()
  expect(headingBoxAfter!.y).toBe(headingBoxBefore!.y)
})

test('garden page has back link to home', async ({ page }) => {
  await page.goto('/garden')
  const link = page.getByRole('link', { name: /power2plant/i })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', /^\/(en|de)?\/?$/)
})
