---
name: power2plant project
description: Reimplementation of the powerplant garden planning app — modernized stack, same core domain
type: project
originSessionId: b2c6e4ce-f079-4d2d-9bc8-c36ee77adcb2
---
Reimplementing "powerplant" as "power2plant". Original spec: https://wiki.ecohackerfarm.org/powerplant:software_specification

**Domain:** Companion planting / permaculture garden planner. Crop compatibility, planting schedules, task management.

**Original stack:** React + Node/Express + MongoDB + Passport + Mocha/Chai

**New stack:** Next.js + Prisma + PostgreSQL + Docker + Vitest + better-auth

**Key domain concepts:**
- Location → Garden → Bed → Crops hierarchy
- Tasks associated with location/bed/crop
- Offline-first (command queue + sync)
- OpenFarm.cc API for crop data
- FarmOS API for export/import
- MVP: select 2+ plants, get compatible groupings (no redundant subsets)

**Status:** Auth + plant detail pages COMPLETE — all on main (2026-05-04). 79/79 tests passing.

**What's built:**
- Next.js 15 + Prisma 6 + PostgreSQL 16 (Docker) + Vitest 3 + TypeScript + shadcn/ui + Leaflet + better-auth
- Full Prisma schema: Crop (commonNames[], isCommonCrop), CropRelationship, RelationshipSource, UserGarden, Bed, Planting
- 5 data importers: Trefle, USDA, OpenFarm, PlantBuddies, PFAF; `pnpm db:import`
- DB seeded: 66,493 crops, 343 relationships — `pnpm db:restore` to load
- `/api/zone`, `/api/crops` (?q= search, ?ids= rehydration), `/api/recommend`, `/api/garden` (GET/PUT, session-gated), `/api/plants/[id]`, `/api/plants/[id]/companions/[companionId]`
- `src/lib/recommend.ts` — greedy affinity algo: conflict-avoidance constraint, bridge-crop duplication pass, confidence labels
- `src/lib/crop-rank.ts` — pure search ranking (exact→starts-with+isCommonCrop→contains)
- Plant detail page (`/plants/[id]`): companion list, add-to-wishlist, add-and-recommend
- Relationship detail page (`/plants/[id]/companions/[companionId]`): both crops, full details, sources
- ConfidenceBadge: click-to-explain popover with all 4 levels
- AuthPanel: sign up / sign in / signed-out display; garden state syncs to DB on sign-in
- Recommendation: conflicting pairs separated into different beds; bridge crops (e.g. Basil) duplicated into all compatible beds with "· also in Bed X" note

**TODO:** Contact Serlo (serlo/PlantBuddies) to clarify license before production use. Proceeding as non-commercial fair use for now.

## Decisions made

**MVP scope:**
- Plant DB seeded from multiple sources
- Hardiness zone detection (geolocation auto, fallback: map picker or address search)
- User picks bed count + plant wishlist
- App recommends plant-to-bed assignment (compatibility only, no size constraints)
- No account = localStorage; account = DB sync

**Schema decisions:**
- Hierarchy: UserGarden → Bed → Planting → Crop (no Location/Task for MVP)
- `Crop.minTempC Float?` — canonical hardiness, derive any zone system from this
- USDA + RHS supported for MVP (both temp-based, convertible); Canadian/AHS/Sunset post-MVP
- `CropRelationship`: one canonical record per pair, app enforces cropAId < cropBId lexicographically
- `CropRelationship`: type (COMPANION/AVOID/ATTRACTS/REPELS/NURSE/TRAP_CROP), direction (MUTUAL/ONE_WAY/UNKNOWN), reason (PEST_CONTROL/POLLINATION/NUTRIENT/SHADE/ALLELOPATHY/OTHER), confidence Float (derived from sources)
- ONE_WAY direction: cropA=actor, cropB=beneficiary — algo only gives affinity bonus to cropB's bed
- `RelationshipSource.confidence`: categorical (ANECDOTAL=0.25/TRADITIONAL=0.5/OBSERVED=0.75/PEER_REVIEWED=1.0) → feeds derived Float on relationship
- `RelationshipSource[]` per relationship — full provenance, multiple sources per relationship
- `CropSource[]` per crop — raw data per source
- Task polymorphic nullable FKs + raw SQL check constraint (exactly one target)
- Tasks dropped from MVP schema entirely

**Recommendation algo:**
- Greedy affinity: assign plants to beds maximizing intra-bed companion weights
- Weight matrix: +confidence (COMPANION), -confidence (INCOMPATIBLE), 0 (NEUTRAL/unknown)
- Bed capacity: user-configurable, default 3 plants/bed
- Pre-filter: remove crops where minTempC > user zone temp before running
- Overflow list returned when plants > beds × capacity
- Conflicts list when incompatible pairs forced together
- Post-MVP: upgrade to simulated annealing for better results

**API design:**
- Server Actions: createGarden, addBed, addPlanting, removePlanting, importLocalGarden
- Route Handlers: /api/auth/[...all] (better-auth), /api/zone (coords→minTempC), /api/recommend (POST, anonymous-friendly)
- Importers: direct Prisma scripts, no API layer

**Post-MVP backlog:**
- Greenhouse flag on Bed — overrides ambient minTempC filter (greenhouse extends viable plant range)
- Season awareness — minTempC requirement varies by season; planting window logic needed

**Importer architecture:**
- Plugin pattern: each source implements `Importer` interface (fetchCrops, fetchRelationships)
- Orchestrator handles all DB upserts, confidence recomputation, logging
- `Crop.botanicalName String @unique` — canonical match key across sources
- Trefle runs first to seed botanicalName; others match against it
- Synonym map (commonName → botanicalName) for sources with common names only (PlantBuddies, OpenFarm)
- Unmatched relationships logged as warnings for manual review
- Run: `pnpm db:import` (all) or `pnpm db:import <source>`

**Data sources (seeding):**
- Trefle API — taxonomy, basic plant info
- USDA CSV — taxonomy supplement
- OpenFarm GitHub dump — baseline companion relationships
- PlantBuddies (serlo/PlantBuddies) — 1,717 relationships, fair use (license TBD)
- PFAF — companion + growing data, CC NC-SA (ok, non-commercial)
- Community — `COMMUNITY` SourceType for user contributions

**Why:** Full reimplementation with modern stack — details TBD in conversation.
