# Core Garden Planner (Anonymous Flow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full end-to-end garden planner — hardiness zone detection, plant search/wishlist, bed configuration, and companion-planting recommendations — with state in localStorage (no account required).

**Architecture:** API-first backend (zone lookup via Open-Meteo free archive API, crop search via Prisma ILIKE, greedy affinity recommendation engine), React frontend using a localStorage hook. Four sequential UI steps on one page: detect zone → build wishlist → configure beds → view recommendations. Auth and DB persistence are a separate plan (Plan 2).

**Tech Stack:** Next.js 15 App Router, Prisma 6, PostgreSQL 16, shadcn/ui (button/input/card/badge/label/separator), Leaflet + react-leaflet (map fallback), Vitest 3, TypeScript 5

---

## File Map

Files created or modified by this plan:

| File | Role |
|------|------|
| `src/lib/prisma.ts` | Prisma singleton (Next.js dev-safe) |
| `src/lib/recommend.ts` | Pure greedy affinity algorithm + zone helpers |
| `src/lib/garden-state.ts` | localStorage state shape + read/write helpers |
| `src/hooks/use-garden.ts` | React hook wrapping garden state |
| `src/app/api/zone/route.ts` | GET ?lat=&lng= → `{ minTempC }` via Open-Meteo |
| `src/app/api/crops/route.ts` | GET ?q= → crop search results |
| `src/app/api/recommend/route.ts` | POST body → bed assignments |
| `src/components/map-picker.tsx` | Leaflet map (dynamic import, no SSR) |
| `src/components/zone-detector.tsx` | Step 1: geolocation button + map fallback |
| `src/components/plant-search.tsx` | Step 2: type-to-search + wishlist |
| `src/components/bed-config.tsx` | Step 3: bed count + capacity inputs |
| `src/components/recommendation-display.tsx` | Step 4: bed cards + overflow + conflicts |
| `src/app/page.tsx` | Main page — orchestrates all steps |
| `src/app/layout.tsx` | Update: shadcn font + globals import |
| `src/app/globals.css` | shadcn base styles |
| `tests/lib/recommend.test.ts` | Unit tests for algorithm + zone helpers |
| `tests/api/zone.test.ts` | Route handler tests (mocked fetch) |
| `tests/api/crops.test.ts` | Route handler tests (mocked prisma) |
| `tests/api/recommend.test.ts` | Route handler tests (mocked prisma) |
| `tests/hooks/use-garden.test.ts` | Hook tests (jsdom) |

---

## Task 1: Prisma Singleton

**Files:**
- Create: `src/lib/prisma.ts`

The standard Next.js hot-reload safe Prisma singleton. Without it, `new PrismaClient()` is called on every hot reload in dev, exhausting connection pool.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/prisma.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import prisma from '@/lib/prisma'

