-- CreateEnum
CREATE TYPE "FeedbackMode" AS ENUM ('DATA', 'OTHER');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "mode" "FeedbackMode" NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "targetKey" TEXT,
    "screenshot" TEXT,
    "annotation" JSONB,
    "message" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedNote" TEXT,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Feedback_ipHash_createdAt_idx" ON "Feedback"("ipHash", "createdAt");

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "feedbackDigestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "feedbackDigestFreq" TEXT NOT NULL DEFAULT 'daily',
    "feedbackDigestEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);

-- Seed singleton row
INSERT INTO "AppConfig" ("id") VALUES ('singleton') ON CONFLICT DO NOTHING;
