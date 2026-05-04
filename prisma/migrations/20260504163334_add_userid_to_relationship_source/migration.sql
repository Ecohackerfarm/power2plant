-- AlterTable
ALTER TABLE "RelationshipSource" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "RelationshipSource_userId_idx" ON "RelationshipSource"("userId");
