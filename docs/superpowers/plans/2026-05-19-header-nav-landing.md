# Header, Nav & Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global site header with logo/nav/locale/auth, replace the home planner page with a 3-card landing hub, move the planner to `/plan`, and fix the logo background.

**Architecture:** Route groups split layout concerns — `(landing)/` renders `/` without a header bar, `(app)/` wraps all other routes with `<SiteHeader>`. Logo PNG background is stripped to transparency with a one-time `sharp` script.

**Tech Stack:** Next.js App Router (route groups), next/image, next-intl, sharp, Tailwind CSS

---

### Task 1: Create `public/` directory and transparent logo

**Files:**
- Create: `scripts/strip-logo-bg.ts` (deleted after run)
- Create: `public/logo.png`

- [ ] **Step 1: Install sharp**

```bash
pnpm add -D sharp @types/node
```

Expected: `sharp` added to `devDependencies` in `package.json`.

- [ ] **Step 2: Create the strip script**

Create `scripts/strip-logo-bg.ts`:

```ts
import sharp from 'sharp'
import { resolve } from 'path'
import { mkdirSync } from 'fs'

const INPUT = resolve('logo.png')
const OUTPUT = resolve('public/logo.png')

mkdirSync('public', { recursive: true })

const { data, info } = await sharp(INPUT)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

const pixels = new Uint8Array(data)
const THRESHOLD = 238

for (let i = 0; i < pixels.length; i += 4) {
  if (pixels[i] > THRESHOLD && pixels[i + 1] > THRESHOLD && pixels[i + 2] > THRESHOLD) {
    pixels[i + 3] = 0
  }
}

await sharp(Buffer.from(pixels), {
  raw: { width: info.width, height: info.height, channels: 4 },
})
  .png()
  .toFile(OUTPUT)

console.log(`Done → ${OUTPUT}`)
```

- [ ] **Step 3: Run the script**

```bash
tsx scripts/strip-logo-bg.ts
```

Expected output: `Done → /app/public/logo.png`

- [ ] **Step 4: Delete the script**

```bash
rm scripts/strip-logo-bg.ts
```

- [ ] **Step 5: Commit**

```bash
git add public/logo.png package.json pnpm-lock.yaml
git commit -m "feat: add transparent logo to public/"
```

---

### Task 2: Add i18n keys for Landing and Nav

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/de.json`

- [ ] **Step 1: Add keys to `messages/en.json`**

Add the following two top-level keys to `messages/en.json` (before the closing `}`):

```json
  "Landing": {
    "title": "power2plant",
    "subtitle": "Companion planting garden planner",
    "lookupTitle": "Look up a crop",
    "lookupDesc": "Find companions and antagonists for any plant",
    "planTitle": "Plan beds",
    "planDesc": "Know what you want to grow — find what fits together",
    "gardenTitle": "My garden",
    "gardenDesc": "See how the plants in your beds get along"
  },
  "Nav": {
    "lookup": "Look up a crop",
    "plan": "Plan beds",
    "garden": "My garden"
  }
```

- [ ] **Step 2: Add keys to `messages/de.json`**

Add the same two keys to `messages/de.json`:

```json
  "Landing": {
    "title": "power2plant",
    "subtitle": "Begleitpflanzung — Gartenplaner",
    "lookupTitle": "Pflanze nachschlagen",
    "lookupDesc": "Begleiter und Antagonisten für jede Pflanze finden",
    "planTitle": "Beete planen",
    "planDesc": "Du weißt, was du anbauen willst — finde, was zusammenpasst",
    "gardenTitle": "Mein Garten",
    "gardenDesc": "Schau, wie die Pflanzen in deinen Beeten miteinander auskommen"
  },
  "Nav": {
    "lookup": "Pflanze nachschlagen",
    "plan": "Beete planen",
    "garden": "Mein Garten"
  }
