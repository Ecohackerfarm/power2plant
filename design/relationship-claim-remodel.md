# Relationship model remodel + research review system

Branch: `feat/relationship-claim-remodel` (base: `release/v0.18.0`)

## Motivation

Two coupled problems surfaced during the v0.18.0 security review of the
distributed research queue:

1. **Trust gap.** Trusted researchers auto-import `CropRelationship` data that
   goes live on public companion pages *before* any review. The REVIEW task is
   a post-hoc ticket with no teeth: no approve/reject path is implemented, and
   `ReviewCheck`/`reviewNote`/`reviewedAt` fields exist but are never written.
2. **Model gap.** `RelationshipSource.position` (type) and `.sourceDirection`
   are stored per *source*, but they are properties of the *mechanism*, not the
   provenance. One source can describe several mechanisms with different
   type/direction; the current schema can't represent that.

## Target model

Mechanism-level claim, backed by one source, aggregated up to the relationship.

```
CropRelationship 1───* RelationshipClaim *───1 RelationshipSource
RelationshipSource 1───* ReviewCheck
RelationshipClaim  1───* ReviewCheck   (ReviewCheck targets source XOR claim)
```

### Two orthogonal axes
- **Polarity / type** — COMPANION | AVOID | NEUTRAL (+ UNCERTAIN as aggregate only).
- **Direction** — who acts on whom: MUTUAL | ONE_WAY | UNKNOWN.

### Aggregates on `CropRelationship` (recomputed on any claim/source change)
- `type` — confidence-weighted vote of claim polarities; thin/no winner → `UNCERTAIN`.
- `direction` — A→B and B→A both present → `MUTUAL`; one side only → `ONE_WAY`.
- `confidence` — from surviving (non-rejected) sources' `ConfidenceLevel`
  (`computeRelationshipConfidence`, currently `executor.ts:225`).
- `conflict: Boolean` — true when opposing polarities coexist (AVOID mixed with
  COMPANION). `conflict` = data fights; `UNCERTAIN` = data thin. Keep both.
- `mechanisms: RelationshipReasonType[]` — distinct set from non-rejected claims;
  GIN index for fast "all PEST_CONTROL pairs" queries.
- `deletedAt: DateTime?` — soft delete.

### Cascade after a review verdict (recompute, then)
- 0 source rows left → **HARD delete** relationship.
- Rows remain but every source/claim rejected (none valid) → **SOFT delete**
  (`deletedAt`; public reads filter it out).
- Else: keep, aggregates adjusted.

## Schema changes

### Renames
- `RelationshipReason` → `RelationshipClaim`
- `SourceCheck` → `ReviewCheck`

### `RelationshipClaim` (was RelationshipReason)
- `type` → `mechanism` (RelationshipReasonType)
- + `relationshipType: RelationshipType` (polarity; never UNCERTAIN — code-validated)
- + `direction: Direction @default(UNKNOWN)`
- + `rejectedAt: DateTime?` (claim-level invalidation)
- require `sourceId` AND `relationshipId` (drop polymorphic xor; denormalize rel link)

