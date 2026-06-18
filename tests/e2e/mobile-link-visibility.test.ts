import { test, expect, type Page, type Locator } from '@playwright/test'
import { routing } from '../../src/i18n/routing'

/**
 * Mobile link-visibility regression suite.
 *
 * Goal: every link (and the primary header controls) on every public page, in
 * every supported language, must be:
 *   1. visible (rendered, non-zero box, inside the viewport horizontally), and
 *   2. NOT covered by another element — i.e. a real tap at the link's centre
 *      actually lands on that link, not on something stacked on top of it.
 *
 * The app's reported bugs are mobile-only, so the whole suite runs at a phone
 * viewport. RTL (`ar`) is included because mirrored layouts are a common source
 * of overlap bugs.
 */

// iPhone-12-ish portrait. isMobile/hasTouch trigger the app's mobile breakpoints.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

// Public pages reachable without authentication. Auth-gated pages (/account,
// /admin/*) and state-dependent pages (/plan/results) are intentionally excluded
// — they need a session or pre-seeded localStorage and are covered elsewhere.
const PUBLIC_PATHS = [
  '/',
  '/plan',
  '/plan/zone',
  '/plan/plants',
  '/relationships',
  '/garden',
  '/contribute',
  '/donate',
  '/research-requests',
] as const

// Allow a sub-pixel of bleed for fractional layout rounding.
const EDGE_TOLERANCE = 1

type Offence = { detail: string }

/**
 * Asserts a single element is on-screen and tappable.
 * Returns a human-readable offence string, or null when the element is fine.
 *
 * Coverage is checked with elementFromPoint at the element's centre: the topmost
 * element there must be the target itself, an ancestor, or a descendant (links
 * wrap spans/images, so a child hit is expected and fine). Anything else means
 * some other node is stacked on top and would steal the tap.
 */
async function inspect(page: Page, el: Locator, label: string): Promise<Offence | null> {
  // visibility: must be rendered at all
  if (!(await el.isVisible())) return { detail: `${label}: not visible` }

  // Bring the element into the viewport: elementFromPoint only resolves points
  // inside the current viewport, so a below-the-fold link must be scrolled to
  // first or it would falsely register as "covered". The sticky header is fixed,
  // so a link that scrolls underneath it is still correctly caught as covered.
  await el.scrollIntoViewIfNeeded().catch(() => {})

  const box = await el.boundingBox()
  if (!box) return { detail: `${label}: no bounding box` }
  if (box.width <= 0 || box.height <= 0) {
    return { detail: `${label}: zero-size box (${box.width}x${box.height})` }
  }

  const viewport = page.viewportSize()!

  // horizontal overflow / clipping — a classic mobile problem
  if (box.x < -EDGE_TOLERANCE) {
    return { detail: `${label}: clipped off left edge (x=${box.x.toFixed(1)})` }
  }
  if (box.x + box.width > viewport.width + EDGE_TOLERANCE) {
    return {
      detail: `${label}: overflows right edge (right=${(box.x + box.width).toFixed(1)} > ${viewport.width})`,
    }
  }

  // coverage / overlap — does a tap at the centre actually reach this element?
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const covered = await el.evaluate(
    (node, { x, y }) => {
      const top = document.elementFromPoint(x, y)
      if (!top) return 'nothing at centre point (off-screen?)'
      if (top === node || node.contains(top) || top.contains(node)) return null
      // Describe the obscuring element for a useful failure message.
      const tag = top.tagName.toLowerCase()
      const cls = typeof top.className === 'string' ? top.className.slice(0, 60) : ''
      const txt = (top.textContent ?? '').trim().slice(0, 30)
      return `covered by <${tag} class="${cls}"> "${txt}"`
    },
    { x: cx, y: cy },
  )
  if (covered) return { detail: `${label}: ${covered}` }

  return null
}