describe('prisma singleton', () => {
  it('exports a PrismaClient instance', () => {
    expect(prisma).toBeDefined()
    expect(typeof prisma.$connect).toBe('function')
  })

  it('returns same instance on repeated imports', async () => {
    const { default: prisma2 } = await import('@/lib/prisma')
    expect(prisma2).toBe(prisma)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:run tests/lib/prisma.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/prisma'`

- [ ] **Step 3: Implement the singleton**

Create `src/lib/prisma.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test:run tests/lib/prisma.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/prisma.ts tests/lib/prisma.test.ts
git commit -m "feat: add Prisma singleton"
```

---

## Task 2: Zone API Route

**Files:**
- Create: `src/app/api/zone/route.ts`
- Test: `tests/api/zone.test.ts`

Calls the Open-Meteo free archive API (no API key required) for 5 years of daily minimum temperatures, computes the average annual extreme minimum (the quantity USDA hardiness zones are based on), and returns it as `minTempC`.

Open-Meteo endpoint:
```
GET https://archive-api.open-meteo.com/v1/archive
  ?latitude={lat}
  &longitude={lng}
  &start_date=2019-01-01
  &end_date=2023-12-31
  &daily=temperature_2m_min
  &timezone=UTC
```

Response shape:
```json
{
  "daily": {
    "time": ["2019-01-01", "2019-01-02", "..."],
    "temperature_2m_min": [-2.3, 1.5, "..."]
  }
}
```

- [ ] **Step 1: Write the failing test**

Create `tests/api/zone.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/zone/route'

// Build a fake Open-Meteo response covering 2 years (2022 + 2023)
function makeMeteoResponse(year1Min: number, year2Min: number) {
  const time = [`${2022}-01-15`, `${2023}-01-15`]
  const temperature_2m_min = [year1Min, year2Min]
  return { daily: { time, temperature_2m_min } }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

describe('GET /api/zone', () => {
  it('returns 400 when lat/lng missing', async () => {
    const req = new Request('http://localhost/api/zone')
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('returns 400 for invalid coordinates', async () => {
    const req = new Request('http://localhost/api/zone?lat=abc&lng=0')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('computes average annual extreme minimum', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => makeMeteoResponse(-10, -20),
    } as Response)

    const req = new Request('http://localhost/api/zone?lat=51.5&lng=-0.1')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    // avg of [-10, -20] = -15
    expect(body.minTempC).toBeCloseTo(-15, 1)
  })

  it('returns 502 when Open-Meteo fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
    } as Response)

    const req = new Request('http://localhost/api/zone?lat=51.5&lng=-0.1')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:run tests/api/zone.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/zone/route'`

- [ ] **Step 3: Implement the route**

Create `src/app/api/zone/route.ts`:

```typescript
import { NextResponse } from 'next/server'

interface MeteoResponse {
  daily: {
    time: string[]
    temperature_2m_min: number[]
  }
}

function averageAnnualMin(times: string[], temps: number[]): number {
  const byYear: Record<number, number> = {}
  times.forEach((t, i) => {
    const year = new Date(t).getUTCFullYear()
    if (byYear[year] === undefined || temps[i] < byYear[year]) {
      byYear[year] = temps[i]
    }
  })
  const mins = Object.values(byYear)
  return mins.reduce((a, b) => a + b, 0) / mins.length
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const latStr = searchParams.get('lat')
  const lngStr = searchParams.get('lng')

  if (!latStr || !lngStr) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 })
  }

  const lat = parseFloat(latStr)
  const lng = parseFloat(lngStr)

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng must be numbers' }, { status: 400 })
  }

  const url = new URL('https://archive-api.open-meteo.com/v1/archive')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('start_date', '2019-01-01')
  url.searchParams.set('end_date', '2023-12-31')
  url.searchParams.set('daily', 'temperature_2m_min')
  url.searchParams.set('timezone', 'UTC')

  const upstream = await fetch(url.toString())
  if (!upstream.ok) {
    return NextResponse.json({ error: 'climate data unavailable' }, { status: 502 })
  }

  const data: MeteoResponse = await upstream.json()
  const minTempC = averageAnnualMin(data.daily.time, data.daily.temperature_2m_min)

  return NextResponse.json({ minTempC: Math.round(minTempC * 10) / 10 })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test:run tests/api/zone.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/zone/route.ts tests/api/zone.test.ts
git commit -m "feat: add /api/zone route (Open-Meteo hardiness lookup)"
```

---

## Task 3: Crops Search API Route

**Files:**
- Create: `src/app/api/crops/route.ts`
- Test: `tests/api/crops.test.ts`

Returns up to 20 crops matching a query string (case-insensitive substring match on `name` or `botanicalName`). Used by the plant search UI for type-ahead results.

- [ ] **Step 1: Write the failing test**

Create `tests/api/crops.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { GET } from '@/app/api/crops/route'

vi.mock('@/lib/prisma', () => ({
  default: {
    crop: {
      findMany: vi.fn(),
    },
  },
}))

import prisma from '@/lib/prisma'

const fakeCrops = [
  { id: '1', name: 'Tomato', botanicalName: 'Solanum lycopersicum', minTempC: -1.1 },
  { id: '2', name: 'Roma Tomato', botanicalName: 'Solanum lycopersicum var. Roma', minTempC: -1.1 },
]

describe('GET /api/crops', () => {
  it('returns 400 when q is missing', async () => {
    const req = new Request('http://localhost/api/crops')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when q is less than 2 characters', async () => {
    const req = new Request('http://localhost/api/crops?q=t')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('calls prisma with case-insensitive contains and returns results', async () => {
    vi.mocked(prisma.crop.findMany).mockResolvedValue(fakeCrops as any)

    const req = new Request('http://localhost/api/crops?q=tomato')
    const res = await GET(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.crops).toHaveLength(2)
    expect(body.crops[0].name).toBe('Tomato')

    expect(prisma.crop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { name: { contains: 'tomato', mode: 'insensitive' } },
            { botanicalName: { contains: 'tomato', mode: 'insensitive' } },
          ],
        },
        take: 20,
      })
    )
  })

  it('returns empty array when no crops match', async () => {
    vi.mocked(prisma.crop.findMany).mockResolvedValue([])
    const req = new Request('http://localhost/api/crops?q=xyznonexistent')
    const res = await GET(req)
    const body = await res.json()
    expect(body.crops).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:run tests/api/crops.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/crops/route'`

- [ ] **Step 3: Implement the route**

Create `src/app/api/crops/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() ?? ''

  if (q.length < 2) {
    return NextResponse.json({ error: 'q must be at least 2 characters' }, { status: 400 })
  }

  const crops = await prisma.crop.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { botanicalName: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, botanicalName: true, minTempC: true },
    take: 20,
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ crops })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test:run tests/api/crops.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/crops/route.ts tests/api/crops.test.ts
git commit -m "feat: add /api/crops search route"
```

---

## Task 4: Recommendation Algorithm

**Files:**
- Create: `src/lib/recommend.ts`
- Test: `tests/lib/recommend.test.ts`

Pure function — no DB, no HTTP. Takes crops, their pairwise relationships, bed configuration, and the user's zone temperature. Returns bed assignments, crops that didn't fit (overflow), and incompatible pairs forced into the same bed (conflicts).

**Semantics:**
- `crop.minTempC` = coldest temperature the crop can survive (its hardiness floor)
- `user.minTempC` = coldest winter temperature at user's location
- Filter rule: remove crop if `crop.minTempC > user.minTempC` (the zone gets colder than the crop can handle)
- `crop.minTempC === null` = hardiness unknown → always keep (assume hardy enough)

**Greedy algorithm:**
1. Filter eligible crops by hardiness
2. Build a weight map: `"idA|idB"` → net affinity float (COMPANION/ATTRACTS/NURSE/TRAP_CROP → +confidence; AVOID/REPELS → −confidence)
3. Sort eligible crops by descending total affinity with all other eligible crops (most "social" first)
4. For each crop, find the non-full bed with the highest score gain (sum of weights with already-placed crops); place there; overflow if all beds full
5. Collect conflicts: pairs in the same bed with net negative weight

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/recommend.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { recommend, minTempCToZoneName, type CropInput, type RelationshipInput } from '@/lib/recommend'

const makeCrop = (id: string, minTempC: number | null = null): CropInput => ({
  id,
  name: id,
  botanicalName: id,
  minTempC,
})

const companion = (aId: string, bId: string, confidence = 0.8): RelationshipInput => ({
  cropAId: aId < bId ? aId : bId,
  cropBId: aId < bId ? bId : aId,
  type: 'COMPANION',
  confidence,
})

const avoid = (aId: string, bId: string, confidence = 0.9): RelationshipInput => ({
  cropAId: aId < bId ? aId : bId,
  cropBId: aId < bId ? bId : aId,
  type: 'AVOID',
  confidence,
})

describe('recommend()', () => {
  it('places companion pair in the same bed', () => {
    const crops = [makeCrop('tomato'), makeCrop('basil')]
    const rels = [companion('tomato', 'basil')]
    const result = recommend(crops, rels, 2, 3, 0)
    // Both should be in same bed since they're companions
    const filled = result.beds.filter(b => b.crops.length > 0)
    expect(filled).toHaveLength(1)
    expect(filled[0].crops.map(c => c.id).sort()).toEqual(['basil', 'tomato'])
    expect(result.overflow).toHaveLength(0)
    expect(result.conflicts).toHaveLength(0)
  })

  it('separates incompatible pair when beds allow it', () => {
    const crops = [makeCrop('tomato'), makeCrop('fennel')]
    const rels = [avoid('tomato', 'fennel')]
    const result = recommend(crops, rels, 2, 2, 0)
    // Each crop should be in a different bed
    const filled = result.beds.filter(b => b.crops.length > 0)
    expect(filled).toHaveLength(2)
    expect(result.conflicts).toHaveLength(0)
  })

  it('marks conflict when incompatible pair is forced into same bed', () => {
    const crops = [makeCrop('tomato'), makeCrop('fennel')]
    const rels = [avoid('tomato', 'fennel')]
    const result = recommend(crops, rels, 1, 2, 0) // only 1 bed
    expect(result.conflicts).toHaveLength(1)
    const ids = [result.conflicts[0].a.id, result.conflicts[0].b.id].sort()
    expect(ids).toEqual(['fennel', 'tomato'])
  })

  it('overflows crops that do not fit in beds', () => {
    const crops = [makeCrop('a'), makeCrop('b'), makeCrop('c')]
    const result = recommend(crops, [], 1, 2, 0) // 1 bed × 2 capacity = room for 2
    expect(result.overflow).toHaveLength(1)
    const totalInBeds = result.beds.reduce((s, b) => s + b.crops.length, 0)
    expect(totalInBeds).toBe(2)
  })

  it('filters crops colder than user zone', () => {
    // user zone gets to -30°C; crop only hardy to -10°C → filtered
    const crops = [makeCrop('tender', -10), makeCrop('hardy', -40)]
    const result = recommend(crops, [], 2, 3, -30)
    const allPlaced = result.beds.flatMap(b => b.crops)
    const ids = allPlaced.map(c => c.id)
    expect(ids).not.toContain('tender')
    expect(ids).toContain('hardy')
  })

  it('keeps crops with null minTempC regardless of zone', () => {
    const crops = [makeCrop('unknown', null)]
    const result = recommend(crops, [], 1, 3, -50)
    expect(result.beds.flatMap(b => b.crops).map(c => c.id)).toContain('unknown')
  })

  it('returns empty beds when no eligible crops', () => {
    const crops = [makeCrop('tropical', 10)] // needs min 10°C, zone is -20°C
    const result = recommend(crops, [], 1, 3, -20)
    expect(result.beds.every(b => b.crops.length === 0)).toBe(true)
    expect(result.overflow).toHaveLength(0)
  })

  it('returns correct bed count', () => {
    const result = recommend([], [], 4, 3, 0)
    expect(result.beds).toHaveLength(4)
  })
})

describe('minTempCToZoneName()', () => {
  it('maps -30°C to Zone 4', () => expect(minTempCToZoneName(-30)).toBe('Zone 4'))
  it('maps -1°C to Zone 9', () => expect(minTempCToZoneName(-1)).toBe('Zone 9'))
  it('maps -50°C to Zone 1', () => expect(minTempCToZoneName(-50)).toBe('Zone 1'))
  it('maps 20°C to Zone 13', () => expect(minTempCToZoneName(20)).toBe('Zone 13'))
  it('maps -17.8°C to Zone 7 boundary', () => expect(minTempCToZoneName(-17.8)).toBe('Zone 7'))
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:run tests/lib/recommend.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/recommend'`

- [ ] **Step 3: Implement the module**

Create `src/lib/recommend.ts`:

```typescript
export type CropInput = {
  id: string
  name: string
  botanicalName: string
  minTempC: number | null
}

export type RelationshipInput = {
  cropAId: string
  cropBId: string
  type: 'COMPANION' | 'AVOID' | 'ATTRACTS' | 'REPELS' | 'NURSE' | 'TRAP_CROP'
  confidence: number
}

export type BedResult = {
  index: number
  crops: CropInput[]
}

export type RecommendResult = {
  beds: BedResult[]
  overflow: CropInput[]
  conflicts: Array<{ a: CropInput; b: CropInput }>
}

const POSITIVE_TYPES = new Set(['COMPANION', 'ATTRACTS', 'NURSE', 'TRAP_CROP'])
const NEGATIVE_TYPES = new Set(['AVOID', 'REPELS'])

function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`
}

export function recommend(
  crops: CropInput[],
  relationships: RelationshipInput[],
  bedCount: number,
  bedCapacity: number,
  userMinTempC: number,
): RecommendResult {
  // 1. Filter by hardiness: remove crops the zone is too cold for
  const eligible = crops.filter(
    c => c.minTempC === null || c.minTempC <= userMinTempC,
  )

  // 2. Build weight map: canonical pair key → net affinity
  const weights = new Map<string, number>()
  for (const r of relationships) {
    const key = pairKey(r.cropAId, r.cropBId)
    const delta = POSITIVE_TYPES.has(r.type)
      ? r.confidence
      : NEGATIVE_TYPES.has(r.type)
        ? -r.confidence
        : 0
    weights.set(key, (weights.get(key) ?? 0) + delta)
  }

  function getWeight(idA: string, idB: string): number {
    return weights.get(pairKey(idA, idB)) ?? 0
  }

  // 3. Sort by total outgoing affinity (most social first)
  const sorted = [...eligible].sort((a, b) => {
    const scoreA = eligible.reduce(
      (sum, c) => (c.id !== a.id ? sum + getWeight(a.id, c.id) : sum),
      0,
    )
    const scoreB = eligible.reduce(
      (sum, c) => (c.id !== b.id ? sum + getWeight(b.id, c.id) : sum),
      0,
    )
    return scoreB - scoreA
  })

  // 4. Greedy placement
  const beds: CropInput[][] = Array.from({ length: bedCount }, () => [])
  const overflow: CropInput[] = []

  for (const crop of sorted) {
    let bestBed = -1
    let bestScore = -Infinity

    for (let i = 0; i < beds.length; i++) {
      if (beds[i].length >= bedCapacity) continue
      const score = beds[i].reduce((sum, c) => sum + getWeight(crop.id, c.id), 0)
      if (score > bestScore || (score === bestScore && bestBed === -1)) {
        bestScore = score
        bestBed = i
      }
    }

    if (bestBed === -1) {
      overflow.push(crop)
    } else {
      beds[bestBed].push(crop)
    }
  }

  // 5. Collect conflicts (incompatible pairs in same bed)
  const conflicts: Array<{ a: CropInput; b: CropInput }> = []
  for (const bed of beds) {
    for (let i = 0; i < bed.length; i++) {
      for (let j = i + 1; j < bed.length; j++) {
        if (getWeight(bed[i].id, bed[j].id) < 0) {
          conflicts.push({ a: bed[i], b: bed[j] })
        }
      }
    }
  }

  return {
    beds: beds.map((crops, index) => ({ index, crops })),
    overflow,
    conflicts,
  }
}

export function minTempCToZoneName(minTempC: number): string {
  if (minTempC < -45.6) return 'Zone 1'
  if (minTempC < -40.0) return 'Zone 2'
  if (minTempC < -34.4) return 'Zone 3'
  if (minTempC < -28.9) return 'Zone 4'
  if (minTempC < -23.3) return 'Zone 5'
  if (minTempC < -17.8) return 'Zone 6'
  if (minTempC < -12.2) return 'Zone 7'
  if (minTempC < -6.7) return 'Zone 8'
  if (minTempC < -1.1) return 'Zone 9'
  if (minTempC < 4.4) return 'Zone 10'
  if (minTempC < 10.0) return 'Zone 11'
  if (minTempC < 15.6) return 'Zone 12'
  return 'Zone 13'
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test:run tests/lib/recommend.test.ts
```

Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/recommend.ts tests/lib/recommend.test.ts
git commit -m "feat: add greedy recommendation algorithm and zone name helper"
```

---

## Task 5: Recommend API Route

**Files:**
- Create: `src/app/api/recommend/route.ts`
- Test: `tests/api/recommend.test.ts`

POST handler that fetches crop details and all pairwise relationships from the DB for the requested crop IDs, then delegates to the `recommend()` function.

Request body:
```json
{
  "cropIds": ["id1", "id2", "..."],
  "bedCount": 3,
  "bedCapacity": 3,
  "minTempC": -12.2
}
```

- [ ] **Step 1: Write the failing test**

Create `tests/api/recommend.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { POST } from '@/app/api/recommend/route'

vi.mock('@/lib/prisma', () => ({
  default: {
    crop: { findMany: vi.fn() },
    cropRelationship: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/recommend', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/recommend')>()
  return { ...actual }
})

import prisma from '@/lib/prisma'

const fakeCrops = [
  { id: 'c1', name: 'Tomato', botanicalName: 'Solanum lycopersicum', minTempC: -1.1 },
  { id: 'c2', name: 'Basil', botanicalName: 'Ocimum basilicum', minTempC: 5.0 },
]

const fakeRels = [
  { cropAId: 'c1', cropBId: 'c2', type: 'COMPANION', confidence: 0.8 },
]

describe('POST /api/recommend', () => {
  it('returns 400 for missing body fields', async () => {
    const req = new Request('http://localhost/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cropIds: ['c1'] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty cropIds', async () => {
    const req = new Request('http://localhost/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cropIds: [], bedCount: 2, bedCapacity: 3, minTempC: -10 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns recommendation result for valid input', async () => {
    vi.mocked(prisma.crop.findMany).mockResolvedValue(fakeCrops as any)
    vi.mocked(prisma.cropRelationship.findMany).mockResolvedValue(fakeRels as any)

    const req = new Request('http://localhost/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cropIds: ['c1', 'c2'],
        bedCount: 2,
        bedCapacity: 3,
        minTempC: -10,
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.beds).toBeDefined()
    expect(body.overflow).toBeDefined()
    expect(body.conflicts).toBeDefined()
    // Both crops fit; c2 (basil) has minTempC=5 which is > -10 → filtered
    // Only c1 (tomato) with minTempC=-1.1 is > -10 → also filtered
    // Actually: filter keeps crop if minTempC <= userMinTempC
    // c1: -1.1 <= -10? NO → filtered (zone is -10, crop needs it above -1.1 to survive)
    // Wait: -1.1 > -10 is TRUE → remove c1
    // c2: 5.0 > -10 is TRUE → remove c2
    // All filtered → empty beds
    expect(body.beds.every((b: any) => b.crops.length === 0)).toBe(true)
  })

  it('queries relationships only between the requested crops', async () => {
    vi.mocked(prisma.crop.findMany).mockResolvedValue(fakeCrops as any)
    vi.mocked(prisma.cropRelationship.findMany).mockResolvedValue([])

    const req = new Request('http://localhost/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cropIds: ['c1', 'c2'],
        bedCount: 1,
        bedCapacity: 3,
        minTempC: 10,
      }),
    })
    await POST(req)

    expect(prisma.cropRelationship.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { cropAId: { in: ['c1', 'c2'] } },
            { cropBId: { in: ['c1', 'c2'] } },
          ],
        },
      }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:run tests/api/recommend.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/recommend/route'`

- [ ] **Step 3: Implement the route**

Create `src/app/api/recommend/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { recommend } from '@/lib/recommend'

interface RecommendBody {
  cropIds: string[]
  bedCount: number
  bedCapacity: number
  minTempC: number
}

export async function POST(request: Request) {
  let body: RecommendBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const { cropIds, bedCount, bedCapacity, minTempC } = body

  if (
    !Array.isArray(cropIds) ||
    cropIds.length === 0 ||
    typeof bedCount !== 'number' ||
    typeof bedCapacity !== 'number' ||
    typeof minTempC !== 'number'
  ) {
    return NextResponse.json(
      { error: 'cropIds (non-empty array), bedCount, bedCapacity, minTempC are required' },
      { status: 400 },
    )
  }

  const [crops, relationships] = await Promise.all([
    prisma.crop.findMany({
      where: { id: { in: cropIds } },
      select: { id: true, name: true, botanicalName: true, minTempC: true },
    }),
    prisma.cropRelationship.findMany({
      where: {
        AND: [
          { cropAId: { in: cropIds } },
          { cropBId: { in: cropIds } },
        ],
      },
      select: { cropAId: true, cropBId: true, type: true, confidence: true },
    }),
  ])

  const result = recommend(crops, relationships as any, bedCount, bedCapacity, minTempC)

  return NextResponse.json(result)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test:run tests/api/recommend.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Run all tests**

```bash
pnpm test:run
```

Expected: All tests pass (19 existing + 4+4+13+4 new = ~44 total)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/recommend/route.ts tests/api/recommend.test.ts
git commit -m "feat: add /api/recommend route"
```

---

## Task 6: shadcn/ui + Leaflet Setup

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/app/globals.css`
- Create (auto-generated): `src/components/ui/` (shadcn components)
- Create: `src/components/map-picker.tsx`

Install shadcn/ui and Leaflet. shadcn writes `globals.css`, updates `tailwind.config`, adds component files. Leaflet is wrapped in a client-only component to avoid SSR crashes (it uses `window`).

- [ ] **Step 1: Install dependencies**

```bash
pnpm add leaflet react-leaflet
pnpm add -D @types/leaflet
```

- [ ] **Step 2: Initialize shadcn/ui**

Run interactively (accept defaults when prompted — New York style, zinc, CSS variables):

```bash
pnpm dlx shadcn@latest init
```

When asked:
- Style: **New York**
- Base color: **Zinc**
- CSS variables: **Yes**

This creates `src/app/globals.css`, updates `tailwind.config.ts`, and sets up `components.json`.

- [ ] **Step 3: Add required shadcn components**

```bash
pnpm dlx shadcn@latest add button input card badge label separator
```

Each command adds files under `src/components/ui/`.

- [ ] **Step 4: Update layout.tsx**

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'power2plant',
  description: 'Companion planting garden planner',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 5: Create the Leaflet map component**

Create `src/components/map-picker.tsx`:

```tsx
'use client'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import type { Map, Marker } from 'leaflet'

interface MapPickerProps {
  onSelect: (lat: number, lng: number) => void
  initialLat?: number
  initialLng?: number
}

export function MapPicker({ onSelect, initialLat = 20, initialLng = 0 }: MapPickerProps) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const markerRef = useRef<Marker | null>(null)

  useEffect(() => {
    if (!divRef.current || mapRef.current) return
    let L: typeof import('leaflet')

    import('leaflet').then((mod) => {
      L = mod.default ?? mod
      // Fix default icon paths broken by webpack
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(divRef.current!).setView([initialLat, initialLng], 2)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map)

      map.on('click', (e: L.LeafletMouseEvent) => {
        markerRef.current?.remove()
        markerRef.current = L.marker(e.latlng).addTo(map)
        onSelect(e.latlng.lat, e.latlng.lng)
      })

      mapRef.current = map
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  return <div ref={divRef} style={{ height: '320px', width: '100%' }} />
}
```

- [ ] **Step 6: Verify Next.js builds without errors**

```bash
pnpm build
```

Expected: build succeeds (0 errors). If there are type errors from auto-generated shadcn files, run `pnpm dlx shadcn@latest add` again to regenerate.

- [ ] **Step 7: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css src/components/ui/ src/components/map-picker.tsx components.json tailwind.config.ts
git commit -m "feat: add shadcn/ui and Leaflet map picker"
```

---

## Task 7: Garden State Hook

**Files:**
- Create: `src/lib/garden-state.ts`
- Create: `src/hooks/use-garden.ts`
- Test: `tests/hooks/use-garden.test.ts`

Thin localStorage abstraction. The hook reads/writes state and exposes typed setters. State persists across page reloads.

- [ ] **Step 1: Write the failing tests**

Create `tests/hooks/use-garden.test.ts`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGarden } from '@/hooks/use-garden'

beforeEach(() => {
  localStorage.clear()
})

describe('useGarden()', () => {
  it('returns default state when localStorage is empty', () => {
    const { result } = renderHook(() => useGarden())
    expect(result.current.state.bedCount).toBe(3)
    expect(result.current.state.bedCapacity).toBe(3)
    expect(result.current.state.wishlist).toEqual([])
    expect(result.current.state.minTempC).toBeNull()
  })

  it('setZone updates lat, lng, and minTempC', () => {
    const { result } = renderHook(() => useGarden())
    act(() => result.current.setZone(51.5, -0.1, -12.2))
    expect(result.current.state.lat).toBeCloseTo(51.5)
    expect(result.current.state.lng).toBeCloseTo(-0.1)
    expect(result.current.state.minTempC).toBeCloseTo(-12.2)
  })

  it('addToWishlist adds a crop id', () => {
    const { result } = renderHook(() => useGarden())
    act(() => result.current.addToWishlist('crop-1'))
    expect(result.current.state.wishlist).toContain('crop-1')
  })

  it('addToWishlist does not add duplicates', () => {
    const { result } = renderHook(() => useGarden())
    act(() => {
      result.current.addToWishlist('crop-1')
      result.current.addToWishlist('crop-1')
    })
    expect(result.current.state.wishlist.filter(id => id === 'crop-1')).toHaveLength(1)
  })

  it('removeFromWishlist removes a crop id', () => {
    const { result } = renderHook(() => useGarden())
    act(() => {
      result.current.addToWishlist('crop-1')
      result.current.removeFromWishlist('crop-1')
    })
    expect(result.current.state.wishlist).not.toContain('crop-1')
  })

  it('setBeds updates bedCount and bedCapacity', () => {
    const { result } = renderHook(() => useGarden())
    act(() => result.current.setBeds(5, 4))
    expect(result.current.state.bedCount).toBe(5)
    expect(result.current.state.bedCapacity).toBe(4)
  })

  it('persists state in localStorage', () => {
    const { result } = renderHook(() => useGarden())
    act(() => result.current.addToWishlist('crop-persist'))

    // Re-render as if page reloaded
    const { result: result2 } = renderHook(() => useGarden())
    expect(result2.current.state.wishlist).toContain('crop-persist')
  })
})
```

- [ ] **Step 2: Install testing library**

```bash
pnpm add -D @testing-library/react
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm test:run tests/hooks/use-garden.test.ts
```

Expected: FAIL — `Cannot find module '@/hooks/use-garden'`

- [ ] **Step 4: Create the state types**

Create `src/lib/garden-state.ts`:

```typescript
export interface GardenState {
  lat: number | null
  lng: number | null
  minTempC: number | null
  bedCount: number
  bedCapacity: number
  wishlist: string[]
}

export const DEFAULT_STATE: GardenState = {
  lat: null,
  lng: null,
  minTempC: null,
  bedCount: 3,
  bedCapacity: 3,
  wishlist: [],
}

const STORAGE_KEY = 'power2plant:garden'

export function loadState(): GardenState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    return { ...DEFAULT_STATE, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_STATE
  }
}

export function saveState(state: GardenState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // quota exceeded or private browsing — silently ignore
  }
}
```

- [ ] **Step 5: Create the hook**

Create `src/hooks/use-garden.ts`:

```typescript
'use client'
import { useState, useCallback, useEffect } from 'react'
import { type GardenState, DEFAULT_STATE, loadState, saveState } from '@/lib/garden-state'

export function useGarden() {
  const [state, setState] = useState<GardenState>(DEFAULT_STATE)

  useEffect(() => {
    setState(loadState())
  }, [])

  function update(patch: Partial<GardenState>) {
    setState(prev => {
      const next = { ...prev, ...patch }
      saveState(next)
      return next
    })
  }

  const setZone = useCallback((lat: number, lng: number, minTempC: number) => {
    update({ lat, lng, minTempC })
  }, [])

  const addToWishlist = useCallback((cropId: string) => {
    setState(prev => {
      if (prev.wishlist.includes(cropId)) return prev
      const next = { ...prev, wishlist: [...prev.wishlist, cropId] }
      saveState(next)
      return next
    })
  }, [])

  const removeFromWishlist = useCallback((cropId: string) => {
    setState(prev => {
      const next = { ...prev, wishlist: prev.wishlist.filter(id => id !== cropId) }
      saveState(next)
      return next
    })
  }, [])

  const setBeds = useCallback((bedCount: number, bedCapacity: number) => {
    update({ bedCount, bedCapacity })
  }, [])

  return { state, setZone, addToWishlist, removeFromWishlist, setBeds }
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm test:run tests/hooks/use-garden.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 7: Commit**

```bash
git add src/lib/garden-state.ts src/hooks/use-garden.ts tests/hooks/use-garden.test.ts
git commit -m "feat: add garden state hook with localStorage persistence"
```

---

## Task 8: Zone Detector Component

**Files:**
- Create: `src/components/zone-detector.tsx`

Step 1 of the UI. Shows a "Detect my location" button. On click, calls `navigator.geolocation.getCurrentPosition`, hits `/api/zone`, and saves the result via `setZone`. Has a "Pick on map instead" toggle that reveals the Leaflet map picker (dynamically imported to avoid SSR).

No Vitest tests for this component — it wraps the browser Geolocation API and Leaflet; unit tests would be pure mocking with little value.

- [ ] **Step 1: Create the component**

Create `src/components/zone-detector.tsx`:

```tsx
'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { minTempCToZoneName } from '@/lib/recommend'

const MapPicker = dynamic(
  () => import('@/components/map-picker').then(m => m.MapPicker),
  { ssr: false, loading: () => <div className="h-80 bg-muted animate-pulse rounded" /> },
)

interface ZoneDetectorProps {
  minTempC: number | null
  onZoneDetected: (lat: number, lng: number, minTempC: number) => void
}

export function ZoneDetector({ minTempC, onZoneDetected }: ZoneDetectorProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMap, setShowMap] = useState(false)

  async function fetchZone(lat: number, lng: number) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/zone?lat=${lat}&lng=${lng}`)
      if (!res.ok) throw new Error('Could not look up climate data for this location.')
      const data = await res.json()
      onZoneDetected(lat, lng, data.minTempC)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  function detectLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.')
      return
    }
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => fetchZone(pos.coords.latitude, pos.coords.longitude),
      () => {
        setLoading(false)
        setError('Location access denied. Pick your location on the map instead.')
        setShowMap(true)
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 1 — Your Growing Zone</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {minTempC !== null ? (
          <p className="text-green-700 font-medium">
            ✓ {minTempCToZoneName(minTempC)} (coldest winter night: {minTempC}°C)
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            We need your location to filter out plants that won't survive your winters.
          </p>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button onClick={detectLocation} disabled={loading}>
            {loading ? 'Detecting…' : minTempC !== null ? 'Re-detect location' : 'Detect my location'}
          </Button>
          <Button variant="outline" onClick={() => setShowMap(v => !v)}>
            {showMap ? 'Hide map' : 'Pick on map instead'}
          </Button>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        {showMap && (
          <MapPicker
            onSelect={(lat, lng) => {
              setShowMap(false)
              fetchZone(lat, lng)
            }}
          />
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/components/zone-detector.tsx
git commit -m "feat: add ZoneDetector component (geolocation + Leaflet fallback)"
```

---

## Task 9: Plant Search Component

**Files:**
- Create: `src/components/plant-search.tsx`

Step 2 of the UI. A text input debounced 300ms that calls `/api/crops?q=`. Results appear as a list with "Add" buttons. Selected plants form the wishlist shown below with "Remove" buttons.

- [ ] **Step 1: Create the component**

Create `src/components/plant-search.tsx`:

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

interface Crop {
  id: string
  name: string
  botanicalName: string
  minTempC: number | null
}

interface PlantSearchProps {
  wishlistIds: string[]
  onAdd: (cropId: string) => void
  onRemove: (cropId: string) => void
}

export function PlantSearch({ wishlistIds, onAdd, onRemove }: PlantSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Crop[]>([])
  const [wishlistCrops, setWishlistCrops] = useState<Crop[]>([])
  const [searching, setSearching] = useState(false)

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/crops?q=${encodeURIComponent(query.trim())}`)
        const data = await res.json()
        setResults(data.crops ?? [])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  // Keep wishlistCrops in sync when crops are added from results
  const handleAdd = useCallback((crop: Crop) => {
    setWishlistCrops(prev =>
      prev.find(c => c.id === crop.id) ? prev : [...prev, crop],
    )
    onAdd(crop.id)
  }, [onAdd])

  const handleRemove = useCallback((cropId: string) => {
    setWishlistCrops(prev => prev.filter(c => c.id !== cropId))
    onRemove(cropId)
  }, [onRemove])

  const inWishlist = (id: string) => wishlistIds.includes(id)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 2 — Choose Plants</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="plant-search">Search by name or botanical name</Label>
          <Input
            id="plant-search"
            placeholder="e.g. tomato, basil, Allium…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {searching && <p className="text-sm text-muted-foreground">Searching…</p>}

        {results.length > 0 && (
          <ul className="space-y-1 max-h-64 overflow-y-auto border rounded p-2">
            {results.map(crop => (
              <li key={crop.id} className="flex items-center justify-between text-sm">
                <span>
                  <span className="font-medium">{crop.name}</span>{' '}
                  <span className="text-muted-foreground italic">{crop.botanicalName}</span>
                </span>
                <Button
                  size="sm"
                  variant={inWishlist(crop.id) ? 'secondary' : 'outline'}
                  disabled={inWishlist(crop.id)}
                  onClick={() => handleAdd(crop)}
                >
                  {inWishlist(crop.id) ? 'Added' : 'Add'}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {wishlistCrops.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium mb-2">
                Your wishlist ({wishlistCrops.length} plants)
              </p>
              <div className="flex flex-wrap gap-2">
                {wishlistCrops.map(crop => (
                  <Badge key={crop.id} variant="secondary" className="gap-1">
                    {crop.name}
                    <button
                      onClick={() => handleRemove(crop.id)}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${crop.name}`}
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {wishlistIds.length < 2 && (
          <p className="text-sm text-muted-foreground">Add at least 2 plants to get a recommendation.</p>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/components/plant-search.tsx
git commit -m "feat: add PlantSearch component with debounced search and wishlist"
```

---

## Task 10: Beds Config, Recommendation Display, and Page Assembly

**Files:**
- Create: `src/components/bed-config.tsx`
- Create: `src/components/recommendation-display.tsx`
- Modify: `src/app/page.tsx`

The final UI pieces. `BedConfig` takes number inputs. `RecommendationDisplay` renders the `RecommendResult` response as bed cards, an overflow list, and a conflict warning. `page.tsx` wires everything together: calls `/api/recommend` when the user clicks "Get Recommendations", disables the button until at least 2 plants are in the wishlist and a zone is detected.

- [ ] **Step 1: Create BedConfig**

Create `src/components/bed-config.tsx`:

```tsx
'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface BedConfigProps {
  bedCount: number
  bedCapacity: number
  onChange: (bedCount: number, bedCapacity: number) => void
}

export function BedConfig({ bedCount, bedCapacity, onChange }: BedConfigProps) {
  function handleCount(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Math.max(1, parseInt(e.target.value) || 1)
    onChange(v, bedCapacity)
  }

  function handleCapacity(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Math.max(1, parseInt(e.target.value) || 1)
    onChange(bedCount, v)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 3 — Beds</CardTitle>
      </CardHeader>
      <CardContent className="flex gap-6">
        <div className="space-y-1">
          <Label htmlFor="bed-count">Number of beds</Label>
          <Input
            id="bed-count"
            type="number"
            min={1}
            max={20}
            value={bedCount}
            onChange={handleCount}
            className="w-24"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bed-capacity">Plants per bed (max)</Label>
          <Input
            id="bed-capacity"
            type="number"
            min={1}
            max={20}
            value={bedCapacity}
            onChange={handleCapacity}
            className="w-24"
          />
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Create RecommendationDisplay**

Create `src/components/recommendation-display.tsx`:

```tsx
'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { RecommendResult, CropInput } from '@/lib/recommend'

interface RecommendationDisplayProps {
  result: RecommendResult
}

export function RecommendationDisplay({ result }: RecommendationDisplayProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Step 4 — Recommendations</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {result.beds.map(bed => (
          <Card key={bed.index}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Bed {bed.index + 1}</CardTitle>
            </CardHeader>
            <CardContent>
              {bed.crops.length === 0 ? (
                <p className="text-sm text-muted-foreground">Empty</p>
              ) : (
                <ul className="space-y-1">
                  {bed.crops.map(crop => (
                    <li key={crop.id} className="text-sm">
                      <span className="font-medium">{crop.name}</span>{' '}
                      <span className="text-muted-foreground italic text-xs">{crop.botanicalName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {result.overflow.length > 0 && (
        <div>
          <h3 className="font-medium mb-2 text-amber-700">
            Overflow — no bed space ({result.overflow.length} plants)
          </h3>
          <div className="flex flex-wrap gap-2">
            {result.overflow.map(crop => (
              <Badge key={crop.id} variant="outline">
                {crop.name}
              </Badge>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Add more beds or increase capacity to fit these plants.
          </p>
        </div>
      )}

      {result.conflicts.length > 0 && (
        <div>
          <h3 className="font-medium mb-2 text-red-700">
            Conflicts — incompatible plants in same bed
          </h3>
          <ul className="space-y-1">
            {result.conflicts.map((c, i) => (
              <li key={i} className="text-sm text-red-700">
                {c.a.name} and {c.b.name} should not share a bed
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground mt-1">
            Add more beds to separate these plants.
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Assemble the page**

Replace `src/app/page.tsx` with:

```tsx
'use client'
import { useState } from 'react'
import { useGarden } from '@/hooks/use-garden'
import { ZoneDetector } from '@/components/zone-detector'
import { PlantSearch } from '@/components/plant-search'
import { BedConfig } from '@/components/bed-config'
import { RecommendationDisplay } from '@/components/recommendation-display'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { RecommendResult } from '@/lib/recommend'

export default function Home() {
  const { state, setZone, addToWishlist, removeFromWishlist, setBeds } = useGarden()
  const [result, setResult] = useState<RecommendResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canRecommend = state.minTempC !== null && state.wishlist.length >= 2

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
      <div>
        <h1 className="text-3xl font-bold">power2plant</h1>
        <p className="text-muted-foreground mt-1">
          Companion planting recommendations for your garden beds.
        </p>
      </div>

      <Separator />

      <ZoneDetector minTempC={state.minTempC} onZoneDetected={setZone} />

      <PlantSearch
        wishlistIds={state.wishlist}
        onAdd={addToWishlist}
        onRemove={removeFromWishlist}
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
          {loading ? 'Calculating…' : 'Get Recommendations'}
        </Button>
        {!canRecommend && (
          <p className="text-sm text-muted-foreground">
            {state.minTempC === null
              ? 'Detect your zone first.'
              : 'Add at least 2 plants to your wishlist.'}
          </p>
        )}
      </div>

      {error && <p className="text-red-600">{error}</p>}

      {result && <RecommendationDisplay result={result} />}
    </main>
  )
}
```

- [ ] **Step 4: Run all tests**

```bash
pnpm test:run
```

Expected: All tests pass.

- [ ] **Step 5: Verify TypeScript**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 6: Verify build**

```bash
pnpm build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/bed-config.tsx src/components/recommendation-display.tsx src/app/page.tsx
git commit -m "feat: assemble garden planner UI (zone, plants, beds, recommendations)"
```

---

## Done

At this point the anonymous flow is fully functional:
- Zone detection (geolocation + Leaflet map fallback)
- Plant search with type-ahead (backed by 66k seeded crops)
- Bed configuration (count + capacity)
- Greedy companion planting recommendation
- localStorage persistence across reloads

**Plan 2** (separate plan): better-auth wiring, sign-up/login UI, localStorage→DB migration on account creation.
