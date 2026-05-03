# power2plant Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the power2plant Next.js project, define the Prisma schema, and seed a PostgreSQL database with plant taxonomy and companion planting data from five sources.

**Architecture:** Minimal Next.js 15 app scaffold with Prisma 6 + PostgreSQL 16 in Docker. Data importers are TypeScript scripts sharing a common `Importer` interface, orchestrated by `pnpm db:import`. Trefle runs first to establish canonical botanical names; all other sources resolve against it via a synonym map. Importers do not call the Next.js app layer — they write to Prisma directly.

**Tech Stack:** Next.js 15, Prisma 6, PostgreSQL 16 (Docker), TypeScript 5, tsx 4, Vitest 3, csv-parse 5, cheerio 1

---

## File Map

```
/
├── docker-compose.yml
├── .env.example
├── .env                          (gitignored)
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── next.config.ts
├── prisma/
│   └── schema.prisma
├── data/                         (gitignored, downloaded source files)
│   ├── plantbuddies/
│   │   └── relations-data.js
│   ├── usda/
│   │   └── plants.csv
│   └── openfarm/
│       └── crops.json
├── scripts/
│   └── import/
│       ├── index.ts              ← orchestrator + CLI entry point
│       ├── types.ts              ← RawCrop, RawRelationship, Importer, ImportStats
│       ├── normalize.ts          ← toSlug, resolveCommonName, synonyms map
│       ├── confidence.ts         ← ConfidenceLevel → float mapping
│       └── sources/
│           ├── trefle.ts         ← REST API, crops only
│           ├── usda.ts           ← CSV, crops only
│           ├── openfarm.ts       ← JSON dump, crops + relationships
│           ├── plantbuddies.ts   ← JS file parse, relationships only
│           └── pfaf.ts           ← HTML scraper, crops + relationships
├── src/
│   └── app/
│       ├── layout.tsx            ← root layout (placeholder)
│       └── page.tsx              ← placeholder home page
└── tests/
    └── import/
        ├── normalize.test.ts
        ├── confidence.test.ts
        └── plantbuddies.test.ts
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `next.config.ts`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "power2plant",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest",
    "test:run": "vitest run",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:import": "tsx scripts/import/index.ts",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@prisma/client": "^6.0.0"
  },
  "devDependencies": {
    "prisma": "^6.0.0",
    "typescript": "^5.0.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tsx": "^4.0.0",
    "vitest": "^3.0.0",
    "csv-parse": "^5.0.0",
    "cheerio": "^1.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

- [ ] **Step 4: Create next.config.ts**

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default nextConfig
```

- [ ] **Step 5: Create .env.example**

```
DATABASE_URL="postgresql://power2plant:power2plant@localhost:5432/power2plant"
TREFLE_TOKEN="your_trefle_token_here"
```

- [ ] **Step 6: Create .gitignore**

```
.env
.next/
node_modules/
data/
*.tsbuildinfo
```

- [ ] **Step 7: Create src/app/layout.tsx**

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 8: Create src/app/page.tsx**

```tsx
export default function Home() {
  return <main><h1>power2plant</h1></main>
}
```

- [ ] **Step 9: Install dependencies**

Run: `pnpm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 10: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts next.config.ts .env.example .gitignore src/
git commit -m "feat: scaffold Next.js project"
```

---

## Task 2: Docker Compose + Prisma Schema + Migration

**Files:**
- Create: `docker-compose.yml`
- Create: `prisma/schema.prisma`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: power2plant
      POSTGRES_PASSWORD: power2plant
      POSTGRES_DB: power2plant
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

- [ ] **Step 2: Create prisma/schema.prisma**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Crop {
  id              String             @id @default(cuid())
  botanicalName   String             @unique
  name            String
  slug            String             @unique
  isNitrogenFixer Boolean            @default(false)
  minTempC        Float?
  imageUrl        String?
  sources         CropSource[]
  plantings       Planting[]
  relationshipsA  CropRelationship[] @relation("CropA")
  relationshipsB  CropRelationship[] @relation("CropB")
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt
}

model CropSource {
  id         String     @id @default(cuid())
  source     SourceType
  externalId String?
  url        String?
  rawData    Json
  fetchedAt  DateTime   @default(now())
  cropId     String
  crop       Crop       @relation(fields: [cropId], references: [id])

  @@unique([cropId, source])
}

model CropRelationship {
  id         String               @id @default(cuid())
  type       RelationshipType
  direction  Direction            @default(MUTUAL)
  reason     RelationshipReason?
  confidence Float                @default(0.5)
  notes      String?
  cropAId    String
  cropBId    String
  cropA      Crop                 @relation("CropA", fields: [cropAId], references: [id])
  cropB      Crop                 @relation("CropB", fields: [cropBId], references: [id])
  sources    RelationshipSource[]
  createdAt  DateTime             @default(now())
  updatedAt  DateTime             @updatedAt

  @@unique([cropAId, cropBId])
}

model RelationshipSource {
  id             String          @id @default(cuid())
  source         SourceType
  confidence     ConfidenceLevel @default(ANECDOTAL)
  url            String?
  notes          String?
  fetchedAt      DateTime        @default(now())
  relationshipId String
  relationship   CropRelationship @relation(fields: [relationshipId], references: [id])
}

