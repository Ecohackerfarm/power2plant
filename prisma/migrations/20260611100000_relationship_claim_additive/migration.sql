-- Phase 1 of 3: relationship-claim remodel — ADDITIVE ONLY.
-- No drops, no renames. New enums/values + nullable/defaulted columns so the
-- backfill (phase 2) and cleanup (phase 3) can follow without data loss.

-- CreateEnum
CREATE TYPE "RejectReason" AS ENUM ('SOURCE_NOT_FOUND', 'OFF_TOPIC', 'NOT_PEER_REVIEWED', 'DUPLICATE', 'INACCESSIBLE', 'CLAIM_UNSUPPORTED', 'WRONG_TYPE', 'WRONG_DIRECTION', 'CONTRADICTS');

-- AlterEnum: mechanism gains NURSE + TRAP_CROP (absorbed from RelationshipType in phase 3)
ALTER TYPE "RelationshipReasonType" ADD VALUE 'NURSE';
ALTER TYPE "RelationshipReasonType" ADD VALUE 'TRAP_CROP';

-- AlterEnum: aggregate-only polarity for conflicting/thin evidence
ALTER TYPE "RelationshipType" ADD VALUE 'UNCERTAIN';

-- AlterTable: CropRelationship aggregates
ALTER TABLE "CropRelationship" ADD COLUMN     "conflict" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "mechanisms" "RelationshipReasonType"[] DEFAULT ARRAY[]::"RelationshipReasonType"[];

-- AlterTable: claim (RelationshipReason) gains polarity/direction moved off the source
ALTER TABLE "RelationshipReason" ADD COLUMN     "direction" "Direction",
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "relationshipType" "RelationshipType";

-- AlterTable: source soft-reject marker
ALTER TABLE "RelationshipSource" ADD COLUMN     "rejectedAt" TIMESTAMP(3);

-- AlterTable: review check can target a source XOR a claim, carries a reason
ALTER TABLE "SourceCheck" ADD COLUMN     "claimId" TEXT,
ADD COLUMN     "reason" "RejectReason",
ALTER COLUMN "sourceId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "SourceCheck_claimId_idx" ON "SourceCheck"("claimId");

-- AddForeignKey
ALTER TABLE "SourceCheck" ADD CONSTRAINT "SourceCheck_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "RelationshipReason"("id") ON DELETE CASCADE ON UPDATE CASCADE;
