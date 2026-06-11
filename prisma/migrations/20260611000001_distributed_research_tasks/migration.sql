-- CreateEnum
CREATE TYPE "RelationshipReasonType" AS ENUM ('PEST_CONTROL', 'POLLINATION', 'NUTRIENT', 'SHADE', 'ALLELOPATHY', 'OTHER');

-- CreateEnum
CREATE TYPE "ExternalResearchTaskStatus" AS ENUM ('OPEN', 'CLAIMED', 'SUBMITTED', 'REVIEW_PENDING', 'REVIEW_CLAIMED', 'REVIEWED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExternalResearchTaskType" AS ENUM ('RESEARCH', 'REVIEW');

-- DropForeignKey
ALTER TABLE "CropEnrichmentAttempt" DROP CONSTRAINT "CropEnrichmentAttempt_cropId_fkey";

-- AlterTable
ALTER TABLE "CropEnrichmentAttempt" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "attemptedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CropTranslation" ALTER COLUMN "commonNames" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RelationshipSource" DROP COLUMN "reason",
ADD COLUMN     "agentModel" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "trustedResearcher" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: RelationshipReason (replaces scalar reason column on CropRelationship)
CREATE TABLE "RelationshipReason" (
    "id" TEXT NOT NULL,
    "type" "RelationshipReasonType" NOT NULL,
    "explanation" TEXT NOT NULL,
    "cropRelationshipId" TEXT,
    "sourceId" TEXT,

    CONSTRAINT "RelationshipReason_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RelationshipReason_exactly_one_parent" CHECK (
        ("cropRelationshipId" IS NOT NULL AND "sourceId" IS NULL) OR
        ("cropRelationshipId" IS NULL AND "sourceId" IS NOT NULL)
    )
);

-- Backfill: migrate existing CropRelationship.reason scalar → RelationshipReason rows
INSERT INTO "RelationshipReason" ("id", "type", "explanation", "cropRelationshipId")
SELECT
    gen_random_uuid()::text,
    cr.reason,
    COALESCE(cr.notes, cr.reason::text),
    cr.id
FROM "CropRelationship" cr
WHERE cr.reason IS NOT NULL;

-- AlterTable: drop old scalar reason column from CropRelationship
ALTER TABLE "CropRelationship" DROP COLUMN "reason",
DROP COLUMN "reasons";

-- DropEnum (old scalar)
DROP TYPE "RelationshipReason";

-- CreateTable: ExternalResearchTask
CREATE TABLE "ExternalResearchTask" (
    "id" TEXT NOT NULL,
    "type" "ExternalResearchTaskType" NOT NULL DEFAULT 'RESEARCH',
    "cropAId" TEXT,
    "cropBId" TEXT,
    "prompt" TEXT NOT NULL,
    "context" JSONB,
    "deadline" TIMESTAMP(3),
    "status" "ExternalResearchTaskStatus" NOT NULL DEFAULT 'OPEN',
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),
    "result" JSONB,
    "submittedAt" TIMESTAMP(3),
    "agentModel" TEXT,
    "importedRelationshipId" TEXT,
    "reviewTaskId" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalResearchTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ResearchModel (allowed model registry)
CREATE TABLE "ResearchModel" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "ResearchModel_pkey" PRIMARY KEY ("id")
);

-- Seed: allowed research models with capability scores
INSERT INTO "ResearchModel" ("id", "label", "score", "allowed", "notes") VALUES
    ('perplexity/sonar-deep-research', 'Perplexity Sonar Deep Research', 95, true, 'Purpose-built multi-step deep research'),
    ('openai/o3',                      'OpenAI o3',                      87, true, 'Top reasoning; configure with web search tool'),
    ('google/gemini-2.5-pro',          'Gemini 2.5 Pro',                 83, true, 'Strong grounding + long context'),
    ('anthropic/claude-opus-4-8',      'Claude Opus 4.8',                80, true, 'Excellent reasoning; configure with web search tool'),
    ('openai/gpt-4o',                  'GPT-4o',                         76, true, 'Solid browsing; good synthesis'),
    ('anthropic/claude-sonnet-4-6',    'Claude Sonnet 4.6',              58, true, 'Capable; weaker citation depth'),
    ('google/gemini-2.5-flash',        'Gemini 2.5 Flash',               55, true, 'Lighter; acceptable for simple pairs');

-- CreateTable: UserApiToken
CREATE TABLE "UserApiToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "UserApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RelationshipReason_cropRelationshipId_idx" ON "RelationshipReason"("cropRelationshipId");

-- CreateIndex
CREATE INDEX "RelationshipReason_sourceId_idx" ON "RelationshipReason"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalResearchTask_reviewTaskId_key" ON "ExternalResearchTask"("reviewTaskId");

-- CreateIndex
CREATE INDEX "ExternalResearchTask_status_type_createdAt_idx" ON "ExternalResearchTask"("status", "type", "createdAt");

-- CreateIndex
CREATE INDEX "ExternalResearchTask_claimedById_idx" ON "ExternalResearchTask"("claimedById");

-- CreateIndex
CREATE INDEX "ExternalResearchTask_importedRelationshipId_idx" ON "ExternalResearchTask"("importedRelationshipId");

-- CreateIndex
CREATE UNIQUE INDEX "UserApiToken_token_key" ON "UserApiToken"("token");

-- CreateIndex
CREATE INDEX "UserApiToken_userId_idx" ON "UserApiToken"("userId");

-- CreateIndex (restore partial index lost in drift)
CREATE INDEX IF NOT EXISTS "ResearchRequest_cropAId_cropBId_idx" ON "ResearchRequest"("cropAId", "cropBId");

-- AddForeignKey
ALTER TABLE "CropEnrichmentAttempt" ADD CONSTRAINT "CropEnrichmentAttempt_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipReason" ADD CONSTRAINT "RelationshipReason_cropRelationshipId_fkey" FOREIGN KEY ("cropRelationshipId") REFERENCES "CropRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipReason" ADD CONSTRAINT "RelationshipReason_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RelationshipSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalResearchTask" ADD CONSTRAINT "ExternalResearchTask_cropAId_fkey" FOREIGN KEY ("cropAId") REFERENCES "Crop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalResearchTask" ADD CONSTRAINT "ExternalResearchTask_cropBId_fkey" FOREIGN KEY ("cropBId") REFERENCES "Crop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalResearchTask" ADD CONSTRAINT "ExternalResearchTask_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalResearchTask" ADD CONSTRAINT "ExternalResearchTask_importedRelationshipId_fkey" FOREIGN KEY ("importedRelationshipId") REFERENCES "CropRelationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalResearchTask" ADD CONSTRAINT "ExternalResearchTask_reviewTaskId_fkey" FOREIGN KEY ("reviewTaskId") REFERENCES "ExternalResearchTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApiToken" ADD CONSTRAINT "UserApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