/** Stable label for an element so failures point at the right link. */
async function labelFor(el: Locator, index: number): Promise<string> {
  const text = (await el.textContent().catch(() => ''))?.trim().replace(/\s+/g, ' ').slice(0, 40)
  const href = await el.getAttribute('href').catch(() => null)
  const aria = await el.getAttribute('aria-label').catch(() => null)
  const name = text || aria || href || `link#${index}`
  return href ? `${name} (→ ${href})` : name
}

/** Inspect a set of links and return all offences found. */
async function inspectAll(page: Page, links: Locator): Promise<string[]> {
  const offences: string[] = []
  const count = await links.count()
  for (let i = 0; i < count; i++) {
    const el = links.nth(i)
    // Skip links that aren't visible in this state (conditionally rendered etc.)
    if (!(await el.isVisible().catch(() => false))) continue
    const label = await labelFor(el, i)
    const offence = await inspect(page, el, label)
    if (offence) offences.push(offence.detail)
  }
  return offences
}

for (const locale of routing.locales) {
  test.describe(`mobile link visibility — ${locale}`, () => {
    for (const path of PUBLIC_PATHS) {
      test(`${locale} ${path}`, async ({ page }) => {
        // Next's dev server compiles each route on first hit, which can take a
        // while; production builds are far faster. Give navigation generous head
        // room so a slow first compile isn't mistaken for a layout bug.
        test.setTimeout(60_000)
        const offences: string[] = []

        // domcontentloaded (not 'load'): we don't want to block on heavy 3rd-party
        // scripts (e.g. Stripe on /donate) — the markup we measure is already there.
        await page.goto(`/${locale}${path === '/' ? '' : path}`, {
          waitUntil: 'domcontentloaded',
          timeout: 45_000,
        })
        // Wait for the first link to render rather than for a specific chrome
        // element — the landing page has no site header, app pages do.
        await page.locator('a').first().waitFor({ state: 'attached', timeout: 15000 })
        // Let client hydration settle (auth panel renders null while pending).
        // Bounded: some pages keep a connection open (toasts, fonts) and never
        // reach true network-idle, so cap the wait instead of burning the budget.
        await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {})
        await page.waitForTimeout(300)

        // --- Pass A: header controls (the area users reported as broken) ---
        // The site header (banner) only exists on app pages, not the landing
        // page. When present, these controls live in the top bar and are the
        // most likely to collide on a narrow screen. The user account control is
        // either a "sign in" button (logged out) or an avatar menu (logged in);
        // accept whichever renders.
        const header = page.getByRole('banner')
        const hasHeader = (await header.count()) > 0
        const toggle = header.getByRole('button', { name: /toggle menu/i })
        if (hasHeader) {
          const headerControls: Record<string, Locator> = {
            hamburger: toggle,
            logo: header.getByRole('link', { name: /power2plant/i }).first(),
            language: header.getByLabel(/language/i),
            feedback: header.getByRole('button').filter({ hasText: /feedback/i }).first(),
          }
          for (const [name, ctrl] of Object.entries(headerControls)) {
            if (!(await ctrl.isVisible().catch(() => false))) continue
            const offence = await inspect(page, ctrl, `header:${name}`)
            if (offence) offences.push(offence.detail)
          }
        }

        // --- Pass B: all body links, menu CLOSED ---
        // With the dropdown closed, every link in the DOM is a page/body link.
        // Checking coverage here catches links hidden behind sticky bars,
        // overlapping cards, off-screen content, etc.
        offences.push(...(await inspectAll(page, page.locator('a:visible'))))

        // --- Pass C: nav links, menu OPEN ---
        // The primary nav (Find Companions / Plan Beds / My Garden, +admin) lives
        // inside the hamburger dropdown and only exists in the DOM when open.
        if (hasHeader && (await toggle.isVisible().catch(() => false))) {
          await toggle.click()
          // The dropdown is a positioned panel right after the toggle button.
          const menu = header.locator('div.absolute')
          await expect(menu.first()).toBeVisible()
          offences.push(...(await inspectAll(page, menu.getByRole('link'))))
        }

        expect(
          offences,
          `Hidden/covered/overflowing links on ${locale} ${path}:\n  - ${offences.join('\n  - ')}`,
        ).toEqual([])
      })
    }
  })
}
