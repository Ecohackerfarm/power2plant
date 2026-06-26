import { test, expect } from '@playwright/test'
import { USER_STATE } from './auth-constants'

// All top-up flows require an authenticated user; the modal lives on /account.
test.use({ storageState: USER_STATE })

async function openTopUpModal(page: import('@playwright/test').Page) {
  await page.goto('/account')
  await page.getByRole('button', { name: /^top up$/i }).click()
  await expect(page.getByRole('heading', { name: /top up balance/i })).toBeVisible()
}

test.describe('top-up: amount validation (no network)', () => {
  test('shows minimum error and disables continue below €2', async ({ page }) => {
    await openTopUpModal(page)

    // Custom amount below the €2.00 minimum
    await page.getByPlaceholder('0.00').fill('1.00')

    await expect(page.getByText(/minimum top-up is €2\.00/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /continue/i })).toBeDisabled()
  })

  test('preset €5 enables continue', async ({ page }) => {
    await openTopUpModal(page)
    await page.getByRole('button', { name: '€5' }).click()
    await expect(page.getByRole('button', { name: /continue with €5\.00/i })).toBeEnabled()
  })
})

test.describe('top-up: EU timezone → Mollie redirect', () => {
  test.use({ timezoneId: 'Europe/Berlin' })

  test('redirects to Mollie checkout url', async ({ page }) => {
    // Stub Mollie create-payment with a same-origin checkout url so the
    // window.location redirect is observable without leaving the app.
    let mollieBody: { amountCents?: number } | null = null
    await page.route('**/api/mollie/create-payment', async (route) => {
      mollieBody = route.request().postDataJSON()
      await route.fulfill({ json: { checkoutUrl: '/garden?mollie=success' } })
    })

    await openTopUpModal(page)
    await page.getByRole('button', { name: '€5' }).click()
    await page.getByRole('button', { name: /continue/i }).click()

    await page.waitForURL(/\/garden\?mollie=success/)
    expect(mollieBody!.amountCents).toBe(500)
  })

  test('falls through to Stripe when Mollie returns 503', async ({ page }) => {
    await page.route('**/api/mollie/create-payment', (route) =>
      route.fulfill({ status: 503, json: { error: 'payment provider not configured' } }),
    )
    let stripeBody: { amountCents?: number } | null = null
    await page.route('**/api/stripe/create-payment-intent', async (route) => {
      stripeBody = route.request().postDataJSON()
      await route.fulfill({ json: { clientSecret: 'cs_test_503' } })
    })

    await openTopUpModal(page)
    await page.getByRole('button', { name: '€5' }).click()
    await page.getByRole('button', { name: /continue/i }).click()

    await expect.poll(() => stripeBody?.amountCents).toBe(500)
  })
})

test.describe('top-up: non-EU timezone → Stripe directly', () => {
  test.use({ timezoneId: 'America/New_York' })

  test('creates a Stripe payment intent with the chosen amount', async ({ page }) => {
    let stripeBody: { amountCents?: number } | null = null
    let mollieCalled = false
    await page.route('**/api/mollie/create-payment', (route) => {
      mollieCalled = true
      return route.fulfill({ json: { checkoutUrl: '/garden' } })
    })
    await page.route('**/api/stripe/create-payment-intent', async (route) => {
      stripeBody = route.request().postDataJSON()
      await route.fulfill({ json: { clientSecret: 'cs_test_direct' } })
    })

    await openTopUpModal(page)
    await page.getByRole('button', { name: '€10' }).click()
    await page.getByRole('button', { name: /continue/i }).click()

    await expect.poll(() => stripeBody?.amountCents).toBe(1000)
    // Non-EU must skip the Mollie branch entirely.
    expect(mollieCalled).toBe(false)
  })
})
