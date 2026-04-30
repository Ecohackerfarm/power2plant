# Contributing to power2plant

## Development Setup

See the [README](README.md#getting-started) for setup instructions.

## Running Tests

```bash
pnpm test:run
```

All 65 tests must pass before submitting a PR.

## Project Structure

```
src/
  app/
    api/
      auth/[...all]/   # better-auth route handler
      crops/           # Plant search endpoint
      garden/          # User garden GET/PUT
      recommend/       # Bed assignment POST
      zone/            # Geolocation → hardiness zone
    page.tsx           # Main page (anonymous flow)
  components/
    auth-panel.tsx     # Sign in / sign up / signed-in display
    bed-config.tsx     # Bed count + capacity inputs
    plant-search.tsx   # Debounced crop search + wishlist
    recommendation-display.tsx
    zone-detector.tsx  # Geolocation + map picker
  hooks/
    use-garden.ts      # Garden state (localStorage + DB sync)
  lib/
    auth.ts            # better-auth server instance
    auth-client.ts     # better-auth client hooks
    garden-state.ts    # localStorage helpers
    prisma.ts          # Prisma singleton
    recommend.ts       # Greedy affinity algorithm
prisma/
  schema.prisma        # Database schema
scripts/
  import/              # Plant data importers
tests/                 # Vitest tests
```

## Architecture Notes

**Recommendation algorithm** (`src/lib/recommend.ts`): pure function, no DB calls. Takes crop list + relationship list + bed config, returns bed assignments with overflow and conflict lists. Greedy affinity: builds a weight matrix from companion/avoid relationships, sorts crops by total affinity, assigns each to the bed with the highest current affinity score.

**Garden state** (`src/hooks/use-garden.ts`): localStorage-first. When a session exists, pulls zone+bed config from `/api/garden` on sign-in and pushes changes back with a 500ms debounce. Wishlist (crop IDs) stays localStorage-only (no DB table in current schema).

**Data model**: `UserGarden` (one per user) → `Bed[]` → `Planting[]` → `Crop`. `CropRelationship` stores one record per pair with `cropAId < cropBId` lexicographically. Confidence is a derived float from one or more `RelationshipSource` records.

## Adding a Data Importer

1. Create `scripts/import/<source>/index.ts` implementing the `Importer` interface
2. Register it in `scripts/import/index.ts`
3. Match crops by `botanicalName` (the canonical key across sources)

## Known Limitations

- Wishlist crop names disappear on page reload (IDs persist in localStorage but objects aren't re-fetched on mount — post-MVP fix)
- PlantBuddies license unresolved — see README note
- Recommendation algorithm is greedy; post-MVP upgrade to simulated annealing