model UserGarden {
  id        String   @id @default(cuid())
  userId    String
  beds      Bed[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Bed {
  id        String     @id @default(cuid())
  name      String
  gardenId  String
  garden    UserGarden @relation(fields: [gardenId], references: [id])
  plantings Planting[]
}

model Planting {
  id     String @id @default(cuid())
  bedId  String
  bed    Bed    @relation(fields: [bedId], references: [id])
  cropId String
  crop   Crop   @relation(fields: [cropId], references: [id])
}

enum RelationshipType {
  COMPANION
  AVOID
  ATTRACTS
  REPELS
  NURSE
  TRAP_CROP
}

enum Direction {
  MUTUAL
  ONE_WAY
  UNKNOWN
}

enum RelationshipReason {
  PEST_CONTROL
  POLLINATION
  NUTRIENT
  SHADE
  ALLELOPATHY
  OTHER
}

enum ConfidenceLevel {
  ANECDOTAL
  TRADITIONAL
  OBSERVED
  PEER_REVIEWED
}

enum SourceType {
  TREFLE
  USDA
  OPENFARM_DUMP
  PLANTBUDDIES
  PFAF
  WIKIDATA
  GBIF
  COMMUNITY
  MANUAL
}
```

- [ ] **Step 3: Start Postgres**

Run: `docker compose up -d`
Expected: container `power2plant-db-1` running.

Verify: `docker compose ps`
Expected: `db` service shows `Up`.

- [ ] **Step 4: Copy .env.example to .env**

Run: `cp .env.example .env`
No changes needed — default credentials match docker-compose.

- [ ] **Step 5: Run initial migration**

Run: `pnpm db:migrate --name init`
Expected: `prisma/migrations/YYYYMMDD_init/migration.sql` created, all tables created in DB.

- [ ] **Step 6: Generate Prisma client**

Run: `pnpm db:generate`
Expected: `node_modules/@prisma/client` generated, no errors.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml prisma/
git commit -m "feat: add Prisma schema and Docker Compose for PostgreSQL"
```

---

## Task 3: Import Utilities + Tests

**Files:**
- Create: `scripts/import/types.ts`
- Create: `scripts/import/normalize.ts`
- Create: `scripts/import/confidence.ts`
- Create: `tests/import/normalize.test.ts`
- Create: `tests/import/confidence.test.ts`

- [ ] **Step 1: Write failing tests for normalize**

```ts
// tests/import/normalize.test.ts
import { describe, it, expect } from 'vitest'
import { toSlug, resolveCommonName } from '../../scripts/import/normalize'

describe('toSlug', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(toSlug('Solanum lycopersicum')).toBe('solanum-lycopersicum')
  })
  it('strips special characters', () => {
    expect(toSlug("St. John's Wort")).toBe('st-johns-wort')
  })
  it('collapses multiple separators', () => {
    expect(toSlug('  Sweet  Basil  ')).toBe('sweet-basil')
  })
  it('strips leading and trailing hyphens', () => {
    expect(toSlug('-tomato-')).toBe('tomato')
  })
})

describe('resolveCommonName', () => {
  it('resolves known common name to botanical name', () => {
    expect(resolveCommonName('tomato')).toBe('Solanum lycopersicum')
  })
  it('resolves with underscores (PlantBuddies format)', () => {
    expect(resolveCommonName('sweet_basil')).toBe('Ocimum basilicum')
  })
  it('resolves case-insensitively', () => {
    expect(resolveCommonName('GARLIC')).toBe('Allium sativum')
  })
  it('returns null for unknown plant', () => {
    expect(resolveCommonName('xyzzy')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify fails**

Run: `pnpm test:run tests/import/normalize.test.ts`
Expected: FAIL — `Cannot find module '../../scripts/import/normalize'`

- [ ] **Step 3: Write failing tests for confidence**

```ts
// tests/import/confidence.test.ts
import { describe, it, expect } from 'vitest'
import { confidenceToFloat, computeRelationshipConfidence } from '../../scripts/import/confidence'
import { ConfidenceLevel } from '@prisma/client'

describe('confidenceToFloat', () => {
  it('maps ANECDOTAL to 0.25', () => {
    expect(confidenceToFloat(ConfidenceLevel.ANECDOTAL)).toBe(0.25)
  })
  it('maps PEER_REVIEWED to 1.0', () => {
    expect(confidenceToFloat(ConfidenceLevel.PEER_REVIEWED)).toBe(1.0)
  })
})

describe('computeRelationshipConfidence', () => {
  it('returns max confidence across sources', () => {
    expect(computeRelationshipConfidence([
      ConfidenceLevel.ANECDOTAL,
      ConfidenceLevel.OBSERVED,
    ])).toBe(0.75)
  })
  it('returns 0.25 for empty sources', () => {
    expect(computeRelationshipConfidence([])).toBe(0.25)
  })
  it('handles single source', () => {
    expect(computeRelationshipConfidence([ConfidenceLevel.TRADITIONAL])).toBe(0.5)
  })
})
```

- [ ] **Step 4: Create scripts/import/types.ts**

```ts
import type { ConfidenceLevel, Direction, RelationshipReason, RelationshipType, SourceType } from '@prisma/client'

export interface RawCrop {
  botanicalName: string
  name: string
  slug?: string
  minTempC?: number | null
  isNitrogenFixer?: boolean
  imageUrl?: string | null
  externalId?: string
  rawData: unknown
}

export interface RawRelationship {
  cropNameA: string   // botanical preferred; common name resolved via synonyms
  cropNameB: string
  type: RelationshipType
  direction: Direction
  reason?: RelationshipReason
  confidence: ConfidenceLevel
  url?: string
  notes?: string
}

export interface Importer {
  source: SourceType
  fetchCrops?(): AsyncIterable<RawCrop>
  fetchRelationships?(): AsyncIterable<RawRelationship>
}

export interface ImportStats {
  source: SourceType
  cropsCreated: number
  cropsUpdated: number
  relationshipsCreated: number
  relationshipsUpdated: number
  unresolved: string[]
}
```

- [ ] **Step 5: Create scripts/import/normalize.ts**

```ts
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export const synonyms: Record<string, string> = {
  'tomato': 'Solanum lycopersicum',
  'cherry tomato': 'Solanum lycopersicum',
  'basil': 'Ocimum basilicum',
  'sweet basil': 'Ocimum basilicum',
  'carrot': 'Daucus carota',
  'onion': 'Allium cepa',
  'garlic': 'Allium sativum',
  'chives': 'Allium schoenoprasum',
  'leek': 'Allium ampeloprasum',
  'cabbage': 'Brassica oleracea',
  'broccoli': 'Brassica oleracea',
  'cauliflower': 'Brassica oleracea',
  'kale': 'Brassica oleracea',
  'brussels sprouts': 'Brassica oleracea',
  'lettuce': 'Lactuca sativa',
  'spinach': 'Spinacia oleracea',
  'pea': 'Pisum sativum',
  'bean': 'Phaseolus vulgaris',
  'french bean': 'Phaseolus vulgaris',
  'runner bean': 'Phaseolus coccineus',
  'cucumber': 'Cucumis sativus',
  'dill': 'Anethum graveolens',
  'fennel': 'Foeniculum vulgare',
  'marigold': 'Tagetes erecta',
  'nasturtium': 'Tropaeolum majus',
  'chamomile': 'Matricaria chamomilla',
  'rosemary': 'Salvia rosmarinus',
  'mint': 'Mentha spicata',
  'spearmint': 'Mentha spicata',
  'peppermint': 'Mentha piperita',
  'sage': 'Salvia officinalis',
  'thyme': 'Thymus vulgaris',
  'wormwood': 'Artemisia absinthium',
  'potato': 'Solanum tuberosum',
  'corn': 'Zea mays',
  'maize': 'Zea mays',
  'squash': 'Cucurbita maxima',
  'pumpkin': 'Cucurbita pepo',
  'pepper': 'Capsicum annuum',
  'eggplant': 'Solanum melongena',
  'aubergine': 'Solanum melongena',
  'strawberry': 'Fragaria ananassa',
  'sunflower': 'Helianthus annuus',
  'borage': 'Borago officinalis',
  'parsley': 'Petroselinum crispum',
  'celery': 'Apium graveolens',
  'radish': 'Raphanus sativus',
  'beet': 'Beta vulgaris',
  'beetroot': 'Beta vulgaris',
  'swiss chard': 'Beta vulgaris',
  'turnip': 'Brassica rapa',
  'asparagus': 'Asparagus officinalis',
  'lavender': 'Lavandula angustifolia',
  'rue': 'Ruta graveolens',
  'tansy': 'Tanacetum vulgare',
  'yarrow': 'Achillea millefolium',
  'hyssop': 'Hyssopus officinalis',
  'lemon balm': 'Melissa officinalis',
  'currant': 'Ribes rubrum',
}

export function resolveCommonName(commonName: string): string | null {
  const normalized = commonName
    .toLowerCase()
    .trim()
    .replace(/_/g, ' ')
  return synonyms[normalized] ?? null
}
```

- [ ] **Step 6: Create scripts/import/confidence.ts**

```ts
import { ConfidenceLevel } from '@prisma/client'

export const CONFIDENCE_WEIGHTS: Record<ConfidenceLevel, number> = {
  ANECDOTAL: 0.25,
  TRADITIONAL: 0.5,
  OBSERVED: 0.75,
  PEER_REVIEWED: 1.0,
}

export function confidenceToFloat(level: ConfidenceLevel): number {
  return CONFIDENCE_WEIGHTS[level]
}

export function computeRelationshipConfidence(levels: ConfidenceLevel[]): number {
  if (levels.length === 0) return 0.25
  return Math.max(...levels.map(confidenceToFloat))
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm test:run tests/import/normalize.test.ts tests/import/confidence.test.ts`
Expected: all 9 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/import/types.ts scripts/import/normalize.ts scripts/import/confidence.ts tests/import/
git commit -m "feat: add import utilities with tests (normalize, confidence)"
```

---

## Task 4: Orchestrator

**Files:**
- Create: `scripts/import/index.ts`

- [ ] **Step 1: Create scripts/import/index.ts**

```ts
import { PrismaClient } from '@prisma/client'
import { toSlug, resolveCommonName } from './normalize'
import { computeRelationshipConfidence } from './confidence'
import type { Importer, ImportStats, RawCrop, RawRelationship } from './types'

// Importers registered here; trefle MUST be first
import { trefleImporter } from './sources/trefle'
import { usdaImporter } from './sources/usda'
import { openFarmImporter } from './sources/openfarm'
import { plantBuddiesImporter } from './sources/plantbuddies'
import { pfafImporter } from './sources/pfaf'

const prisma = new PrismaClient()

const ALL_IMPORTERS: Importer[] = [
  trefleImporter,
  usdaImporter,
  openFarmImporter,
  plantBuddiesImporter,
  pfafImporter,
]

async function upsertCrop(importer: Importer, raw: RawCrop, stats: ImportStats) {
  const slug = raw.slug ?? toSlug(raw.botanicalName)
  const existing = await prisma.crop.findUnique({ where: { botanicalName: raw.botanicalName } })

  if (existing) {
    await prisma.crop.update({
      where: { id: existing.id },
      data: {
        name: raw.name || existing.name,
        minTempC: raw.minTempC ?? existing.minTempC,
        imageUrl: raw.imageUrl ?? existing.imageUrl,
        isNitrogenFixer: raw.isNitrogenFixer ?? existing.isNitrogenFixer,
      },
    })
    stats.cropsUpdated++
  } else {
    await prisma.crop.create({
      data: {
        botanicalName: raw.botanicalName,
        name: raw.name,
        slug,
        minTempC: raw.minTempC ?? null,
        imageUrl: raw.imageUrl ?? null,
        isNitrogenFixer: raw.isNitrogenFixer ?? false,
      },
    })
    stats.cropsCreated++
  }

  const crop = await prisma.crop.findUniqueOrThrow({ where: { botanicalName: raw.botanicalName } })
  await prisma.cropSource.upsert({
    where: { cropId_source: { cropId: crop.id, source: importer.source } },
    create: {
      cropId: crop.id,
      source: importer.source,
      externalId: raw.externalId,
      rawData: raw.rawData as object,
    },
    update: {
      rawData: raw.rawData as object,
      fetchedAt: new Date(),
    },
  })
}

async function resolveCropId(name: string): Promise<string | null> {
  const byBotanical = await prisma.crop.findUnique({ where: { botanicalName: name } })
  if (byBotanical) return byBotanical.id

  const bySlug = await prisma.crop.findUnique({ where: { slug: toSlug(name) } })
  if (bySlug) return bySlug.id

  const botanical = resolveCommonName(name)
  if (botanical) {
    const bySynonym = await prisma.crop.findUnique({ where: { botanicalName: botanical } })
    if (bySynonym) return bySynonym.id
  }

  return null
}

async function upsertRelationship(importer: Importer, raw: RawRelationship, stats: ImportStats) {
  const idA = await resolveCropId(raw.cropNameA)
  const idB = await resolveCropId(raw.cropNameB)

  if (!idA) { stats.unresolved.push(raw.cropNameA); return }
  if (!idB) { stats.unresolved.push(raw.cropNameB); return }

  const [cropAId, cropBId] = idA < idB ? [idA, idB] : [idB, idA]

  const relationship = await prisma.cropRelationship.upsert({
    where: { cropAId_cropBId: { cropAId, cropBId } },
    create: { cropAId, cropBId, type: raw.type, direction: raw.direction, reason: raw.reason ?? null, confidence: 0.5 },
    update: {},
    include: { sources: true },
  })

  const sourceExists = relationship.sources.some(s => s.source === importer.source)
  if (!sourceExists) {
    await prisma.relationshipSource.create({
      data: {
        relationshipId: relationship.id,
        source: importer.source,
        confidence: raw.confidence,
        url: raw.url ?? null,
        notes: raw.notes ?? null,
      },
    })
    stats.relationshipsCreated++
  } else {
    stats.relationshipsUpdated++
  }

  const sources = await prisma.relationshipSource.findMany({ where: { relationshipId: relationship.id } })
  await prisma.cropRelationship.update({
    where: { id: relationship.id },
    data: { confidence: computeRelationshipConfidence(sources.map(s => s.confidence)) },
  })
}

async function runImporter(importer: Importer): Promise<ImportStats> {
  const stats: ImportStats = {
    source: importer.source,
    cropsCreated: 0,
    cropsUpdated: 0,
    relationshipsCreated: 0,
    relationshipsUpdated: 0,
    unresolved: [],
  }

  console.log(`[${importer.source}] Starting...`)

  if (importer.fetchCrops) {
    for await (const raw of importer.fetchCrops()) {
      await upsertCrop(importer, raw, stats)
    }
  }

  if (importer.fetchRelationships) {
    for await (const raw of importer.fetchRelationships()) {
      await upsertRelationship(importer, raw, stats)
    }
  }

  const unique = [...new Set(stats.unresolved)]
  console.log(`[${importer.source}] crops +${stats.cropsCreated} ~${stats.cropsUpdated} | relationships +${stats.relationshipsCreated} ~${stats.relationshipsUpdated}`)
  if (unique.length > 0) {
    console.warn(`[${importer.source}] Unresolved (${unique.length}): ${unique.join(', ')}`)
  }

  return stats
}

async function main() {
  const target = process.argv[2]?.toUpperCase()
  const importers = target
    ? ALL_IMPORTERS.filter(i => i.source === target)
    : ALL_IMPORTERS

  if (importers.length === 0) {
    console.error(`Unknown source: ${target}`)
    console.error(`Available: ${ALL_IMPORTERS.map(i => i.source).join(', ')}`)
    process.exit(1)
  }

  for (const importer of importers) {
    await runImporter(importer)
  }

  await prisma.$disconnect()
}

main().catch(async e => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
```

- [ ] **Step 2: Commit (stub importers not yet written — this will fail to run)**

```bash
git add scripts/import/index.ts
git commit -m "feat: add import orchestrator"
```

---

## Task 5: Download Source Data Files

Source files too large or JS-formatted to fetch at runtime. Download once into `data/` (gitignored).

- [ ] **Step 1: Download PlantBuddies relations data**

Run:
```bash
curl -o data/plantbuddies/relations-data.js \
  https://raw.githubusercontent.com/serlo/PlantBuddies/main/data/relations-data.js
```
Expected: `data/plantbuddies/relations-data.js` ~50KB.

Verify: `wc -l data/plantbuddies/relations-data.js` — expect ~1720 lines.

- [ ] **Step 2: Download USDA PLANTS CSV**

Run:
```bash
curl -L -o data/usda/plants.csv \
  "https://plants.usda.gov/assets/docs/CompletePLANTSList/plantlst.txt"
```
Expected: `data/usda/plants.csv` downloaded with tab-separated plant data.

Verify: `head -3 data/usda/plants.csv` — first line is header with `Symbol`, `Scientific Name with Author`, etc.

Note: USDA provides a tab-separated file. The `csv-parse` parser handles this with `delimiter: '\t'`.

- [ ] **Step 3: Download OpenFarm data dump**

OpenFarm shut down August 2025. The GitHub repo may have a data export in `/db/seeds/` or as a release artifact.

Run:
```bash
# Check for available data files in the repo
curl -s https://api.github.com/repos/openfarmcc/OpenFarm/contents/db/seeds \
  -H "Accept: application/vnd.github.v3+json" | grep '"name"'
```

If JSON seed files exist, download the crops file:
```bash
curl -o data/openfarm/crops.json \
  https://raw.githubusercontent.com/openfarmcc/OpenFarm/master/db/seeds/crops.json
```

If the format differs from expected (see Task 8), adjust the importer accordingly. Log a warning and proceed with other sources if no dump is available.

- [ ] **Step 4: Commit (data/ is gitignored, but note the download commands)**

```bash
git add .gitignore
git commit -m "chore: document data download steps in plan"
```

---

## Task 6: Trefle Importer

**Files:**
- Create: `scripts/import/sources/trefle.ts`

Note: Trefle provides 45,000+ plants. This import is slow (~6 hours at 120 req/min). For development, limit pages with `MAX_PAGES` env var.

- [ ] **Step 1: Create scripts/import/sources/trefle.ts**

```ts
import type { Importer, RawCrop } from '../types'
import { SourceType } from '@prisma/client'

const BASE_URL = 'https://trefle.io/api/v1'
const RATE_LIMIT_MS = 500   // 120 req/min = 1 req per 500ms

export const trefleImporter: Importer = {
  source: SourceType.TREFLE,

  async *fetchCrops(): AsyncIterable<RawCrop> {
    const token = process.env.TREFLE_TOKEN
    if (!token) throw new Error('TREFLE_TOKEN not set in .env')

    const maxPages = process.env.MAX_PAGES ? parseInt(process.env.MAX_PAGES) : Infinity
    let page = 1

    while (page <= maxPages) {
      const res = await fetch(`${BASE_URL}/plants?token=${token}&page=${page}`)
      if (!res.ok) throw new Error(`Trefle API ${res.status}: ${await res.text()}`)

      const json = await res.json() as {
        data: TreflePlant[]
        links: { next: string | null }
      }

      for (const plant of json.data) {
        if (!plant.scientific_name) continue
        yield {
          botanicalName: plant.scientific_name,
          name: plant.common_name ?? plant.scientific_name,
          slug: plant.slug,
          minTempC: plant.main_species?.growth?.minimum_temperature?.deg_c ?? null,
          imageUrl: plant.image_url ?? null,
          externalId: String(plant.id),
          rawData: plant,
        }
      }

      if (!json.links.next) break
      page++
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS))
    }
  },
}

type TreflePlant = {
  id: number
  common_name: string | null
  slug: string
  scientific_name: string
  image_url: string | null
  main_species?: {
    growth?: {
      minimum_temperature?: {
        deg_c?: number
      }
    }
  }
}
```

- [ ] **Step 2: Smoke test with 1 page**

Run: `MAX_PAGES=1 pnpm db:import TREFLE`
Expected: `[TREFLE] crops +20 ~0` (20 plants per page), no errors.

Verify in DB: `pnpm db:studio` → open Crop table → rows visible with botanicalName populated.

- [ ] **Step 3: Commit**

```bash
git add scripts/import/sources/trefle.ts
git commit -m "feat: add Trefle importer (crops)"
```

---

## Task 7: USDA Importer

**Files:**
- Create: `scripts/import/sources/usda.ts`

- [ ] **Step 1: Create scripts/import/sources/usda.ts**

```ts
import { createReadStream } from 'fs'
import { resolve } from 'path'
import { parse } from 'csv-parse'
import type { Importer, RawCrop } from '../types'
import { SourceType } from '@prisma/client'
import { toSlug } from '../normalize'

const CSV_PATH = resolve(process.cwd(), 'data/usda/plants.csv')

type UsdaRow = {
  'Symbol': string
  'Scientific Name with Author': string
  'National Common Name': string
  'Family': string
}

export const usdaImporter: Importer = {
  source: SourceType.USDA,

  async *fetchCrops(): AsyncIterable<RawCrop> {
    const parser = createReadStream(CSV_PATH).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: '\t',
        relax_column_count: true,
      })
    )

    for await (const row of parser as AsyncIterable<UsdaRow>) {
      // Extract genus + species only (strip author citation)
      const parts = row['Scientific Name with Author']?.split(' ') ?? []
      if (parts.length < 2) continue
      const botanicalName = `${parts[0]} ${parts[1]}`

      const commonName = row['National Common Name']?.trim()
      if (!commonName && !botanicalName) continue

      yield {
        botanicalName,
        name: commonName || botanicalName,
        slug: toSlug(botanicalName),
        rawData: row,
      }
    }
  },
}
```

- [ ] **Step 2: Run USDA import**

Run: `pnpm db:import USDA`
Expected: `[USDA] crops +N ~M` — large numbers (40,000+ species), no crash.
Unresolved: none (USDA has no relationship data).

- [ ] **Step 3: Commit**

```bash
git add scripts/import/sources/usda.ts
git commit -m "feat: add USDA importer (crops)"
```

---

## Task 8: OpenFarm Importer

**Files:**
- Create: `scripts/import/sources/openfarm.ts`

Note: OpenFarm's exact dump format is unknown until the file is inspected. The importer below matches the last-known API JSON structure. If the dump format differs, adjust the type assertions accordingly.

- [ ] **Step 1: Inspect the dump format**

Run: `head -50 data/openfarm/crops.json | python3 -m json.tool`
Observe the top-level structure and field names.

If it's an array of crop objects, proceed. If it's a different shape, adjust the `OpenFarmCrop` type and parsing logic in the importer below before writing it.

- [ ] **Step 2: Create scripts/import/sources/openfarm.ts**

```ts
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { Importer, RawCrop, RawRelationship } from '../types'
import { ConfidenceLevel, Direction, RelationshipType, SourceType } from '@prisma/client'

const DATA_PATH = resolve(process.cwd(), 'data/openfarm/crops.json')

type OpenFarmCrop = {
  id: string
  name: string
  slug: string
  binomial_name: string | null
  description: string | null
  main_image_path: string | null
  companions: { id: string; name: string }[]
}

export const openFarmImporter: Importer = {
  source: SourceType.OPENFARM_DUMP,

  async *fetchCrops(): AsyncIterable<RawCrop> {
    const crops: OpenFarmCrop[] = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
    for (const crop of crops) {
      if (!crop.binomial_name) continue
      yield {
        botanicalName: crop.binomial_name,
        name: crop.name,
        externalId: crop.id,
        imageUrl: crop.main_image_path ?? null,
        rawData: crop,
      }
    }
  },

  async *fetchRelationships(): AsyncIterable<RawRelationship> {
    const crops: OpenFarmCrop[] = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
    const idToName = new Map(crops.map(c => [c.id, c.binomial_name ?? c.name]))

    for (const crop of crops) {
      if (!crop.binomial_name) continue
      for (const companion of crop.companions ?? []) {
        const companionName = idToName.get(companion.id) ?? companion.name
        yield {
          cropNameA: crop.binomial_name,
          cropNameB: companionName,
          type: RelationshipType.COMPANION,
          direction: Direction.MUTUAL,
          confidence: ConfidenceLevel.ANECDOTAL,
          url: `https://github.com/openfarmcc/OpenFarm`,
        }
      }
    }
  },
}
```

- [ ] **Step 3: Run OpenFarm import**

Run: `pnpm db:import OPENFARM_DUMP`
Expected: crops and relationships imported. Some unresolved names expected (companions with common names only — these will be resolved once synonym map is extended).

- [ ] **Step 4: Commit**

```bash
git add scripts/import/sources/openfarm.ts
git commit -m "feat: add OpenFarm dump importer (crops + relationships)"
```

---

## Task 9: PlantBuddies Importer + Test

**Files:**
- Create: `scripts/import/sources/plantbuddies.ts`
- Create: `tests/import/plantbuddies.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/import/plantbuddies.test.ts
import { describe, it, expect } from 'vitest'
import { parseRelationsJs } from '../../scripts/import/sources/plantbuddies'

