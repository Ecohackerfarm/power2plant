import { test, expect, request as apiRequest } from '@playwright/test'
import { USER_STATE } from './auth-constants'

// Seeds a cropA/cropB research-request pair (as an authenticated user) so the
// unauthenticated list view below always has a card with both a vote button
// and a fund button to interact with.
async function seedPair() {
  const authed = await apiRequest.newContext({ storageState: USER_STATE })
  try {
    const [tomatoRes, basilRes] = await Promise.all([
      authed.get('/api/crops?q=tomato'),
      authed.get('/api/crops?q=basil'),
    ])
    const { crops: tomatoes } = await tomatoRes.json()
    const { crops: basils } = await basilRes.json()
    const cropA = tomatoes[0]
    const cropB = basils[0]

    await authed.post('/api/research-requests', {
      data: { cropAId: cropA.id, cropBId: cropB.id },
    })

    const [minId, maxId] = cropA.id < cropB.id ? [cropA.id, cropB.id] : [cropB.id, cropA.id]
    return { cardId: `pair-${minId}-${maxId}`, cropAName: cropA.name, cropBName: cropB.name }
  } finally {
    await authed.dispose()
  }
}

test('research-requests page: unauthenticated vote click opens sign-in modal', async ({ page }) => {
  const { cardId } = await seedPair()

  await page.goto('/research-requests')
  const card = page.locator(`#${cardId}`)
  await expect(card).toBeVisible()

  await card.getByRole('button', { name: 'Vote', exact: true }).click()

  // Sign-in modal opens instead of a silent no-op
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  await expect(page.getByLabel(/email/i).first()).toBeVisible()

  // Vote was not actually recorded — clicking did not flip to "Voted"
  await expect(card.getByRole('button', { name: 'Voted', exact: true })).not.toBeVisible()
})

test('research-requests page: unauthenticated fund click opens sign-in modal, not top-up', async ({ page }) => {
  const { cardId } = await seedPair()

  await page.goto('/research-requests')
  const card = page.locator(`#${cardId}`)
  await expect(card).toBeVisible()

  const fundButton = card.getByRole('button', { name: /fund research/i })
  const isDisabled = await fundButton.isDisabled()
  test.skip(isDisabled, 'Stripe is not configured in this environment')

  await fundButton.click()

  // Sign-in modal opens — never the Stripe top-up modal
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /top up balance/i })).not.toBeVisible()
})

test('research-requests page: sign-in modal closes without side effects', async ({ page }) => {
  const { cardId } = await seedPair()

  await page.goto('/research-requests')
  const card = page.locator(`#${cardId}`)
  await card.getByRole('button', { name: 'Vote', exact: true }).click()

  const modal = page.getByRole('heading', { name: /sign in/i })
  await expect(modal).toBeVisible()

  await page.getByRole('button', { name: 'Close' }).click()
  await expect(modal).not.toBeVisible()
  await expect(card.getByRole('button', { name: 'Vote', exact: true })).toBeVisible()
})
