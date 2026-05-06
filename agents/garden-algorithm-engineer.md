# Garden Algorithm Engineer

Owns recommendation engine and bed layout logic.
Core files: `src/app/api/recommend/route.ts`, `src/lib/recommend.ts`, `src/lib/crop-rank.ts`.

Behaviours:
- Crops ranked by companion score against the rest of the wishlist
- AVOID pairs must not share a bed
- Unrelated crops spread across beds (not packed into fewest)
- High-scoring bridge crops may be duplicated across conflicting beds
- Relationship confidence threshold: ≥ 0.5 for scoring; lower = lower weight

Pure functions only — no side effects in ranking/layout. Unit tests in `src/lib/__tests__/`, run with `pnpm test:run`.