```

- [ ] **Step 3: Commit**

```bash
git add messages/en.json messages/de.json
git commit -m "feat(i18n): add Landing and Nav translation keys"
```

---

### Task 3: Create `SiteHeader` component

**Files:**
- Create: `src/components/site-header.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/site-header.tsx`:

```tsx
'use client'
import Image from 'next/image'
import { Link, usePathname } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { AuthPanel } from '@/components/auth-panel'

const NAV_ITEMS = [
  { key: 'lookup' as const, href: '/relationships' },
  { key: 'plan' as const, href: '/plan' },
  { key: 'garden' as const, href: '/garden' },
] satisfies { key: 'lookup' | 'plan' | 'garden'; href: string }[]

function isActive(pathname: string, href: string): boolean {
  if (href === '/relationships') {
    return pathname.startsWith('/relationships') || pathname.startsWith('/plants')
  }
  return pathname === href || pathname.startsWith(href + '/')
}

export function SiteHeader() {
  const t = useTranslations('Nav')
  const pathname = usePathname()

  return (
    <header className="border-b bg-background sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image src="/logo.png" alt="" width={32} height={32} />
          <span className="font-semibold text-sm">power2plant</span>
        </Link>
        <nav className="flex items-center gap-1 flex-1 flex-wrap">
          {NAV_ITEMS.map(({ key, href }) => (
            <Link
              key={key}
              href={href}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                isActive(pathname, href)
                  ? 'font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-4'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(key)}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 shrink-0">
          <LocaleSwitcher />
          <AuthPanel />
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/site-header.tsx
git commit -m "feat: add SiteHeader component"
```

---

### Task 4: Create `(app)` route group with layout

**Files:**
- Create: `src/app/[locale]/(app)/layout.tsx`

- [ ] **Step 1: Create the layout**

Create `src/app/[locale]/(app)/layout.tsx`:

```tsx
import { SiteHeader } from '@/components/site-header'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\[locale\]/\(app\)/layout.tsx
git commit -m "feat: add (app) route group layout with SiteHeader"
```

---

### Task 5: Move existing routes into `(app)` and strip inline headers

This task moves `relationships/`, `garden/`, `contribute/`, `plants/`, and `share/` into the `(app)/` group, removing the per-page locale switcher, auth panel, and back-to-home links that are now handled by the header.

**Files:**
- Move: `src/app/[locale]/relationships/page.tsx` → `src/app/[locale]/(app)/relationships/page.tsx`
- Move: `src/app/[locale]/garden/page.tsx` → `src/app/[locale]/(app)/garden/page.tsx`
- Move: `src/app/[locale]/contribute/page.tsx` → `src/app/[locale]/(app)/contribute/page.tsx`
- Move: `src/app/[locale]/plants/` → `src/app/[locale]/(app)/plants/`
- Move: `src/app/[locale]/share/` → `src/app/[locale]/(app)/share/`

- [ ] **Step 1: Move directories with git**

```bash
mkdir -p "src/app/[locale]/(app)"
git mv "src/app/[locale]/relationships" "src/app/[locale]/(app)/relationships"
git mv "src/app/[locale]/garden" "src/app/[locale]/(app)/garden"
git mv "src/app/[locale]/contribute" "src/app/[locale]/(app)/contribute"
git mv "src/app/[locale]/plants" "src/app/[locale]/(app)/plants"
git mv "src/app/[locale]/share" "src/app/[locale]/(app)/share"
```

- [ ] **Step 2: Strip inline header from `(app)/relationships/page.tsx`**

Remove the `backHome` link block. Find and delete these lines:

```tsx
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          {t('backHome')}
        </Link>
```

Also remove the `Link` import if it becomes unused after this change — check whether `Link` is used elsewhere in that file first:

```bash
grep -n "Link" "src/app/[locale]/(app)/relationships/page.tsx"
```

If `Link` only appeared in the back-home link, remove its import line too.

- [ ] **Step 3: Strip inline header from `(app)/garden/page.tsx`**

Remove the entire header div and its imports. The current header block is:

```tsx
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            {t('backHome')}
          </Link>
          <h1 className="text-3xl font-bold mt-2">{t('title')}</h1>
          <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <AuthPanel />
        </div>
      </div>
```

Replace it with just the title block (no back link, no locale/auth):

```tsx
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>
```

Remove the now-unused imports at the top of the file:

```tsx
import { Link } from '@/i18n/navigation'          // remove
import { AuthPanel } from '@/components/auth-panel'   // remove
import { LocaleSwitcher } from '@/components/locale-switcher'  // remove
```

- [ ] **Step 4: Strip inline header from `(app)/contribute/page.tsx`**

Find and remove the back link (line ~203):

```tsx
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">{t('back')}</Link>
```

Check if `Link` from `@/i18n/navigation` is used elsewhere in the file:

```bash
grep -n "from '@/i18n/navigation'" "src/app/[locale]/(app)/contribute/page.tsx"
grep -n "<Link" "src/app/[locale]/(app)/contribute/page.tsx"
```

Remove the `Link` import if no other `<Link>` tags remain.

- [ ] **Step 5: Strip backHome from `(app)/share/[token]/page.tsx`**

Find and remove the `backHome` link block in that file. Check first:

```bash
grep -n "backHome\|Link" "src/app/[locale]/(app)/share/[token]/page.tsx"
```

Remove the link element and the `Link` import if it becomes unused.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/[locale]/(app)"
git commit -m "feat: move routes into (app) group, strip inline headers"
```

---

### Task 6: Create `/plan` page and new landing page (atomic)

This task is atomic: creating `(app)/plan/page.tsx`, creating `(landing)/page.tsx`, and deleting the old `[locale]/page.tsx` must all happen in the same commit because the old and new root pages conflict.

**Files:**
- Create: `src/app/[locale]/(app)/plan/page.tsx`
- Create: `src/app/[locale]/(landing)/page.tsx`
- Delete: `src/app/[locale]/page.tsx`

- [ ] **Step 1: Create `(app)/plan/page.tsx`**

This is the current `[locale]/page.tsx` with the inline header section, contribute/browse links, and Separator removed. Create `src/app/[locale]/(app)/plan/page.tsx`:

```tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { useGarden } from '@/hooks/use-garden'
import { ZoneDetector } from '@/components/zone-detector'
import { BedConfig } from '@/components/bed-config'
import { RecommendationDisplay } from '@/components/recommendation-display'
import { Button } from '@/components/ui/button'
import { PlantSearch } from '@/components/plant-search'
import type { RecommendResult } from '@/lib/recommend'

type RecommendResponse = RecommendResult & { alternatives: RecommendResult[] }

export default function PlanPage() {
  const t = useTranslations('Home')
  const { state, hydrated, setZone, addToWishlist, removeFromWishlist, clearWishlist, setBeds } = useGarden()
  const [result, setResult] = useState<RecommendResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockedBeds, setLockedBeds] = useState<string[][] | null>(null)
  const autoTriggered = useRef(false)

  const canRecommend = state.minTempC !== null && state.wishlist.length >= 2

  useEffect(() => {
    if (!hydrated || autoTriggered.current) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('autoRecommend') !== '1') return
    window.history.replaceState({}, '', window.location.pathname)
    autoTriggered.current = true
    if (state.minTempC !== null && state.wishlist.length >= 2) {
      void getRecommendations()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  async function getRecommendations() {
    if (!canRecommend) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cropIds: state.wishlist,
          bedCount: state.bedCount,
          bedCapacity: state.bedCapacity,
          minTempC: state.minTempC,
          ...(lockedBeds ? { existingBeds: lockedBeds } : {}),
        }),
      })
      if (!res.ok) throw new Error('Recommendation request failed.')
      setResult(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex justify-center">
        <Link
          href="/garden"
          className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-8 h-9 text-sm font-medium hover:bg-primary/80 transition-colors"
        >
          {t('myGarden')}
        </Link>
      </div>

      {lockedBeds && (
        <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          <span>{t('addingToGarden')}</span>
          <button
            className="ml-auto underline hover:no-underline"
            onClick={() => setLockedBeds(null)}
          >
            {t('startFresh')}
          </button>
        </div>
      )}

      <ZoneDetector minTempC={state.minTempC} onZoneDetected={setZone} />

      <PlantSearch
        wishlistIds={state.wishlist}
        onAdd={addToWishlist}
        onRemove={removeFromWishlist}
        onClearAll={clearWishlist}
      />

      <BedConfig
        bedCount={state.bedCount}
        bedCapacity={state.bedCapacity}
        onChange={setBeds}
      />

      <div className="flex items-center gap-4">
        <Button
          size="lg"
          onClick={getRecommendations}
          disabled={!canRecommend || loading}
        >
          {loading ? t('calculating') : t('getRecommendations')}
        </Button>
        {!canRecommend && (
          <p className="text-sm text-muted-foreground">
            {state.minTempC === null ? t('detectZoneFirst') : t('addAtLeast2')}
          </p>
        )}
      </div>

      {error && <p className="text-red-600">{error}</p>}

      {result && (
        <RecommendationDisplay
          result={result}
          alternatives={result.alternatives}
        />
      )}
    </main>
  )
}
```

- [ ] **Step 2: Create `(landing)/page.tsx`**

Create `src/app/[locale]/(landing)/page.tsx`:

```tsx
'use client'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { AuthPanel } from '@/components/auth-panel'

const CARDS = [
  { titleKey: 'lookupTitle', descKey: 'lookupDesc', href: '/relationships' },
  { titleKey: 'planTitle', descKey: 'planDesc', href: '/plan' },
  { titleKey: 'gardenTitle', descKey: 'gardenDesc', href: '/garden' },
] as const

export default function LandingPage() {
  const t = useTranslations('Landing')

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-end items-center gap-3 mb-8">
          <LocaleSwitcher />
          <AuthPanel />
        </div>
        <div className="flex flex-col items-center text-center mb-12">
          <Image src="/logo.png" alt="" width={64} height={64} className="mb-4" />
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-2">{t('subtitle')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {CARDS.map(({ titleKey, descKey, href }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col gap-2 rounded-xl border bg-card p-6 hover:shadow-md transition-shadow"
            >
              <h2 className="font-semibold">{t(titleKey)}</h2>
              <p className="text-sm text-muted-foreground">{t(descKey)}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Delete the old root page**

```bash
git rm "src/app/[locale]/page.tsx"
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/(app)/plan" "src/app/[locale]/(landing)"
git commit -m "feat: add landing hub at / and move planner to /plan"
```

---

### Task 7: Update e2e smoke tests

The existing smoke tests check for the old home page content. Update them to match the new structure.

**Files:**
- Modify: `tests/e2e/smoke.test.ts`

- [ ] **Step 1: Update the smoke tests**

Replace the first two tests in `tests/e2e/smoke.test.ts` with:

```ts
test('landing page shows 3 use-case cards', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'power2plant' })).toBeVisible()
  await expect(page.getByRole('link', { name: /look up a crop/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /plan beds/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /my garden/i })).toBeVisible()
})

test('plan page has site header with nav', async ({ page }) => {
  await page.goto('/plan')
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('link', { name: /look up a crop/i })).toBeVisible()
})
```

- [ ] **Step 2: Run e2e tests**

```bash
pnpm test:e2e
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/smoke.test.ts
git commit -m "test(e2e): update smoke tests for new landing and /plan route"
```

---

### Task 8: Verify build and run unit tests

- [ ] **Step 1: Run unit tests**

```bash
pnpm test:run
```

Expected: all pass (no unit tests touch the moved pages).

- [ ] **Step 2: Verify production build**

```bash
pnpm build
```

Expected: build completes with no errors. Check that no "missing page" or "duplicate route" warnings appear.

- [ ] **Step 3: Commit if any fixes were needed**

If the build revealed issues, fix them and commit before marking this task done.
