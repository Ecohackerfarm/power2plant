CREATE TYPE "ResearchAttemptResult" AS ENUM ('NOT_FOUND', 'LOW_CONFIDENCE');

CREATE TABLE "RelationshipResearchAttempt" (
    "id" TEXT NOT NULL,
    "cropAId" TEXT NOT NULL,
    "cropBId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "result" "ResearchAttemptResult" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "notes" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RelationshipResearchAttempt_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RelationshipResearchAttempt" ADD CONSTRAINT "RelationshipResearchAttempt_cropAId_fkey"
    FOREIGN KEY ("cropAId") REFERENCES "Crop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RelationshipResearchAttempt" ADD CONSTRAINT "RelationshipResearchAttempt_cropBId_fkey"
    FOREIGN KEY ("cropBId") REFERENCES "Crop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "RelationshipResearchAttempt_cropAId_cropBId_model_key"
    ON "RelationshipResearchAttempt"("cropAId", "cropBId", "model");

CREATE INDEX "RelationshipResearchAttempt_cropAId_cropBId_idx"
    ON "RelationshipResearchAttempt"("cropAId", "cropBId");
