-- Phase 3 of 3: relationship-claim remodel — CLEANUP (DESTRUCTIVE).
-- Renames to clean DB names, drops legacy source columns, removes the 4 doomed
-- RelationshipType values, enforces NOT NULL. Run only after phase 2 backfill.
-- A snapshot of the 4 affected tables was taken before applying.

-- A. Rename tables to final names
ALTER TABLE "RelationshipReason" RENAME TO "RelationshipClaim";
ALTER TABLE "SourceCheck" RENAME TO "ReviewCheck";

-- B. Rename columns to final names
ALTER TABLE "RelationshipClaim" RENAME COLUMN "type" TO "mechanism";
ALTER TABLE "RelationshipClaim" RENAME COLUMN "cropRelationshipId" TO "relationshipId";

-- C. Rename constraints + indexes to match the new table names
ALTER TABLE "RelationshipClaim" RENAME CONSTRAINT "RelationshipReason_pkey" TO "RelationshipClaim_pkey";
ALTER TABLE "RelationshipClaim" RENAME CONSTRAINT "RelationshipReason_cropRelationshipId_fkey" TO "RelationshipClaim_relationshipId_fkey";
ALTER TABLE "RelationshipClaim" RENAME CONSTRAINT "RelationshipReason_sourceId_fkey" TO "RelationshipClaim_sourceId_fkey";
ALTER INDEX "RelationshipReason_cropRelationshipId_idx" RENAME TO "RelationshipClaim_relationshipId_idx";
ALTER INDEX "RelationshipReason_sourceId_idx" RENAME TO "RelationshipClaim_sourceId_idx";

ALTER TABLE "ReviewCheck" RENAME CONSTRAINT "SourceCheck_pkey" TO "ReviewCheck_pkey";
ALTER TABLE "ReviewCheck" RENAME CONSTRAINT "SourceCheck_sourceId_fkey" TO "ReviewCheck_sourceId_fkey";
ALTER TABLE "ReviewCheck" RENAME CONSTRAINT "SourceCheck_claimId_fkey" TO "ReviewCheck_claimId_fkey";
ALTER INDEX "SourceCheck_sourceId_idx" RENAME TO "ReviewCheck_sourceId_idx";
ALTER INDEX "SourceCheck_claimId_idx" RENAME TO "ReviewCheck_claimId_idx";

-- D. Enforce NOT NULL now that phase 2 populated these (every claim has a
--    source, a relationship, a polarity and a direction).
ALTER TABLE "RelationshipClaim"
  ALTER COLUMN "relationshipType" SET NOT NULL,
  ALTER COLUMN "direction" SET NOT NULL,
  ALTER COLUMN "direction" SET DEFAULT 'UNKNOWN',
  ALTER COLUMN "sourceId" SET NOT NULL,
  ALTER COLUMN "relationshipId" SET NOT NULL;

-- E. Drop legacy source columns (moved onto the claim in phase 2)
ALTER TABLE "RelationshipSource" DROP COLUMN "position";
ALTER TABLE "RelationshipSource" DROP COLUMN "sourceDirection";

-- F. RelationshipType -> polarity only. Postgres can't drop in-use enum values,
--    so swap to a new type. (Runs after E so RelationshipSource.position is gone.)
CREATE TYPE "RelationshipType_new" AS ENUM ('COMPANION', 'AVOID', 'NEUTRAL', 'UNCERTAIN');
ALTER TABLE "CropRelationship" ALTER COLUMN "type" TYPE "RelationshipType_new" USING ("type"::text::"RelationshipType_new");
ALTER TABLE "RelationshipClaim" ALTER COLUMN "relationshipType" TYPE "RelationshipType_new" USING ("relationshipType"::text::"RelationshipType_new");
DROP TYPE "RelationshipType";
ALTER TYPE "RelationshipType_new" RENAME TO "RelationshipType";
