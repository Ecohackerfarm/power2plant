# Header, Nav & Landing Page — Design Spec

**Date:** 2026-05-19
**Milestone:** v0.12.0
**Issues:** #124 (landing hub), #125 (global nav header)
**Status:** Approved

---

## Goal

Replace the ad-hoc inline header on the home page with a proper global site header and a purpose-built landing hub that routes users to the right flow immediately.

---

## 1. Route Structure

Route groups split layout concerns without adding URL segments.

```
src/app/[locale]/
  (landing)/
    page.tsx              ← new 3-card hub (issue #124)
  (app)/
    layout.tsx            ← adds <SiteHeader> above children
    plan/
      page.tsx            ← current home planner moved here
    relationships/
      page.tsx            ← unchanged
    garden/
      page.tsx            ← unchanged
    contribute/
      page.tsx            ← unchanged
    plants/
      [id]/               ← unchanged
    share/
      [token]/            ← unchanged
```

`[locale]/layout.tsx` stays as-is (i18n, fonts, Toaster). `(app)/layout.tsx` is a thin wrapper that renders `<SiteHeader>` above `{children}`.

---

## 2. SiteHeader Component

**File:** `src/components/site-header.tsx`

**Layout (desktop):**
```
[logo 32px] power2plant  |  Look up a crop  Plan beds  My Garden  |  EN DE  [Sign in]
```

**Behaviour:**
- Logo: `public/logo.png` via `next/image`, height 32px, transparent background (see §4)
- App name: plain text, links to `/`
- Nav tabs: three links, active state (bold + primary underline) via `usePathname()`
  - "Look up a crop" → `/relationships` (also active on `/plants/[id]` and `/plants/[id]/companions/[companionId]`)
  - "Plan beds" → `/plan`
  - "My garden" → `/garden`
- Right slot: `<LocaleSwitcher />` + `<AuthPanel />`
- Mobile: logo + name left, hamburger or stacked tabs — tabs wrap to second row if needed (no hamburger menu, keep it simple)
- Rendered in `(app)/layout.tsx`, **not** on `/` landing

---

## 3. Landing Page (`/`)

**File:** `src/app/[locale]/(landing)/page.tsx`

**Layout:**
```
                                          [EN DE]  [Sign in]

        [logo 64px]  power2plant
        Companion planting garden planner

   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │  Look up a crop  │  │  Plan beds       │  │  My garden       │
   │                  │  │                  │  │                  │
   │  Find companions │  │  Know what you   │  │  See how plants  │
   │  & antagonists   │  │  want to grow —  │  │  in your beds    │
   │  for any plant   │  │  find what fits  │  │  get along       │
   └──────────────────┘  └──────────────────┘  └──────────────────┘
```

- Locale switcher + `AuthPanel` top-right, no full header bar
- Logo + title + subtitle centered below
- 3 cards: each is a full clickable `<Link>`, hover lifts with shadow
- Mobile: cards stack vertically
- Remove contribute/browse links from landing (per issue #124 AC — those belong in use-case A only; `Home.contributeLink` / `Home.browseLink` keys stay, used on `/relationships`)
- i18n keys needed: `Landing.title`, `Landing.subtitle`, `Landing.lookupTitle`, `Landing.lookupDesc`, `Landing.planTitle`, `Landing.planDesc`, `Landing.gardenTitle`, `Landing.gardenDesc`

---

## 4. Logo Background

**Problem:** `logo.png` has a white background; page background is `oklch(0.97 0.01 95)` (warm off-white) — visible mismatch.

**Solution:** One-time `sharp` script strips the white background, outputs `public/logo.png` as RGBA PNG with transparency. Script is deleted after run.

```
scripts/strip-logo-bg.ts   ← temporary, deleted post-run
public/logo.png            ← transparent version committed
```

Threshold: pixels with lightness > 0.93 (in oklch) treated as background. Covers near-white fringe pixels from anti-aliasing.

---

## 5. Planner Page (`/plan`)

Current `src/app/[locale]/page.tsx` content moves to `src/app/[locale]/(app)/plan/page.tsx`.

**Changes:**
- Remove inline header div (logo, title, locale switcher, auth — now in `SiteHeader`)
- Remove contribute/browse links (per issue #124 AC)
- Keep all planner logic unchanged

---

## 6. i18n

New keys added to `en.json` and `de.json`:

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

German translations added in same pass.

---

## 7. Files Changed / Created

| Action | Path |
|--------|------|
| Create | `src/components/site-header.tsx` |
| Create | `src/app/[locale]/(app)/layout.tsx` |
| Create | `src/app/[locale]/(app)/plan/page.tsx` |
| Create | `src/app/[locale]/(landing)/page.tsx` |
| Move   | `src/app/[locale]/relationships/` → `src/app/[locale]/(app)/relationships/` |
| Move   | `src/app/[locale]/garden/` → `src/app/[locale]/(app)/garden/` |
| Move   | `src/app/[locale]/contribute/` → `src/app/[locale]/(app)/contribute/` |
| Move   | `src/app/[locale]/plants/` → `src/app/[locale]/(app)/plants/` |
| Move   | `src/app/[locale]/share/` → `src/app/[locale]/(app)/share/` |
| Create | `public/logo.png` (transparent) |
| Delete | `logo.png` (root) |
| Script | `scripts/strip-logo-bg.ts` (run once, delete) |
| Update | `messages/en.json`, `messages/de.json` |
