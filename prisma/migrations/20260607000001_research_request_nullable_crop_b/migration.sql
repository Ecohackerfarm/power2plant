-- Make cropBId nullable to support single-plant research requests
ALTER TABLE "ResearchRequest" ALTER COLUMN "cropBId" DROP NOT NULL;

-- Drop the old non-partial unique index
DROP INDEX IF EXISTS "ResearchRequest_cropAId_cropBId_key";

-- Unique index for pair requests (both IDs present)
CREATE UNIQUE INDEX IF NOT EXISTS "ResearchRequest_pair_key"
  ON "ResearchRequest"("cropAId", "cropBId")
  WHERE "cropBId" IS NOT NULL;

-- Unique index for single-plant requests (no cropB)
CREATE UNIQUE INDEX IF NOT EXISTS "ResearchRequest_single_key"
  ON "ResearchRequest"("cropAId")
  WHERE "cropBId" IS NULL;
