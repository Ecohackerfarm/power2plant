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
