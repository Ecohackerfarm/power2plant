# Spec: Secondary-research state across offer surfaces

## Problem

The research pipeline has two decoupled tables:

- **`ResearchRequest`** — user-facing vote/fund list; carries a `funded` boolean.
- **`ResearchQueue`** — the queue the `research-worker` drains (`PENDING → IN_PROGRESS → DONE/FAILED`), unique on `(cropAId, cropBId)`.

The worker runs correctly, but the UI can't reflect reality:

1. **"Researched, no papers found" leaves no durable trace.** `importEntries` (`src/lib/research/executor.ts`) drops findings with `confidence < 0.5` or type `UNKNOWN`, so a barren pair writes **zero `CropRelationship` rows**. Every "offer research" surface decides what to offer purely from relationships, so it keeps inviting research for a pair we already researched.
2. **Views don't reflect completion.** The admin research-queue page fetches once and never refreshes. The user research-requests GET attaches queue status only when `funded === true`, but the credit/admin funding paths never set `funded`.
3. **Single-plant requests are a dead end** — the pair-only worker can't process them, but the UI lists them with no explanation.

## Terminology

- **Secondary research** = reviewing existing published studies (what the AI worker does today).
- **Primary research** = member-run trials on the platform (future feature, out of scope).

## Approach

`ResearchQueue` is the source of truth for "has this pair been researched / is it in flight." It is a small, uniquely-indexed table, so each offer surface loads its relevant rows with one extra `findMany` alongside the relationships it already loads. We do **not** write sentinel/fake relationship rows.

At each offer surface, a bed pair with **no relationship** is split three ways by its queue status:

| Queue status for pair | Bucket | UI |
|---|---|---|
| none / `FAILED` | not-yet-researched | clickable "request research" link (unchanged; FAILED stays retryable) |
| `PENDING` / `IN_PROGRESS` | in progress | muted "secondary research in progress", no link |
| `DONE` | researched, empty | muted "secondary research done — no studies found", no link |

## Changes

- **`src/lib/recommend.ts`** — add optional `researchState: Map<pairKey, 'PENDING'|'IN_PROGRESS'|'DONE'>` to `recommend()`/`recommendAlternatives()`/`runPlacement`; add `researchedNoDataPairs` + `researchInProgressPairs` to `BedResult`; split the no-relationship branch. Export `pairKey`.
- **`src/app/api/recommend/route.ts`** — load `ResearchQueue` for the crop set, build `researchState`, pass it in.
- **`src/app/api/garden/bed-analysis/route.ts`** — same split for `unknownPairs`; return `researchedNoDataPairs` + `researchInProgressPairs`.
- **`src/components/recommendation-display.tsx`** & **`src/components/my-garden.tsx`** — render the two new buckets as muted, link-less rows.
- **`src/app/api/research-requests/route.ts`** — attach queue status for every `cropBId` pair (drop the `funded` gate); also return `hasStudies` (whether a relationship exists).
- **`src/app/[locale]/(app)/research-requests/page.tsx`** — distinguish "Researched" vs "Researched · no studies found"; add single-plant "not yet available" note.
- **`src/app/[locale]/(app)/admin/research-queue/page.tsx`** — poll while any item is `PENDING`/`IN_PROGRESS`.
- **`messages/*.json`** (10 locales) — new keys under `Recommendations`, `MyGarden`, `ResearchRequests`.

`funded` stays a manual admin flag only; no migration.

## Verification

Unit: `recommend` splits a `DONE`-queue no-relationship pair into `researchedNoDataPairs`, `PENDING`/`IN_PROGRESS` into `researchInProgressPairs`, `FAILED`/none into `noDataPairs`.

Manual: fund a barren pair via credits → worker finishes DONE-empty → bed plan and my-garden show "secondary research done — no studies found" (no link); research-requests shows "Researched · no studies found" despite `funded` unset; admin queue auto-updates to DONE; single-plant request shows the not-yet-available note.