describe('parseRelationsJs', () => {
  it('parses companion pair (b=1)', () => {
    const js = 'var x=[{id:0,p1:"chives",p2:"leek",b:1}]'
    const result = parseRelationsJs(js)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ p1: 'chives', p2: 'leek', b: 1 })
  })

  it('parses incompatible pair (b=-1)', () => {
    const js = 'var x=[{id:1,p1:"garlic",p2:"cabbage",b:-1}]'
    const result = parseRelationsJs(js)
    expect(result[0]).toMatchObject({ b: -1 })
  })

  it('filters out neutral pairs (b="")', () => {
    const js = 'var x=[{id:2,p1:"corn",p2:"wheat",b:""}]'
    const result = parseRelationsJs(js)
    expect(result).toHaveLength(0)
  })

  it('handles underscore plant names', () => {
    const js = 'var x=[{id:3,p1:"sweet_basil",p2:"tomato",b:1}]'
    const result = parseRelationsJs(js)
    expect(result[0].p1).toBe('sweet basil')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run tests/import/plantbuddies.test.ts`
Expected: FAIL — `Cannot find module '../../scripts/import/sources/plantbuddies'`

- [ ] **Step 3: Create scripts/import/sources/plantbuddies.ts**

```ts
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { Importer, RawRelationship } from '../types'
import { ConfidenceLevel, Direction, RelationshipType, SourceType } from '@prisma/client'

const DATA_PATH = resolve(process.cwd(), 'data/plantbuddies/relations-data.js')

type PBRelation = { id: number; p1: string; p2: string; b: 1 | -1 }

export function parseRelationsJs(js: string): PBRelation[] {
  const match = js.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('Cannot find array in PlantBuddies JS')

  // Quote unquoted keys: id: → "id":
  const quoted = match[0].replace(/(\b\w+)(?=\s*:)/g, '"$1"')
  // Remove trailing commas before ] or }
  const clean = quoted.replace(/,(\s*[}\]])/g, '$1')
  // Parse and drop neutral (b: "") entries
  const parsed: Array<{ id: number; p1: string; p2: string; b: 1 | -1 | '' }> = JSON.parse(clean)
  return parsed
    .filter((r): r is PBRelation => r.b === 1 || r.b === -1)
    .map(r => ({ ...r, p1: r.p1.replace(/_/g, ' '), p2: r.p2.replace(/_/g, ' ') }))
}

