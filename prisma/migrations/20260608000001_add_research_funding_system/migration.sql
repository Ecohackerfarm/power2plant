-- CreateEnum
CREATE TYPE "CreditTransactionType" AS ENUM ('TOP_UP', 'SPEND', 'REFUND');

-- CreateEnum
CREATE TYPE "ResearchQueueStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "ResearchTrigger" AS ENUM ('PERSONAL', 'POT', 'ADMIN');

-- CreateEnum
CREATE TYPE "FundingSource" AS ENUM ('PERSONAL', 'POT');

-- CreateEnum
CREATE TYPE "PotTransactionType" AS ENUM ('DONATION', 'SPEND');

-- CreateEnum
CREATE TYPE "BadgeType" AS ENUM ('INCREMENTAL', 'PLANT', 'PAIR');

-- CreateEnum
CREATE TYPE "FeedbackVoteType" AS ENUM ('AGREE', 'DISAGREE');

-- CreateTable
CREATE TABLE "UserCredit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CreditTransactionType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT,
    "researchQueueId" TEXT,
    "stripePaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchQueue" (
    "id" TEXT NOT NULL,
    "cropAId" TEXT NOT NULL,
    "cropBId" TEXT NOT NULL,
    "status" "ResearchQueueStatus" NOT NULL DEFAULT 'PENDING',
    "triggeredBy" "ResearchTrigger" NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ResearchQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchLog" (
    "id" TEXT NOT NULL,
    "researchQueueId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "costUsd" DECIMAL(10,6) NOT NULL,
    "requestJson" JSONB NOT NULL,
    "responseJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchPrice" (
    "id" TEXT NOT NULL,
    "pricePerResearchCents" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "ResearchPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PotTransaction" (
    "id" TEXT NOT NULL,
    "type" "PotTransactionType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "kofiTransactionId" TEXT,
    "researchQueueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PotTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchFunder" (
    "id" TEXT NOT NULL,
    "researchQueueId" TEXT NOT NULL,
    "userId" TEXT,
    "source" "FundingSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchFunder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "BadgeType" NOT NULL,
    "slug" TEXT NOT NULL,
    "tier" INTEGER,
    "cropId" TEXT,
    "cropAId" TEXT,
    "cropBId" TEXT,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackVote" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vote" "FeedbackVoteType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackComment" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCredit_userId_key" ON "UserCredit"("userId");

-- CreateIndex
CREATE INDEX "CreditTransaction_userId_idx" ON "CreditTransaction"("userId");

-- CreateIndex
CREATE INDEX "CreditTransaction_researchQueueId_idx" ON "CreditTransaction"("researchQueueId");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchQueue_cropAId_cropBId_key" ON "ResearchQueue"("cropAId", "cropBId");

-- CreateIndex
CREATE INDEX "ResearchQueue_status_createdAt_idx" ON "ResearchQueue"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchLog_researchQueueId_key" ON "ResearchLog"("researchQueueId");

-- CreateIndex
CREATE INDEX "ResearchPrice_effectiveFrom_idx" ON "ResearchPrice"("effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PotTransaction_kofiTransactionId_key" ON "PotTransaction"("kofiTransactionId");

-- CreateIndex
CREATE INDEX "PotTransaction_type_idx" ON "PotTransaction"("type");

-- CreateIndex
CREATE INDEX "PotTransaction_createdAt_idx" ON "PotTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "ResearchFunder_researchQueueId_idx" ON "ResearchFunder"("researchQueueId");

-- CreateIndex
CREATE INDEX "ResearchFunder_userId_idx" ON "ResearchFunder"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBadge_userId_slug_key" ON "UserBadge"("userId", "slug");

-- CreateIndex
CREATE INDEX "UserBadge_userId_type_idx" ON "UserBadge"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackVote_feedbackId_userId_key" ON "FeedbackVote"("feedbackId", "userId");

-- CreateIndex
CREATE INDEX "FeedbackVote_feedbackId_idx" ON "FeedbackVote"("feedbackId");

-- CreateIndex
CREATE INDEX "FeedbackComment_feedbackId_idx" ON "FeedbackComment"("feedbackId");

-- CreateIndex
CREATE INDEX "FeedbackComment_parentId_idx" ON "FeedbackComment"("parentId");

-- Seed initial research price: 100 cents (€1.00), placeholder until token-cost calculation is live
INSERT INTO "ResearchPrice" ("id", "pricePerResearchCents", "effectiveFrom", "notes")
VALUES ('initial', 100, NOW(), 'Initial placeholder price; update via admin once avg token cost is tracked');

-- AddForeignKey
ALTER TABLE "UserCredit" ADD CONSTRAINT "UserCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_researchQueueId_fkey" FOREIGN KEY ("researchQueueId") REFERENCES "ResearchQueue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchQueue" ADD CONSTRAINT "ResearchQueue_cropAId_fkey" FOREIGN KEY ("cropAId") REFERENCES "Crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchQueue" ADD CONSTRAINT "ResearchQueue_cropBId_fkey" FOREIGN KEY ("cropBId") REFERENCES "Crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchLog" ADD CONSTRAINT "ResearchLog_researchQueueId_fkey" FOREIGN KEY ("researchQueueId") REFERENCES "ResearchQueue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PotTransaction" ADD CONSTRAINT "PotTransaction_researchQueueId_fkey" FOREIGN KEY ("researchQueueId") REFERENCES "ResearchQueue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFunder" ADD CONSTRAINT "ResearchFunder_researchQueueId_fkey" FOREIGN KEY ("researchQueueId") REFERENCES "ResearchQueue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFunder" ADD CONSTRAINT "ResearchFunder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_cropAId_fkey" FOREIGN KEY ("cropAId") REFERENCES "Crop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_cropBId_fkey" FOREIGN KEY ("cropBId") REFERENCES "Crop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackVote" ADD CONSTRAINT "FeedbackVote_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackVote" ADD CONSTRAINT "FeedbackVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackComment" ADD CONSTRAINT "FeedbackComment_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackComment" ADD CONSTRAINT "FeedbackComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackComment" ADD CONSTRAINT "FeedbackComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FeedbackComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
