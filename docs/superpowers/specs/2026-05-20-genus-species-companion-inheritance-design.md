# Genus/Species Companion Inheritance

**Target:** v0.13.0
**Issue type:** Feature
**Affected areas:** `/api/plants/[id]`, `/api/plants/[id]/companions/[companionId]`, Plant detail page, Relationship detail page

---

## Problem

Companion data exists at genus level (e.g. `Capsicum L.` is companion of `Ocimum L.`), but a user visiting a species page (e.g. `Capsicum annuum` = "Paprika" in German) sees zero companions. The target audience is beginner gardeners who don't know that `Capsicum annuum` and `Capsicum L.` refer to the same plant family. This makes the companion feature appear broken for most plant lookups.

**Data facts:**
- ~20 genus crops have companion relationships (`Allium L.`, `Capsicum L.`, `Ocimum L.`, etc.)
- Genus crops identified by `botanicalName ~ '^[A-Z][a-z]+ [A-Z]'` (genus word + uppercase authority like `L.`, `Mill.`)
- `Allium L.` has 178 species; `Capsicum L.` has 6 species
- No schema change needed; genus membership computed from `botanicalName` prefix

---

## Design

### 1. Genus Detection (computed, no schema change)

For any crop, genus membership is computed:
1. Extract first word from `botanicalName` (e.g. `"Capsicum annuum"` → `"Capsicum"`)
2. Find a `Crop` where `botanicalName ~ '^Capsicum [A-Z]'`
3. If found → that crop is the parent genus

This is computed at query time in API routes. No new DB column or migration.

---

### 2. API: `GET /api/plants/[id]`

**Response shape additions (backward-compatible):**

```ts
type CompanionRow = {
  // existing fields unchanged
  id: string
  name: string
  botanicalName: string
  commonNames: string[]
  minTempC: number | null
  isNitrogenFixer: boolean
  relationshipId: string
  type: string
  reason: string | null
  confidence: number
  notes: string | null
  direction: string
  // NEW: set when companion is inherited from genus, not a direct relationship
  inheritedFrom?: { id: string; botanicalName: string }
}

type CropRow = {
  // existing fields unchanged
  id: string
  name: string
  botanicalName: string
  commonNames: string[]
  minTempC: number | null
  isNitrogenFixer: boolean
  // NEW: populated when this crop IS a genus crop
  species?: Array<{ id: string; botanicalName: string; name: string }>  // first 8
  speciesCount?: number
  // NEW: populated when this crop has a parent genus crop
  parentGenus?: { id: string; botanicalName: string; name: string }
}
```

**API logic for species crops:**
1. Detect parent genus (if any)
2. Fetch direct companions (existing query)
3. Fetch genus companions (same query against genus crop id)
4. Merge: direct companions first, then genus companions with `inheritedFrom` populated
5. Sort merged list by `confidence DESC`
6. Include `parentGenus` in `crop` object

**API logic for genus crops:**
1. Fetch direct companions (existing query, unchanged)
2. Fetch species: `SELECT id, "botanicalName", name FROM "Crop" WHERE "botanicalName" ~ '^Capsicum [a-z]' ORDER BY name LIMIT 8`
3. Fetch species total count
4. Include `species` and `speciesCount` in `crop` object

---

### 3. API: `GET /api/plants/[id]/companions/[companionId]`

Add genus-level resolution when no direct relationship exists:

1. Attempt to fetch direct `CropRelationship` between `id` and `companionId` (existing logic)
2. If not found:
   a. Detect parent genus of `id` and parent genus of `companionId`
   b. If both have genus crops, attempt to fetch relationship between the two genus crops
   c. If found, return relationship data with added flag: `resolvedToGenus: true`, `genusA: { id, botanicalName }`, `genusB: { id, botanicalName }`
3. If still not found, return 404 (existing behaviour)

---

### 4. Plant Detail Page (`/plants/[id]`)

**Species page (e.g. Capsicum annuum):**

- Add callout below the plant name/badges section:
  > "Part of the [Capsicum](link-to-genus-page) genus"
- In the companion list, inherited companions show a small muted label beneath the plant name: `via Capsicum L.`
- The "details" link for an inherited companion navigates to `/plants/[genusAId]/companions/[genusBId]` (not species IDs), since no species-level relation page exists

**Genus page (e.g. Capsicum L.):**

- Add a "Species" section below the plant name/badges:
  - Shows first 8 species as linked chips (→ `/plants/[speciesId]`)
  - If `speciesCount > 8`: shows "See all [N] species →" link to `/plan?q=Capsicum` (requires adding URL param support to the plan page search bar — the plant search is currently in `/plan`, not a standalone listing page)
  - If `speciesCount === 0`: section hidden
- Add muted note below companion list: "Individual species may have additional companion data. [Explore species →]" (links to species search)

---

### 5. Relationship Detail Page (`/plants/[id]/companions/[companionId]`)

**When `resolvedToGenus: true`:**

Add a banner at the top of the detail page:
> "This relationship is defined at genus level (Capsicum L. ↔ Ocimum L.) and applies to all Capsicum species."

The existing relationship data renders normally below the banner. No redirect — URL stays as-is.

**When viewing a genus crop relationship directly:**

Add a note in the detail view:
> "This relationship applies to all [N] Capsicum species. [See species →]"

---

### 6. Out of Scope for v0.13.0

- Species-to-genus confidence scoring (treat aggregated species data as ANECDOTAL) — tracked as future enhancement
- Fixing missing German translation for `Capsicum L.` ("pepper" → "Paprika/Peperoni") — separate translation issue
- Aggregating species-level companions onto genus page — only the static discovery hint is in scope

---

## Acceptance Criteria

1. Visiting `Capsicum annuum` shows Ocimum, Spinacia, and other genus-level companions labelled "via Capsicum L."
2. The "details" link from an inherited companion correctly opens the genus-level relationship page
3. Visiting `Capsicum L.` shows a species list with links to all 6 Capsicum species, plus "See all 6 species" link
4. Visiting `Capsicum L.` shows a "some species may have additional data" hint with link to species search
5. Navigating to `/plants/[annuumId]/companions/[basilicumId]` (no direct relationship) resolves to the genus relationship with the "defined at genus level" banner
6. All existing direct relationships unaffected
7. i18n: new UI strings added to all translation files (`en`, `de`, `fr`, `es`, `pt`)

---

## Files to Change

| File | Change |
|------|--------|
| `src/app/api/plants/[id]/route.ts` | Add genus detection, merge inherited companions, add `parentGenus`/`species`/`speciesCount` to response |
| `src/app/api/plants/[id]/companions/[companionId]/route.ts` | Add genus resolution fallback, `resolvedToGenus` flag |
| `src/app/[locale]/(app)/plants/[id]/page.tsx` | Render `parentGenus` callout, `inheritedFrom` labels, species section |
| `src/app/[locale]/(app)/plants/[id]/companions/[companionId]/page.tsx` | Render `resolvedToGenus` banner |
| `messages/en.json` (and de/fr/es/pt) | Add translation keys for new UI strings |
| `src/app/[locale]/(app)/plan/page.tsx` + `src/components/plant-search.tsx` | Add `q` URL param support so "see all species" link pre-fills the search |
| `tests/api/companion-detail.test.ts` | Add tests for genus resolution fallback |