export const plantBuddiesImporter: Importer = {
  source: SourceType.PLANTBUDDIES,

  async *fetchRelationships(): AsyncIterable<RawRelationship> {
    const js = readFileSync(DATA_PATH, 'utf-8')
    const relations = parseRelationsJs(js)

    for (const rel of relations) {
      yield {
        cropNameA: rel.p1,
        cropNameB: rel.p2,
        type: rel.b === 1 ? RelationshipType.COMPANION : RelationshipType.AVOID,
        direction: Direction.MUTUAL,
        confidence: ConfidenceLevel.TRADITIONAL,
        url: 'https://github.com/serlo/PlantBuddies',
      }
    }
  },
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run tests/import/plantbuddies.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Run PlantBuddies import**

Run: `pnpm db:import PLANTBUDDIES`
Expected: `[PLANTBUDDIES] relationships +N ~M`. Unresolved names logged — extend `synonyms` in `normalize.ts` for any that should resolve.

- [ ] **Step 6: Commit**

```bash
git add scripts/import/sources/plantbuddies.ts tests/import/plantbuddies.test.ts
git commit -m "feat: add PlantBuddies importer with tests (relationships)"
```

---

## Task 10: PFAF Importer

**Files:**
- Create: `scripts/import/sources/pfaf.ts`

PFAF has no API. Scrape plant pages using botanical names already in the DB from Trefle/USDA. Fetches one page per plant, extracts companion and avoid sections. Respect rate limiting — PFAF is a small charity site.

- [ ] **Step 1: Create scripts/import/sources/pfaf.ts**

```ts
import { PrismaClient } from '@prisma/client'
import { load } from 'cheerio'
import type { Importer, RawCrop, RawRelationship } from '../types'
import { ConfidenceLevel, Direction, RelationshipType, SourceType } from '@prisma/client'
import { resolveCommonName } from '../normalize'

const RATE_LIMIT_MS = 2000  // 2s between requests — PFAF is a small charity site
const BASE_URL = 'https://pfaf.org/user/Plant.aspx'

async function fetchPfafPage(botanicalName: string): Promise<string | null> {
  const url = `${BASE_URL}?LatinName=${encodeURIComponent(botanicalName)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'power2plant/0.1 (non-commercial research; contact via github)' }
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`PFAF ${res.status} for ${botanicalName}`)
  return res.text()
}

