-- Phase 2 of 3: relationship-claim remodel — BACKFILL (pure DML, idempotent).
-- Synthesizes one claim (RelationshipReason) per source, carrying the polarity +
-- direction moved off the source, then recomputes CropRelationship aggregates.
-- Re-runnable: claim insert is NOT EXISTS-guarded; aggregate recomputes are
-- full (not incremental). No data is dropped here.

-- 0. Drop the polymorphic XOR constraint — a claim now belongs to BOTH a source
--    and a relationship (the synthesized claims set both FKs).
ALTER TABLE "RelationshipReason" DROP CONSTRAINT IF EXISTS "RelationshipReason_exactly_one_parent";

-- 1. Remap any legacy CropRelationship.type to polarity (data has none; defensive
--    for prod, where the submit allowlist still permits the 4 doomed values).
UPDATE "CropRelationship" SET "type" = 'COMPANION'
  WHERE "type" IN ('ATTRACTS', 'REPELS', 'NURSE', 'TRAP_CROP');

-- 2. Synthesize one claim per source. mechanism is derived from the legacy
--    position where it was mechanism-flavored, else OTHER. Polarity inherits the
--    parent relationship when the source had no position; direction likewise.
INSERT INTO "RelationshipReason"
  ("id", "type", "explanation", "relationshipType", "direction", "cropRelationshipId", "sourceId")
SELECT
  gen_random_uuid()::text,
  CASE s."position"
    WHEN 'ATTRACTS'  THEN 'POLLINATION'::"RelationshipReasonType"
    WHEN 'REPELS'    THEN 'PEST_CONTROL'::"RelationshipReasonType"
    WHEN 'NURSE'     THEN 'NURSE'::"RelationshipReasonType"
    WHEN 'TRAP_CROP' THEN 'TRAP_CROP'::"RelationshipReasonType"
    ELSE 'OTHER'::"RelationshipReasonType"
  END,
  COALESCE(s."notes", ''),
  CASE COALESCE(s."position", r."type")
    WHEN 'ATTRACTS'  THEN 'COMPANION'::"RelationshipType"
    WHEN 'REPELS'    THEN 'COMPANION'::"RelationshipType"
    WHEN 'NURSE'     THEN 'COMPANION'::"RelationshipType"
    WHEN 'TRAP_CROP' THEN 'COMPANION'::"RelationshipType"
    ELSE COALESCE(s."position", r."type")
  END,
  COALESCE(s."sourceDirection", r."direction", 'UNKNOWN'::"Direction"),
  s."relationshipId",
  s."id"
FROM "RelationshipSource" s
JOIN "CropRelationship" r ON r."id" = s."relationshipId"
WHERE NOT EXISTS (
  SELECT 1 FROM "RelationshipReason" rr
  WHERE rr."sourceId" = s."id" AND rr."relationshipType" IS NOT NULL
);

-- 3. Recompute CropRelationship.mechanisms = distinct set of non-rejected claims'
--    mechanism. Reset first so the recompute is fully idempotent.
UPDATE "CropRelationship" SET "mechanisms" = ARRAY[]::"RelationshipReasonType"[];
UPDATE "CropRelationship" cr SET "mechanisms" = sub.mechs
FROM (
  SELECT "cropRelationshipId" AS rid, array_agg(DISTINCT "type") AS mechs
  FROM "RelationshipReason"
  WHERE "cropRelationshipId" IS NOT NULL AND "rejectedAt" IS NULL
  GROUP BY "cropRelationshipId"
) sub
WHERE cr."id" = sub.rid;

-- 4. Recompute conflict = relationship has both a COMPANION and an AVOID claim
--    (opposing polarities present). Full boolean recompute => idempotent.
UPDATE "CropRelationship" cr SET "conflict" = (
  EXISTS (
    SELECT 1 FROM "RelationshipReason" rr
    WHERE rr."cropRelationshipId" = cr."id"
      AND rr."relationshipType" = 'COMPANION' AND rr."rejectedAt" IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM "RelationshipReason" rr
    WHERE rr."cropRelationshipId" = cr."id"
      AND rr."relationshipType" = 'AVOID' AND rr."rejectedAt" IS NULL
  )
);

-- NOTE: confidence and direction are left as-is (already populated). The app-level
-- recompute (review submission path) becomes the source of truth going forward.