### `RelationshipSource`
- DROP `position`, `sourceDirection` (moved to claim)
- + `rejectedAt: DateTime?`
- RECONCILE the stray `reason` column (seed has it; schema does not — see Open #1)

### `ReviewCheck` (was SourceCheck)
- + `reason: RejectReason?` (null when `correct=true`)
- + `claimId: String?`; make `sourceId` nullable (targets source XOR claim)

### `CropRelationship`
- + `conflict: Boolean @default(false)`
- + `mechanisms: RelationshipReasonType[]` (GIN index)
- + `deletedAt: DateTime?`
- `type` default → `UNCERTAIN`; `direction` default → `UNKNOWN`

### Enums
- `RelationshipType` → polarity-only: `COMPANION, AVOID, NEUTRAL, UNCERTAIN`.
  REMOVE `ATTRACTS, REPELS, NURSE, TRAP_CROP`.
- `RelationshipReasonType` += `NURSE, TRAP_CROP` (absorb the removed type values).
- New `RejectReason`:
  - source-level: `SOURCE_NOT_FOUND, OFF_TOPIC, NOT_PEER_REVIEWED, DUPLICATE, INACCESSIBLE`
  - claim-level: `CLAIM_UNSUPPORTED, WRONG_TYPE, WRONG_DIRECTION, CONTRADICTS`

### Type remap (old RelationshipType → new)
- `COMPANION → COMPANION`
- `AVOID → AVOID`
- `NEUTRAL → NEUTRAL`
- `ATTRACTS → COMPANION` (mechanism POLLINATION/PEST_CONTROL)
- `REPELS → AVOID`? — **NO**: REPELS pests is *beneficial* → `COMPANION` + mechanism PEST_CONTROL. **Decide (Open #2).**
- `NURSE → COMPANION` + mechanism NURSE
- `TRAP_CROP → COMPANION` + mechanism TRAP_CROP

## Review verdict → action map

### Source-level reasons
| Reason | Action |
|---|---|
| `SOURCE_NOT_FOUND` | delete source row (+ its claims) |
| `OFF_TOPIC` | delete source row (+ its claims) |
| `DUPLICATE` | delete source row (+ its claims) |
| `NOT_PEER_REVIEWED` | downgrade source `ConfidenceLevel` to `min(current, OBSERVED)` |
| `INACCESSIBLE` | keep, flag unverified; do NOT delete |

### Claim-level reasons
| Reason | Action |
|---|---|
| `CLAIM_UNSUPPORTED` | `rejectedAt` on the claim (excluded from aggregates) |
| `WRONG_TYPE` | correct `claim.relationshipType` → recompute (may trip `conflict`) |
| `WRONG_DIRECTION` | correct `claim.direction` → recompute |
| `CONTRADICTS` | = WRONG_TYPE (set opposing polarity) → recompute |

Every verdict: write a `ReviewCheck` row (audit), then run the relationship
cascade (recompute aggregates → hard/soft delete checks).

## Behavioural changes (non-schema)

1. **Source guard** — auto-import requires ≥1 valid source (url or notes);
   else 422 / skip import. Closes the sourceless-relationship hole.
2. **Four-eyes** — claim route rejects claiming a REVIEW task whose parent task
   was submitted by the claimer (`parent.claimedById === user.id` → 403).
3. **Review submission** — branch submit route on `task.type === 'REVIEW'`;
   accept per-source/per-claim verdicts, write `ReviewCheck`, run cascade,
   set task `REVIEWED`/`REJECTED` + `reviewNote`/`reviewedAt`.
4. **Aggregate computation** — replace "submit sets `CropRelationship.type`
   directly" with recompute from claims (type vote, direction, confidence,
   conflict, mechanisms).

## Migration sequence (3 steps — additive → backfill → cleanup)

Data today: 420 CropRelationship, 470 RelationshipSource, 0 RelationshipReason,
0 SourceCheck. Claims do not exist yet → synthesize from source columns.

### #1 Additive (no drops, all nullable/defaulted)
- add enums/values: `UNCERTAIN`, mechanism `NURSE`/`TRAP_CROP`, `RejectReason`
- add columns: CR `conflict`/`mechanisms`/`deletedAt`; claim `relationshipType`/
  `direction`/`rejectedAt`; ReviewCheck `reason`/`claimId`; source `rejectedAt`
- (renames can be done here or in #3; Prisma rename = create+drop, so plan
  carefully — may keep old names until #3)

### #2 Backfill (pure DML, idempotent)
- one `RelationshipClaim` per source: `relationshipType = remap(position)`,
  `direction = sourceDirection ?? UNKNOWN`, `mechanism = OTHER`,
  `explanation = coalesce(notes,'')`, link source + relationship
- remap `CropRelationship.type` (420 rows) old→polarity
- recompute aggregates (`mechanisms`, `conflict`, `confidence`, `direction`)
- fallback for sources with NULL `position`

### #3 Cleanup (after #2 verified)
- drop `RelationshipSource.position`, `.sourceDirection` (+ stray `reason`)
- enum-value removal: new `RelationshipType` enum, `ALTER … USING` CASE remap,
  drop old, rename (Postgres can't drop in-use enum values — raw SQL)
- enforce NOT NULL on claim `relationshipType`/`sourceId`/`relationshipId`
- model renames if deferred from #1

**Ordering is load-bearing**: synthesize claims from `position`/`sourceDirection`
BEFORE dropping them; remap data BEFORE removing old enum values.

### seed + CI
- after migrations run on a dev DB, regenerate `db/seed.sql` (`pnpm db:dump`)
  and commit — `ci-db.yml` errors on release branches if seed lacks a migration
- `ci-db.yml` replays migrations on the last release tag's seed → backfill SQL
  must apply cleanly to the old-shape 420/470 rows (this is the test)

### prod
- larger diverged data; same migrations via `prisma migrate deploy`
- backfill must be correct for the full real distribution of `position` values
  (every value being removed from the enum) and re-runnable/guarded

## Open questions (investigate before writing migration #1)
1. ~~**Stray `RelationshipSource.reason` column**~~ **RESOLVED — no action.**
   Was a per-source mechanism enum added by #202
   (`20260527000002_…reason_direction`), **already dropped** by #277
   (`20260611000001_distributed_research_tasks`, drops it from both
   RelationshipSource and CropRelationship). Current schema has no such column;
   sample data was all NULL (never populated). The seed.sql header still showing
   it = **seed.sql is stale** (missing migrations #277/#278/etc — not recorded in
   its `_prisma_migrations`). That staleness is a pre-existing condition (CI only
   hard-errors on `head_ref == release/*`; merges came from `feat/*` heads). Our
   eventual `pnpm db:dump` regenerates a clean seed for free. Nothing to migrate.
2. ~~**`REPELS` remap**~~ **RESOLVED — moot for seed.** Data distribution:
   CR.type = {COMPANION 337, AVOID 82, NEUTRAL 1}; RS.position = {NULL 358,
   COMPANION 106, NEUTRAL 3, AVOID 3}. No ATTRACTS/REPELS/NURSE/TRAP_CROP in
   data. CASE remap still ships defensively (submit allowlist currently permits
   all 7 → prod *could* have them): REPELS/ATTRACTS/NURSE/TRAP_CROP → COMPANION,
   nuance carried by mechanism (backfills to OTHER).
3. ~~**NULL `position` fallback**~~ **RESOLVED — inherit from parent relationship.**
   358/470 sources have NULL position, but each belongs to a relationship with a
   polarity. Synthesize the claim from the parent, not a blind NEUTRAL:
   ```
   claim.relationshipType = source.position        ?? parentRelationship.type
   claim.direction        = source.sourceDirection ?? parentRelationship.direction ?? UNKNOWN
   claim.mechanism        = OTHER
   claim.explanation      = coalesce(source.notes, '')
   ```
   (RS.sourceDirection = {NULL 363, ONE_WAY 61, MUTUAL 46}.)

## Out of scope (later)
- Per-mechanism confidence on CR (keep single aggregate for now)
- UI: unreviewed/conflict badges on companion pages

## Decision log
- Close security finding #4 (auto-import trust gap) **via this remodel**, not an
  interim minimal fix.

## Execution note
- Bare worktree has no `node_modules` / `DATABASE_URL`. Generate + validate
  migrations in the dev container (`ssh app-dev`; DB `:5432`, staging `:3002`),
  not here. Enum-value removal needs hand-authored raw SQL regardless (Prisma
  can't drop in-use enum values).

## Status
- [x] Design agreed
- [x] Investigate Open #1 (stray `reason` column) — RESOLVED (already dropped by #277)
- [x] Resolve Open #2 (REPELS remap), #3 (NULL position fallback) — RESOLVED via data
- [x] Migration #1 additive — `20260611100000_relationship_claim_additive`,
      applied + verified on dev DB, committed `1844d59`
- [x] Migration #2 backfill — `20260611100001_relationship_claim_backfill`,
      applied + verified + idempotent on dev DB, committed `9a2a692`
      (470→470 claims, conflict=2, 0 empty mechanisms). Also dropped the
      polymorphic XOR check constraint on RelationshipReason.
- [x] Migration #3 cleanup — `20260611100002_relationship_claim_cleanup`,
      applied + verified on dev DB, committed `c02ffa9`. Renames done (clean DB
      names), legacy columns dropped, enum reduced to polarity, data intact
      (470/420/470). migrate diff clean.
- [ ] Behavioural changes (guard, four-eyes, review submission, aggregation) ← NEXT
      NOTE: app code references old model names / dropped enum values → will not
      compile until ported. Touch points: src/lib/research/executor.ts,
      src/lib/research/helpers.ts, src/app/api/research/tasks/[id]/submit/route.ts,
      src/app/api/research/tasks/[id]/claim/route.ts, any reads of
      relationshipReason/sourceCheck/position/sourceDirection.
- [ ] Regenerate seed.sql (pnpm db:dump), verify ci-db replay
