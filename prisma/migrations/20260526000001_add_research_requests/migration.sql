-- CreateTable
CREATE TABLE "ResearchRequest" (
    "id" TEXT NOT NULL,
    "cropAId" TEXT NOT NULL,
    "cropBId" TEXT NOT NULL,
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchRequestVote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchRequestVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResearchRequest_cropAId_cropBId_key" ON "ResearchRequest"("cropAId", "cropBId");

-- CreateIndex
CREATE INDEX "ResearchRequest_voteCount_idx" ON "ResearchRequest"("voteCount");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchRequestVote_requestId_userId_key" ON "ResearchRequestVote"("requestId", "userId");

-- AddForeignKey
ALTER TABLE "ResearchRequest" ADD CONSTRAINT "ResearchRequest_cropAId_fkey" FOREIGN KEY ("cropAId") REFERENCES "Crop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRequest" ADD CONSTRAINT "ResearchRequest_cropBId_fkey" FOREIGN KEY ("cropBId") REFERENCES "Crop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRequestVote" ADD CONSTRAINT "ResearchRequestVote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ResearchRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchRequestVote" ADD CONSTRAINT "ResearchRequestVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
