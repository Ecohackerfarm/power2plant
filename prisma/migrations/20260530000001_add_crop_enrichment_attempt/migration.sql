-- CreateTable
CREATE TABLE "CropEnrichmentAttempt" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "cropId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "attemptedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "CropEnrichmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CropEnrichmentAttempt_cropId_locale_source_key" ON "CropEnrichmentAttempt"("cropId", "locale", "source");

-- CreateIndex
CREATE INDEX "CropEnrichmentAttempt_locale_source_idx" ON "CropEnrichmentAttempt"("locale", "source");

-- AddForeignKey
ALTER TABLE "CropEnrichmentAttempt" ADD CONSTRAINT "CropEnrichmentAttempt_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
