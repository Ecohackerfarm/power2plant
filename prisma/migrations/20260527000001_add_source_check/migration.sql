-- CreateTable
CREATE TABLE "SourceCheck" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "checkedBy" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correct" BOOLEAN NOT NULL,
    "notes" TEXT,

    CONSTRAINT "SourceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceCheck_sourceId_idx" ON "SourceCheck"("sourceId");

-- AddForeignKey
ALTER TABLE "SourceCheck" ADD CONSTRAINT "SourceCheck_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RelationshipSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