function parseMinTempC(html: string): number | null {
  const $ = load(html)
  // PFAF RHS hardiness label maps to approximate temps
  const rhsText = $('td:contains("Hardiness")').next().text().trim()
  const rhsMatch = rhsText.match(/H(\d)/)
  if (!rhsMatch) return null
  const rhsLevel = parseInt(rhsMatch[1])
  // RHS H1a=15°C H2=1°C H3=-5°C H4=-10°C H5=-15°C H6=-20°C H7<-20°C
  const RHS_TO_MIN_C: Record<number, number> = { 1: 15, 2: 1, 3: -5, 4: -10, 5: -15, 6: -20, 7: -25 }
  return RHS_TO_MIN_C[rhsLevel] ?? null
}

function parseCompanions(html: string): { companions: string[]; avoid: string[] } {
  const $ = load(html)
  const companionText = $('td:contains("Companion Plants")').next().text().trim()
  const avoidText = $('td:contains("Avoid Growing Near")').next().text().trim()

  const split = (text: string): string[] =>
    text.split(/[,;]/).map(s => s.trim()).filter(Boolean)

  return {
    companions: split(companionText),
    avoid: split(avoidText),
  }
}

export const pfafImporter: Importer = {
  source: SourceType.PFAF,

  async *fetchCrops(): AsyncIterable<RawCrop> {
    const prisma = new PrismaClient()
    const crops = await prisma.crop.findMany({ select: { botanicalName: true } })
    await prisma.$disconnect()

    for (const { botanicalName } of crops) {
      const html = await fetchPfafPage(botanicalName)
      if (!html) continue

      const minTempC = parseMinTempC(html)
      yield {
        botanicalName,
        name: botanicalName,
        minTempC: minTempC ?? undefined,
        rawData: { scraped: true },
      }

      await new Promise(r => setTimeout(r, RATE_LIMIT_MS))
    }
  },

  async *fetchRelationships(): AsyncIterable<RawRelationship> {
    const prisma = new PrismaClient()
    const crops = await prisma.crop.findMany({ select: { botanicalName: true } })
    await prisma.$disconnect()

    for (const { botanicalName } of crops) {
      const html = await fetchPfafPage(botanicalName)
      if (!html) continue

      const { companions, avoid } = parseCompanions(html)
      const url = `${BASE_URL}?LatinName=${encodeURIComponent(botanicalName)}`

      for (const name of companions) {
        const resolved = resolveCommonName(name) ?? name
        yield {
          cropNameA: botanicalName,
          cropNameB: resolved,
          type: RelationshipType.COMPANION,
          direction: Direction.MUTUAL,
          confidence: ConfidenceLevel.TRADITIONAL,
          url,
        }
      }

      for (const name of avoid) {
        const resolved = resolveCommonName(name) ?? name
        yield {
          cropNameA: botanicalName,
          cropNameB: resolved,
          type: RelationshipType.AVOID,
          direction: Direction.MUTUAL,
          confidence: ConfidenceLevel.TRADITIONAL,
          url,
        }
      }

      await new Promise(r => setTimeout(r, RATE_LIMIT_MS))
    }
  },
}
```

- [ ] **Step 2: Smoke test PFAF with a known plant**

Run a quick manual check before full import:
```bash
curl "https://pfaf.org/user/Plant.aspx?LatinName=Solanum+lycopersicum" | grep -i "companion"
```
Expected: HTML containing companion plant names in a table cell.

If structure differs from expected selectors, adjust `parseCompanions` CSS selectors before running full import.

- [ ] **Step 3: Run PFAF import (slow — runs overnight if full DB populated)**

For development, test with small batch:
```bash
# Temporarily add PFAF_MAX_CROPS=10 guard to pfaf.ts fetchCrops loop if desired
pnpm db:import PFAF
```

Expected: crops updated with minTempC from RHS ratings, companion relationships created.

- [ ] **Step 4: Commit**

```bash
git add scripts/import/sources/pfaf.ts
git commit -m "feat: add PFAF scraper (crops + relationships)"
```

---

## Task 11: Wire + Verify Full Import

- [ ] **Step 1: Run all tests**

Run: `pnpm test:run`
Expected: all tests PASS.

- [ ] **Step 2: Run full import (Trefle + USDA + OpenFarm + PlantBuddies)**

Run: `pnpm db:import`
Note: Skip PFAF for initial verification (slow scraper). Comment it out of `ALL_IMPORTERS` temporarily.
Expected: all four importers complete, stats logged, no crashes.

- [ ] **Step 3: Verify data in DB**

Run: `pnpm db:studio` → open browser to `localhost:5555`

Check:
- `Crop` table: rows present, `botanicalName` populated, some `minTempC` values from Trefle
- `CropRelationship` table: rows with `type`, `confidence > 0`
- `RelationshipSource` table: rows with `source` populated
- Query: find `Solanum lycopersicum`, verify it has at least one `COMPANION` relationship

- [ ] **Step 4: Check unresolved warnings**

Review console output for `Unresolved` lines. For each plant name that appears frequently, add it to `synonyms` in `normalize.ts` and re-run the affected importer.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete data foundation — plant DB seeded from multiple sources"
```

---

## Self-Review

**Spec coverage:**
- Plant DB with companion data — Tasks 6–10
- Hardiness zone via minTempC — `Crop.minTempC` in schema, populated by Trefle + PFAF
- Multi-source provenance — `CropSource` + `RelationshipSource` in schema
- Confidence scoring — `confidence.ts` utilities, derived from `RelationshipSource.confidence`
- Botanical name as canonical key — `Crop.botanicalName @unique`, Trefle first
- Synonym resolution — `normalize.ts` synonyms map
- Idempotent imports — all writes use upsert
- Bed/Planting models — `UserGarden`, `Bed`, `Planting` in schema (used by later phases)

**Known gaps (intentional — post-MVP):**
- better-auth User model not yet wired to UserGarden
- No Next.js UI
- PFAF HTML selectors may need adjustment after inspecting live page
- OpenFarm dump format requires verification against actual file
