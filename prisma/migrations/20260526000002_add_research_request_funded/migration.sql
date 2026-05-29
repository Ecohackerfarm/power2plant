-- AlterTable
ALTER TABLE "ResearchRequest" ADD COLUMN "funded" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ResearchRequest_funded_idx" ON "ResearchRequest"("funded");
