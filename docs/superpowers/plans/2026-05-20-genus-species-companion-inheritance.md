# Genus/Species Companion Inheritance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make genus-level companion data (e.g. `Capsicum L.` companions) visible on species pages (e.g. `Capsicum annuum`), with inheritance labels, species lists on genus pages, and genus resolution on the relationship detail page.

**Architecture:** No schema changes. Genus membership is computed at query time via `botanicalName` prefix matching. Plant API merges inherited companions with `inheritedFrom` metadata. Companion detail API falls back to genus-level relationship when no direct one exists (`resolvedToGenus: true`). UI renders callouts, labels, and species sections based on the new response fields.

**Tech Stack:** Next.js App Router, Prisma raw SQL (`$queryRaw`), vitest, next-intl (en + de)

---

## File Map

| File | Change |
|------|--------|
| `src/lib/crop-rank.ts` | Add `extractGenusWord` export |
| `tests/lib/crop-rank.test.ts` | New: unit tests for `extractGenusWord` and `detectRank` |
| `src/app/api/plants/[id]/route.ts` | Add genus/species enrichment (parentGenus, inherited companions, species list) |
| `tests/api/plant-detail.test.ts` | New: plant API tests |
| `src/app/api/plants/[id]/companions/[companionId]/route.ts` | Add genus resolution fallback |
| `tests/api/companion-detail.test.ts` | Extend with genus resolution tests |
| `src/components/plant-search.tsx` | Add `initialQuery` prop |
| `src/app/[locale]/(app)/plan/page.tsx` | Read `?q=` URL param, pass to PlantSearch |
| `src/app/[locale]/(app)/plants/[id]/page.tsx` | parentGenus callout, inheritedFrom labels, species section |
| `src/app/[locale]/(app)/plants/[id]/companions/[companionId]/page.tsx` | resolvedToGenus banner, genus note |
| `messages/en.json` | Add new PlantPage and RelationshipPage keys |
| `messages/de.json` | Add German translations for same keys |

---

### Task 1: Add `extractGenusWord` to `crop-rank.ts`

**Files:**
- Modify: `src/lib/crop-rank.ts`
- Create: `tests/lib/crop-rank.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/crop-rank.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { detectRank, extractGenusWord } from '@/lib/crop-rank'

describe('detectRank', () => {
  it('returns genus for "Capsicum L."', () => {
    expect(detectRank('Capsicum L.')).toBe('genus')
  })
  it('returns genus for "Allium Mill."', () => {
    expect(detectRank('Allium Mill.')).toBe('genus')
  })
  it('returns species for "Capsicum annuum"', () => {
    expect(detectRank('Capsicum annuum')).toBe('species')
  })
  it('returns species for "Solanum lycopersicum"', () => {
    expect(detectRank('Solanum lycopersicum')).toBe('species')
  })
})

describe('extractGenusWord', () => {
  it('extracts Capsicum from species name', () => {
    expect(extractGenusWord('Capsicum annuum')).toBe('Capsicum')
  })
  it('extracts Capsicum from genus name with authority', () => {
    expect(extractGenusWord('Capsicum L.')).toBe('Capsicum')
  })
  it('extracts Solanum from multi-word species', () => {
    expect(extractGenusWord('Solanum lycopersicum')).toBe('Solanum')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
ssh app-dev "pnpm test:run tests/lib/crop-rank.test.ts"
```
Expected: FAIL — `extractGenusWord is not exported from '@/lib/crop-rank'`

- [ ] **Step 3: Add `extractGenusWord` to `src/lib/crop-rank.ts`**

Add after the existing `detectRank` function (around line 29):

```ts
export function extractGenusWord(botanicalName: string): string {
  return botanicalName.trim().split(/\s+/)[0]
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
ssh app-dev "pnpm test:run tests/lib/crop-rank.test.ts"
```
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/crop-rank.ts tests/lib/crop-rank.test.ts
git commit -m "feat(lib): add extractGenusWord helper to crop-rank"
```

---

### Task 2: Plant API — genus/species enrichment

**Files:**
- Create: `tests/api/plant-detail.test.ts`
- Modify: `src/app/api/plants/[id]/route.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/api/plant-detail.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/plants/[id]/route'

vi.mock('@/lib/prisma', () => ({
  default: { $queryRaw: vi.fn() },
}))

import prisma from '@/lib/prisma'

function makeReq(id: string) {
  return new Request(`http://localhost/api/plants/${id}`)
}

const fakeSpeciesCrop = {
  id: 'annuum-id',
  name: 'Capsicum annuum',
  botanicalName: 'Capsicum annuum',
  commonNames: ['Paprika', 'Bell Pepper'],
  minTempC: null,
  isNitrogenFixer: false,
}

