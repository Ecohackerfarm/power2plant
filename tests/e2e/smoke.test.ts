import { test, expect } from '@playwright/test'

test('home page loads with app heading', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'power2plant' })).toBeVisible()
  await expect(page.getByText('Companion planting recommendations')).toBeVisible()
})

test('home page has contribute nav link', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: /contribute/i })).toBeVisible()
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
  await page.reload()

  // Button should be enabled now
  const btn = page.getByRole('button', { name: /get recommendations/i })
  await expect(btn).toBeEnabled()
  await btn.click()

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
  await page.goto('/')
  await page.getByRole('button', { name: /pick on map instead/i }).click()
  // Leaflet mounts inside the div — wait for the container class it adds
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 8000 })
})

test('map picker: stays visible during zone fetch, hides after success', async ({ page }) => {
  await page.goto('/')

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

  // Map hides and zone confirmation appears
  await expect(page.locator('.leaflet-container')).not.toBeVisible({ timeout: 5000 })
  await expect(page.getByText(/coldest winter night/i)).toBeVisible()
})

test('home page shows plant search (Step 2)', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('textbox', { name: /search/i })).toBeVisible()
})

test('garden page has back link to home', async ({ page }) => {
  await page.goto('/garden')
  const link = page.getByRole('link', { name: /power2plant/i })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', '/')
})
