-- CreateTable
CREATE TABLE IF NOT EXISTS "CropEnrichmentAttempt" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "cropId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "attemptedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "CropEnrichmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CropEnrichmentAttempt_cropId_locale_source_key" ON "CropEnrichmentAttempt"("cropId", "locale", "source");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CropEnrichmentAttempt_locale_source_idx" ON "CropEnrichmentAttempt"("locale", "source");

-- AddForeignKey (no-op if constraint already exists)
DO $$ BEGIN
  ALTER TABLE "CropEnrichmentAttempt" ADD CONSTRAINT "CropEnrichmentAttempt_cropId_fkey"
    FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