const fakeGenusCrop = {
  id: 'capsicum-l-id',
  name: 'pepper',
  botanicalName: 'Capsicum L.',
  commonNames: [],
  minTempC: null,
  isNitrogenFixer: false,
}

const fakeCompanion = {
  id: 'basil-id',
  name: 'basil',
  botanicalName: 'Ocimum L.',
  commonNames: ['Basil'],
  minTempC: null,
  isNitrogenFixer: false,
  relationshipId: 'rel-1',
  type: 'COMPANION',
  reason: null,
  confidence: 3,
  notes: null,
  direction: 'MUTUAL',
}

describe('GET /api/plants/[id] — 404', () => {
  beforeEach(() => vi.mocked(prisma.$queryRaw).mockReset())

  it('returns 404 for unknown crop', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([])
    const res = await GET(makeReq('unknown'), {
      params: Promise.resolve({ id: 'unknown' }),
    })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/plants/[id] — species enrichment', () => {
  beforeEach(() => vi.mocked(prisma.$queryRaw).mockReset())

  it('includes parentGenus and inherited companions for species crops', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([fakeSpeciesCrop])  // crop lookup
      .mockResolvedValueOnce([])                  // direct companions
      .mockResolvedValueOnce([fakeGenusCrop])      // parent genus lookup
      .mockResolvedValueOnce([fakeCompanion])      // genus companions

    const res = await GET(makeReq('annuum-id'), {
      params: Promise.resolve({ id: 'annuum-id' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.crop.parentGenus).toEqual({
      id: 'capsicum-l-id',
      botanicalName: 'Capsicum L.',
      name: 'pepper',
    })
    expect(body.companions).toHaveLength(1)
    expect(body.companions[0].id).toBe('basil-id')
    expect(body.companions[0].inheritedFrom).toEqual({
      id: 'capsicum-l-id',
      botanicalName: 'Capsicum L.',
    })
  })

  it('does not duplicate companions that exist both directly and at genus level', async () => {
    const directCompanion = { ...fakeCompanion, relationshipId: 'rel-direct' }
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([fakeSpeciesCrop])
      .mockResolvedValueOnce([directCompanion])  // direct: basil already present
      .mockResolvedValueOnce([fakeGenusCrop])
      .mockResolvedValueOnce([fakeCompanion])    // genus: same basil

    const res = await GET(makeReq('annuum-id'), {
      params: Promise.resolve({ id: 'annuum-id' }),
    })
    const body = await res.json()
    expect(body.companions).toHaveLength(1)
    expect(body.companions[0].inheritedFrom).toBeUndefined()
  })

  it('returns no parentGenus when no matching genus crop exists in DB', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([fakeSpeciesCrop])
      .mockResolvedValueOnce([fakeCompanion])  // has direct companions
      .mockResolvedValueOnce([])               // no genus found in DB

    const res = await GET(makeReq('annuum-id'), {
      params: Promise.resolve({ id: 'annuum-id' }),
    })
    const body = await res.json()
    expect(body.crop.parentGenus).toBeUndefined()
    expect(body.companions[0].inheritedFrom).toBeUndefined()
  })
})

describe('GET /api/plants/[id] — genus enrichment', () => {
  beforeEach(() => vi.mocked(prisma.$queryRaw).mockReset())

  it('returns species list and count for genus crops', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([fakeGenusCrop])   // crop lookup
      .mockResolvedValueOnce([fakeCompanion])   // direct companions
      .mockResolvedValueOnce([                  // species list
        { id: 'annuum-id', botanicalName: 'Capsicum annuum', name: 'Capsicum annuum' },
        { id: 'baccatum-id', botanicalName: 'Capsicum baccatum', name: 'aji' },
      ])
      .mockResolvedValueOnce([{ count: BigInt(6) }])  // total count

    const res = await GET(makeReq('capsicum-l-id'), {
      params: Promise.resolve({ id: 'capsicum-l-id' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.crop.species).toHaveLength(2)
    expect(body.crop.species[0].id).toBe('annuum-id')
    expect(body.crop.speciesCount).toBe(6)
    expect(body.crop.parentGenus).toBeUndefined()
  })

  it('returns empty species and count 0 when genus has no known species', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([fakeGenusCrop])
      .mockResolvedValueOnce([])                        // no companions
      .mockResolvedValueOnce([])                        // no species
      .mockResolvedValueOnce([{ count: BigInt(0) }])

    const res = await GET(makeReq('capsicum-l-id'), {
      params: Promise.resolve({ id: 'capsicum-l-id' }),
    })
    const body = await res.json()
    expect(body.crop.species).toHaveLength(0)
    expect(body.crop.speciesCount).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
ssh app-dev "pnpm test:run tests/api/plant-detail.test.ts"
```
Expected: FAIL — `parentGenus`, `inheritedFrom`, `species`, `speciesCount` fields not present in response

- [ ] **Step 3: Replace `src/app/api/plants/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { detectRank, extractGenusWord } from '@/lib/crop-rank'

type CropRow = {
  id: string
  name: string
  botanicalName: string
  commonNames: string[]
  minTempC: number | null
  isNitrogenFixer: boolean
}

type GenusInfo = { id: string; botanicalName: string; name: string }
type SpeciesRow = { id: string; botanicalName: string; name: string }

type CompanionRow = CropRow & {
  relationshipId: string
  type: string
  reason: string | null
  confidence: number
  notes: string | null
  direction: string
  inheritedFrom?: { id: string; botanicalName: string }
}

async function fetchCompanions(cropId: string): Promise<CompanionRow[]> {
  return prisma.$queryRaw<CompanionRow[]>`
    SELECT
      c.id, c.name, c."botanicalName", c."commonNames", c."minTempC", c."isNitrogenFixer",
      cr.id AS "relationshipId", cr.type, cr.reason, cr.confidence, cr.notes, cr.direction
    FROM "CropRelationship" cr
    JOIN "Crop" c ON (
      CASE WHEN cr."cropAId" = ${cropId} THEN cr."cropBId" ELSE cr."cropAId" END = c.id
    )
    WHERE
      (cr."cropAId" = ${cropId} OR cr."cropBId" = ${cropId})
      AND cr.type IN ('COMPANION', 'ATTRACTS', 'NURSE', 'TRAP_CROP')
    ORDER BY cr.confidence DESC
  `
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const crops = await prisma.$queryRaw<CropRow[]>`
    SELECT id, name, "botanicalName", "commonNames", "minTempC", "isNitrogenFixer"
    FROM "Crop" WHERE id = ${id}
  `
  const crop = crops[0]
  if (!crop) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const rank = detectRank(crop.botanicalName)
  const genusWord = extractGenusWord(crop.botanicalName)

  const directCompanions = await fetchCompanions(id)

  let companions: CompanionRow[] = directCompanions
  let parentGenus: GenusInfo | undefined
  let species: SpeciesRow[] | undefined
  let speciesCount: number | undefined

  if (rank === 'species') {
    const genusPattern = `^${genusWord} [A-Z]`
    const genusRows = await prisma.$queryRaw<GenusInfo[]>`
      SELECT id, name, "botanicalName" FROM "Crop"
      WHERE "botanicalName" ~ ${genusPattern}
      LIMIT 1
    `
    const genus = genusRows[0]
    if (genus) {
      parentGenus = genus
      const genusCompanions = await fetchCompanions(genus.id)
      const directIds = new Set(directCompanions.map(c => c.id))
      const inherited = genusCompanions
        .filter(c => !directIds.has(c.id))
        .map(c => ({ ...c, inheritedFrom: { id: genus.id, botanicalName: genus.botanicalName } }))
      companions = [...directCompanions, ...inherited].sort((a, b) => b.confidence - a.confidence)
    }
  } else if (rank === 'genus') {
    const speciesPattern = `^${genusWord} [a-z]`
    const speciesRows = await prisma.$queryRaw<SpeciesRow[]>`
      SELECT id, name, "botanicalName" FROM "Crop"
      WHERE "botanicalName" ~ ${speciesPattern}
      ORDER BY name LIMIT 8
    `
    const countRows = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) FROM "Crop" WHERE "botanicalName" ~ ${speciesPattern}
    `
    species = speciesRows
    speciesCount = Number(countRows[0]?.count ?? 0)
  }

  const cropResponse = {
    ...crop,
    ...(parentGenus !== undefined ? { parentGenus } : {}),
    ...(species !== undefined ? { species, speciesCount } : {}),
  }

  return NextResponse.json({ crop: cropResponse, companions })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
ssh app-dev "pnpm test:run tests/api/plant-detail.test.ts"
```
Expected: PASS (8 tests)

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
ssh app-dev "pnpm test:run"
```
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/app/api/plants/\[id\]/route.ts tests/api/plant-detail.test.ts
git commit -m "feat(api): plant route returns genus context and inherited companions"
```

---

### Task 3: Companion detail API — genus resolution fallback

**Files:**
- Modify: `src/app/api/plants/[id]/companions/[companionId]/route.ts`
- Modify: `tests/api/companion-detail.test.ts`

- [ ] **Step 1: Write failing tests**

Add at the end of `tests/api/companion-detail.test.ts` (after existing `describe` block):

```ts
describe('genus resolution fallback', () => {
  // IDs chosen so lexical order: annuumId < basilicumId (canonical: cropA=annuum, cropB=basil)
  const annuumId = 'aaa-annuum'
  const basilicumId = 'zzz-basil'
  const capsicumLId = 'capsicum-l-id'
  const ocimumLId = 'ocimum-l-id'

  const fakeGenusRel = {
    relId: 'genus-rel-1', type: 'COMPANION', reason: null, reasons: [],
    confidence: 3, notes: null, direction: 'MUTUAL',
    cropAId: capsicumLId, cropAName: 'pepper', cropABotanical: 'Capsicum L.',
    cropACommonNames: [], cropANitrogen: false,
    cropBId: ocimumLId, cropBName: 'basil', cropBBotanical: 'Ocimum L.',
    cropBCommonNames: [], cropBNitrogen: false,
  }

  it('resolves to genus relationship when no direct species relationship exists', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])  // no direct relationship
      .mockResolvedValueOnce([    // fetch both crops
        { id: annuumId, botanicalName: 'Capsicum annuum' },
        { id: basilicumId, botanicalName: 'Ocimum basilicum' },
      ])
      .mockResolvedValueOnce([{ id: capsicumLId, botanicalName: 'Capsicum L.' }])  // genus for Capsicum
      .mockResolvedValueOnce([{ id: ocimumLId, botanicalName: 'Ocimum L.' }])      // genus for Ocimum
      .mockResolvedValueOnce([fakeGenusRel])  // genus relationship

    vi.mocked(prisma.relationshipSource.findMany).mockResolvedValue([])

    const res = await GET(makeReq(annuumId, basilicumId), {
      params: Promise.resolve({ id: annuumId, companionId: basilicumId }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.relationship.resolvedToGenus).toBe(true)
    expect(body.relationship.genusA).toEqual({ id: capsicumLId, botanicalName: 'Capsicum L.' })
    expect(body.relationship.genusB).toEqual({ id: ocimumLId, botanicalName: 'Ocimum L.' })
    expect(body.relationship.relId).toBe('genus-rel-1')
  })

  it('returns 404 when no direct or genus relationship exists', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: annuumId, botanicalName: 'Capsicum annuum' },
        { id: basilicumId, botanicalName: 'Ocimum basilicum' },
      ])
      .mockResolvedValueOnce([{ id: capsicumLId, botanicalName: 'Capsicum L.' }])
      .mockResolvedValueOnce([{ id: ocimumLId, botanicalName: 'Ocimum L.' }])
      .mockResolvedValueOnce([])  // genus relationship not found

    const res = await GET(makeReq(annuumId, basilicumId), {
      params: Promise.resolve({ id: annuumId, companionId: basilicumId }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 404 when species have no matching genus crops', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: annuumId, botanicalName: 'Capsicum annuum' },
        { id: basilicumId, botanicalName: 'Ocimum basilicum' },
      ])
      .mockResolvedValueOnce([])  // genus for Capsicum not found
      .mockResolvedValueOnce([])  // genus for Ocimum not found

    const res = await GET(makeReq(annuumId, basilicumId), {
      params: Promise.resolve({ id: annuumId, companionId: basilicumId }),
    })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
ssh app-dev "pnpm test:run tests/api/companion-detail.test.ts"
```
Expected: FAIL — `resolvedToGenus` field missing, genus resolution tests fail

- [ ] **Step 3: Replace `src/app/api/plants/[id]/companions/[companionId]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { detectRank, extractGenusWord } from '@/lib/crop-rank'

type RelRow = {
  relId: string; type: string; reason: string | null; reasons: string[]; confidence: number
  notes: string | null; direction: string
  cropAId: string; cropAName: string; cropABotanical: string; cropACommonNames: string[]
  cropANitrogen: boolean
  cropBId: string; cropBName: string; cropBBotanical: string; cropBCommonNames: string[]
  cropBNitrogen: boolean
}

async function fetchRelationship(cropAId: string, cropBId: string): Promise<RelRow | undefined> {
  const rows = await prisma.$queryRaw<RelRow[]>`
    SELECT
      cr.id AS "relId", cr.type, cr.reason, cr.reasons, cr.confidence, cr.notes, cr.direction,
      ca.id AS "cropAId", ca.name AS "cropAName", ca."botanicalName" AS "cropABotanical",
      ca."commonNames" AS "cropACommonNames", ca."isNitrogenFixer" AS "cropANitrogen",
      cb.id AS "cropBId", cb.name AS "cropBName", cb."botanicalName" AS "cropBBotanical",
      cb."commonNames" AS "cropBCommonNames", cb."isNitrogenFixer" AS "cropBNitrogen"
    FROM "CropRelationship" cr
    JOIN "Crop" ca ON cr."cropAId" = ca.id
    JOIN "Crop" cb ON cr."cropBId" = cb.id
    WHERE cr."cropAId" = ${cropAId} AND cr."cropBId" = ${cropBId}
  `
  return rows[0]
}

async function buildSources(relationshipId: string) {
  const rawSources = await prisma.relationshipSource.findMany({
    where: { relationshipId },
    select: { source: true, sourceType: true, confidence: true, url: true, notes: true, fetchedAt: true, userId: true },
    orderBy: { confidence: 'desc' },
  })

  const community: (typeof rawSources)[number][] = []
  const other: (typeof rawSources)[number][] = []
  for (const s of rawSources) {
    if (s.source === 'COMMUNITY') community.push(s)
    else other.push(s)
  }

  const groupedCommunity: Array<{
    source: string; confidence: string; notes: string | null; fetchedAt: string
    urls: Array<{ url: string; sourceType: string | null; confidence: string }>
  }> = []

  const groups = new Map<string, typeof community>()
  for (const s of community) {
    const date = s.fetchedAt.toISOString().slice(0, 10)
    const key = `${s.userId ?? 'anon'}|${date}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }

  for (const rows of groups.values()) {
    const testimony = rows.find(r => !r.url) ?? rows[0]
    const urls = rows.filter(r => r.url).map(r => ({
      url: r.url!,
      sourceType: r.sourceType,
      confidence: r.confidence,
    }))
    groupedCommunity.push({
      source: 'COMMUNITY',
      confidence: testimony.confidence,
      notes: testimony.notes,
      fetchedAt: testimony.fetchedAt.toISOString(),
      urls,
    })
  }

  return [
    ...other.map(s => ({
      source: s.source, confidence: s.confidence, url: s.url,
      notes: s.notes, fetchedAt: s.fetchedAt.toISOString(), sourceType: s.sourceType,
    })),
    ...groupedCommunity,
  ]
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; companionId: string }> },
) {
  const { id, companionId } = await params
  const [cropAId, cropBId] = id < companionId ? [id, companionId] : [companionId, id]

  const rel = await fetchRelationship(cropAId, cropBId)

  if (rel) {
    const sources = await buildSources(rel.relId)
    return NextResponse.json({ relationship: rel, sources })
  }

  // Genus resolution fallback: try to find a genus-level relationship
  const cropRows = await prisma.$queryRaw<Array<{ id: string; botanicalName: string }>>`
    SELECT id, "botanicalName" FROM "Crop" WHERE id = ${cropAId} OR id = ${cropBId}
  `
  const cropA = cropRows.find(c => c.id === cropAId)
  const cropB = cropRows.find(c => c.id === cropBId)

  if (
    cropA && cropB &&
    detectRank(cropA.botanicalName) === 'species' &&
    detectRank(cropB.botanicalName) === 'species'
  ) {
    const genusPatternA = `^${extractGenusWord(cropA.botanicalName)} [A-Z]`
    const genusPatternB = `^${extractGenusWord(cropB.botanicalName)} [A-Z]`

    const genusARows = await prisma.$queryRaw<Array<{ id: string; botanicalName: string }>>`
      SELECT id, "botanicalName" FROM "Crop" WHERE "botanicalName" ~ ${genusPatternA} LIMIT 1
    `
    const genusBRows = await prisma.$queryRaw<Array<{ id: string; botanicalName: string }>>`
      SELECT id, "botanicalName" FROM "Crop" WHERE "botanicalName" ~ ${genusPatternB} LIMIT 1
    `
    const genusA = genusARows[0]
    const genusB = genusBRows[0]

    if (genusA && genusB) {
      const [gA, gB] = genusA.id < genusB.id ? [genusA.id, genusB.id] : [genusB.id, genusA.id]
      const genusRel = await fetchRelationship(gA, gB)

      if (genusRel) {
        const sources = await buildSources(genusRel.relId)
        return NextResponse.json({
          relationship: {
            ...genusRel,
            resolvedToGenus: true,
            genusA: { id: genusA.id, botanicalName: genusA.botanicalName },
            genusB: { id: genusB.id, botanicalName: genusB.botanicalName },
          },
          sources,
        })
      }
    }
  }

  return NextResponse.json({ error: 'relationship not found' }, { status: 404 })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
ssh app-dev "pnpm test:run tests/api/companion-detail.test.ts"
```
Expected: PASS (all tests including new genus resolution tests)

- [ ] **Step 5: Run full test suite**

```bash
ssh app-dev "pnpm test:run"
```
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/app/api/plants/\[id\]/companions/\[companionId\]/route.ts tests/api/companion-detail.test.ts
git commit -m "feat(api): companion detail falls back to genus relationship for species"
```

---

### Task 4: Plan page URL param + PlantSearch `initialQuery` prop

**Files:**
- Modify: `src/components/plant-search.tsx`
- Modify: `src/app/[locale]/(app)/plan/page.tsx`

This task enables the "See all N species →" link (which goes to `/plan?q=Capsicum`) to pre-fill the plant search.

- [ ] **Step 1: Add `initialQuery` prop to `src/components/plant-search.tsx`**

Change the `PlantSearchProps` interface:

```ts
interface PlantSearchProps {
  wishlistIds: string[]
  onAdd: (cropId: string) => void
  onRemove: (cropId: string) => void
  onClearAll: () => void
  initialQuery?: string  // new
}
```

Change the component signature:

```ts
export function PlantSearch({ wishlistIds, onAdd, onRemove, onClearAll, initialQuery }: PlantSearchProps) {
```

Change the `query` state initialisation (line ~35):

```ts
const [query, setQuery] = useState(initialQuery ?? '')
```

Add a `useEffect` after the existing state declarations to handle when `initialQuery` arrives after first render:

```ts
useEffect(() => {
  if (initialQuery !== undefined) setQuery(initialQuery)
}, [initialQuery])
```

- [ ] **Step 2: Read `?q=` param and pass to PlantSearch in `src/app/[locale]/(app)/plan/page.tsx`**

Add `searchQuery` state after the existing state declarations:

```ts
const [searchQuery, setSearchQuery] = useState('')
```

Add a `useEffect` to read the URL param (after the existing `autoRecommend` effect):

```ts
useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  const q = params.get('q')
  if (q) setSearchQuery(q)
}, [])
```

Update the `<PlantSearch>` JSX to pass `initialQuery`:

```tsx
<PlantSearch
  initialQuery={searchQuery || undefined}
  wishlistIds={state.wishlist}
  onAdd={addToWishlist}
  onRemove={removeFromWishlist}
  onClearAll={clearWishlist}
/>
```

- [ ] **Step 3: Manual verification**

```bash
ssh app-dev "pnpm dev" &
```

Navigate to `http://localhost:3000/plan?q=Capsicum` — the search input should be pre-filled with "Capsicum" and show search results.

- [ ] **Step 4: Commit**

```bash
git add src/components/plant-search.tsx src/app/\[locale\]/\(app\)/plan/page.tsx
git commit -m "feat(ui): plant search accepts initialQuery prop, plan page reads ?q= URL param"
```

---

### Task 5: Plant detail page — genus UI

**Files:**
- Modify: `src/app/[locale]/(app)/plants/[id]/page.tsx`

- [ ] **Step 1: Extend type definitions at the top of the file**

Replace the existing type declarations:

```ts
type GenusInfo = { id: string; botanicalName: string; name: string }
type SpeciesItem = { id: string; botanicalName: string; name: string }

type CropRow = {
  id: string; name: string; botanicalName: string
  commonNames: string[]; minTempC: number | null; isNitrogenFixer: boolean
  parentGenus?: GenusInfo
  species?: SpeciesItem[]
  speciesCount?: number
}

type CompanionRow = CropRow & {
  relationshipId: string; type: string; reason: string | null
  confidence: number; notes: string | null; direction: string
  inheritedFrom?: { id: string; botanicalName: string }
}
```

- [ ] **Step 2: Add genus-related rendering to the plant name section**

In the JSX, find the block that renders `crop.botanicalName` in italic. After the `<div className="flex gap-2 mt-2 flex-wrap">` badges block, add:

```tsx
{crop.parentGenus && (
  <p className="text-sm text-muted-foreground mt-1">
    {t('partOfGenus', { genus: crop.parentGenus.botanicalName })}{' '}
    <Link href={`/plants/${crop.parentGenus.id}`} className="underline hover:text-foreground">
      {t('viewGenusPage')}
    </Link>
  </p>
)}
```

- [ ] **Step 3: Add `inheritedFrom` label to companion list items**

In the companion list JSX, after the block rendering `c.botanicalName` in italic, add:

```tsx
{c.inheritedFrom && (
  <span className="block text-xs text-muted-foreground italic mt-0.5">
    {t('inheritedFrom', { genus: c.inheritedFrom.botanicalName })}
  </span>
)}
```

- [ ] **Step 4: Fix the "details" link for inherited companions to point to genus relationship**

Replace the existing canonical link calculation:

```ts
// Before:
const [canonA, canonB] = id < c.id ? [id, c.id] : [c.id, id]

// After:
const linkA = c.inheritedFrom ? c.inheritedFrom.id : id
const [canonA, canonB] = linkA < c.id ? [linkA, c.id] : [c.id, linkA]
```

- [ ] **Step 5: Add species section for genus crops**

In the JSX, add a new section between the crop header and the companion list (before `<Separator />`). Place it after the badges div:

```tsx
{crop.species !== undefined && (
  <>
    <Separator />
    <div>
      <h2 className="font-semibold mb-2">{t('speciesSection')}</h2>
      {crop.species.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-2">
          {crop.species.map(s => (
            <Link
              key={s.id}
              href={`/plants/${s.id}`}
              className="text-sm bg-muted rounded px-2 py-1 hover:bg-accent transition-colors"
            >
              {s.botanicalName}
            </Link>
          ))}
        </div>
      ) : null}
      {(crop.speciesCount ?? 0) > (crop.species?.length ?? 0) && (
        <Link
          href={`/plan?q=${encodeURIComponent(crop.botanicalName.split(' ')[0])}`}
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          {t('seeAllSpecies', { count: crop.speciesCount })}
        </Link>
      )}
      <p className="text-xs text-muted-foreground mt-2">
        {t('speciesExploreHint')}{' '}
        <Link
          href={`/plan?q=${encodeURIComponent(crop.botanicalName.split(' ')[0])}`}
          className="underline hover:text-foreground"
        >
          {t('exploreSpecies')}
        </Link>
      </p>
    </div>
  </>
)}
```

- [ ] **Step 6: Manual verification**

Start the dev server and open a species page (e.g. navigate to Capsicum annuum):
- Check: "Part of the Capsicum L. genus — View genus page" link is shown
- Check: companion list shows inherited companions with "via Capsicum L." label
- Check: inherited companion "Details →" link opens `Capsicum L. ↔ Ocimum L.` relationship page

Open the genus page (Capsicum L.):
- Check: species chips shown (Capsicum annuum, Capsicum baccatum, …)
- Check: "See all 6 species →" link navigates to `/plan?q=Capsicum` with pre-filled search
- Check: "Individual species may have additional companion data. Explore species →" note is shown

- [ ] **Step 7: Commit**

```bash
git add src/app/\[locale\]/\(app\)/plants/\[id\]/page.tsx
git commit -m "feat(ui): plant detail shows genus/species context and inherited companion labels"
```

---

### Task 6: Relationship detail page — genus banner

**Files:**
- Modify: `src/app/[locale]/(app)/plants/[id]/companions/[companionId]/page.tsx`

- [ ] **Step 1: Extend the `RelationshipRow` type**

Replace the existing type:

```ts
type RelationshipRow = {
  relId: string; type: string; reason: string | null; reasons: string[]; confidence: number
  notes: string | null; direction: string
  cropAId: string; cropAName: string; cropABotanical: string; cropACommonNames: string[]
  cropANitrogen: boolean
  cropBId: string; cropBName: string; cropBBotanical: string; cropBCommonNames: string[]
  cropBNitrogen: boolean
  // new fields:
  resolvedToGenus?: boolean
  genusA?: { id: string; botanicalName: string }
  genusB?: { id: string; botanicalName: string }
}
```

- [ ] **Step 2: Add resolved-to-genus banner**

In the JSX return, after the `<button onClick={() => router.back()}>` div, add:

```tsx
{rel.resolvedToGenus && rel.genusA && rel.genusB && (
  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
    {t('genusLevelBanner', {
      genusA: rel.genusA.botanicalName,
      genusB: rel.genusB.botanicalName,
      genus: rel.genusA.botanicalName.split(' ')[0],
    })}
  </div>
)}
```

- [ ] **Step 3: Add "applies to all species" note for direct genus relationships**

Import `detectRank` at the top of the file:

```ts
import { detectRank } from '@/lib/crop-rank'
```

After the `resolvedToGenus` banner block, add:

```tsx
{!rel.resolvedToGenus && detectRank(rel.cropABotanical) === 'genus' && (
  <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
    {t('appliesToAllSpecies', { genus: rel.cropABotanical.split(' ')[0] })}
  </div>
)}
{!rel.resolvedToGenus && detectRank(rel.cropBBotanical) === 'genus' && (
  <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
    {t('appliesToAllSpecies', { genus: rel.cropBBotanical.split(' ')[0] })}
  </div>
)}
```

- [ ] **Step 4: Manual verification**

Navigate to a species-to-species relationship URL that has no direct relationship but has a genus relationship (e.g. `/plants/[annuumId]/companions/[basilicumId]`):
- Check: amber banner shows "Relationship defined at genus level (Capsicum L. ↔ Ocimum L.) — applies to all Capsicum species."

Navigate directly to a genus relationship (e.g. Capsicum L. ↔ Ocimum L.):
- Check: blue note shows "Applies to all Capsicum species."

- [ ] **Step 5: Commit**

```bash
git add src/app/\[locale\]/\(app\)/plants/\[id\]/companions/\[companionId\]/page.tsx
git commit -m "feat(ui): relationship detail shows genus-level banner and species scope note"
```

---

### Task 7: i18n keys — en.json and de.json

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/de.json`

- [ ] **Step 1: Add new keys to `messages/en.json`**

In the `PlantPage` object, add these keys:

```json
"partOfGenus": "Part of the {genus} genus",
"viewGenusPage": "View genus page",
"speciesSection": "Species",
"seeAllSpecies": "See all {count} species →",
"speciesExploreHint": "Individual species may have additional companion data.",
"exploreSpecies": "Explore species →",
"inheritedFrom": "via {genus}"
```

In the `RelationshipPage` object, add these keys:

```json
"genusLevelBanner": "Relationship defined at genus level ({genusA} ↔ {genusB}) — applies to all {genus} species.",
"appliesToAllSpecies": "Applies to all {genus} species."
```

- [ ] **Step 2: Add translated keys to `messages/de.json`**

In the `PlantPage` object, add:

```json
"partOfGenus": "Gehört zur Gattung {genus}",
"viewGenusPage": "Gattungsseite anzeigen",
"speciesSection": "Arten",
"seeAllSpecies": "Alle {count} Arten anzeigen →",
"speciesExploreHint": "Einzelne Arten können zusätzliche Mischkulturdaten haben.",
"exploreSpecies": "Arten erkunden →",
"inheritedFrom": "über {genus}"
```

In the `RelationshipPage` object, add:

```json
"genusLevelBanner": "Beziehung auf Gattungsebene definiert ({genusA} ↔ {genusB}) — gilt für alle Arten der Gattung {genus}.",
"appliesToAllSpecies": "Gilt für alle Arten der Gattung {genus}."
```

- [ ] **Step 3: Verify no missing keys**

```bash
ssh app-dev "pnpm build 2>&1 | grep -i 'missing\|translation\|key' | head -20"
```
Expected: No missing translation errors

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/de.json
git commit -m "feat(i18n): add genus/species companion inheritance translation keys (en + de)"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Genus detection computed at query time (Tasks 1, 2, 3)
- ✅ Species page shows `parentGenus` callout and inherited companions with `inheritedFrom` label (Tasks 2, 5)
- ✅ Genus page shows species list (first 8) + "see all" link to `/plan?q=` (Tasks 2, 4, 5)
- ✅ Genus page shows "individual species may have additional data" hint (Task 5)
- ✅ Companion detail resolves species-to-genus relationship (`resolvedToGenus`, Tasks 3, 6)
- ✅ Relationship detail page shows genus banner when `resolvedToGenus` (Task 6)
- ✅ Relationship detail page shows species scope note for direct genus relationships (Task 6)
- ✅ i18n keys added to en + de (Task 7)
- ✅ `?q=` URL param pre-fills plant search (Task 4)

**Type consistency check:**
- `GenusInfo` used in route response, plant page types, companion route — all identical `{ id, botanicalName, name }`
- `SpeciesRow`/`SpeciesItem` — `{ id, botanicalName, name }` — consistent
- `inheritedFrom: { id, botanicalName }` — no `name` field (name not needed for label display) — consistent across route and page types
- `resolvedToGenus: boolean`, `genusA/genusB: { id, botanicalName }` — consistent in route response and page type
- `extractGenusWord` imported from `@/lib/crop-rank` in both API routes and the relationship detail page — all correct

**Placeholder check:** None found.

**Ambiguity check:** The "details" link fix in Task 5 Step 4 uses `c.inheritedFrom.id` as the `linkA`. This is the genus parent ID. `c.id` is the companion from the genus query (e.g. `Ocimum L.` ID). This correctly builds a canonical link to the genus-level relationship page.
