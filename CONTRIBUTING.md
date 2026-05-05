# Contributing to power2plant

## Development Setup

See the [README](README.md#getting-started) for setup instructions.

## Branching & Release Workflow

```
feat/<issue-number>-<slug>  →  release/vX.Y.Z  →  main
fix/<slug>                  →  release/vX.Y.Z  →  main
```

- **Feature/fix branches** target a release branch, never `main` directly.
- **Release branches** (`release/vX.Y.Z`) accumulate related features. A PR from the release branch into `main` stays open until the release is ready to ship, then gets merged in one shot.
- **Branch naming**: `feat/41-research-discover`, `fix/healthcheck`, etc. — issue number prefix where applicable.

### CI gates

| PR type | CI |
|---|---|
| Any PR | Unit tests (`pnpm test:run`) |
| `release/*` → `main` | E2E tests (`pnpm test:e2e`) |

### PR test plans

Test plans in PR descriptions are **post-merge acceptance criteria** for manual verification — click through the feature after the release branch lands on `main` and the dev server picks it up. E2E smoke tests cover regression; the test plan covers feature correctness.

## Running Tests

```bash
pnpm test:run
```

All 77 tests must pass before submitting a PR.

## Project Structure

```
src/
  app/
    api/
      auth/[...all]/   # better-auth route handler
      crops/           # Plant search endpoint
      garden/          # User garden GET/PUT
      plants/[id]/     # Plant detail + companion list
        companions/[companionId]/  # Relationship detail + sources
      recommend/       # Bed assignment POST
      zone/            # Geolocation → hardiness zone
    plants/
      [id]/page.tsx              # Plant detail page
        companions/[companionId]/page.tsx  # Relationship detail page
    page.tsx           # Main page (anonymous flow)
  components/
    auth-panel.tsx     # Sign in / sign up / signed-in display
    bed-config.tsx     # Bed count + capacity inputs
    confidence-badge.tsx  # Confidence level badge with click-to-explain popover
    plant-search.tsx   # Debounced crop search + wishlist (keyboard nav)
    recommendation-display.tsx
    zone-detector.tsx  # Geolocation + map picker
  hooks/
    use-garden.ts      # Garden state (localStorage + DB sync)
  lib/
    auth.ts            # better-auth server instance
    auth-client.ts     # better-auth client hooks
    crop-rank.ts       # Pure crop search ranking function
    garden-state.ts    # localStorage helpers
    prisma.ts          # Prisma singleton
    recommend.ts       # Greedy affinity algorithm + display helpers
prisma/
  schema.prisma        # Database schema
  seed-common-crops.ts # Seeds commonNames + isCommonCrop for ~70 crops
scripts/
  import/              # Plant data importers
db/
  dump.sh              # Dumps live DB to db/seed.sql
  seed.sql             # Restorable DB snapshot (committed)
tests/                 # Vitest tests
```

## Architecture Notes

**Recommendation algorithm** (`src/lib/recommend.ts`): pure function, no DB calls. Takes crop list + relationship list + bed config, returns bed assignments with overflow and conflict lists. Greedy affinity: builds a weight matrix from companion/avoid relationships, sorts crops by total affinity, assigns each to the bed with the highest current affinity score.

**Garden state** (`src/hooks/use-garden.ts`): localStorage-first. When a session exists, pulls zone+bed config from `/api/garden` on sign-in and pushes changes back with a 500ms debounce. Wishlist (crop IDs) stays localStorage-only (no DB table in current schema).

**Data model**: `UserGarden` (one per user) → `Bed[]` → `Planting[]` → `Crop`. `CropRelationship` stores one record per pair with `cropAId < cropBId` lexicographically. Confidence is a derived float from one or more `RelationshipSource` records.

## Database Seed

The committed `db/seed.sql` is a full pg_dump snapshot of the database including schema, crop data, relationships, and seed data. Restore it with:

```bash
psql "$DATABASE_URL" < db/seed.sql
```

**After any schema migration or seed data change, regenerate the snapshot:**

```bash
# Seed common crop names and isCommonCrop flags
pnpm db:seed-common

# Dump the live DB (requires a running postgres with data)
pnpm db:dump
# or directly: sh db/dump.sh
```

Commit the updated `db/seed.sql` alongside the migration so reviewers and new contributors get a working DB in one step.

## Adding a Data Importer

1. Create `scripts/import/<source>/index.ts` implementing the `Importer` interface
2. Register it in `scripts/import/index.ts`
3. Match crops by `botanicalName` (the canonical key across sources)

## Known Limitations

- PlantBuddies license unresolved — see README note
- Recommendation algorithm is greedy; post-MVP upgrade to simulated annealing
