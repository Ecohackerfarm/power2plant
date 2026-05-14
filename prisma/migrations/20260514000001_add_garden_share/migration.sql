-- CreateTable
CREATE TABLE "GardenShare" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "beds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GardenShare_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "GardenShare_userId_idx" ON "GardenShare"("userId");

-- AddForeignKey
ALTER TABLE "GardenShare" ADD CONSTRAINT "GardenShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
