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
