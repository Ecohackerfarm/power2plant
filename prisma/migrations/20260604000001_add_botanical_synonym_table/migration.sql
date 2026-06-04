-- Add canonicalName to Crop (author-stripped name for external lookups)
ALTER TABLE "Crop" ADD COLUMN "canonicalName" TEXT;
CREATE INDEX "Crop_canonicalName_idx" ON "Crop"("canonicalName");

-- Drop unused synonyms array (was wired up for search but never populated)
ALTER TABLE "Crop" DROP COLUMN "synonyms";

-- Add version tracking to CropEnrichmentAttempt
ALTER TABLE "CropEnrichmentAttempt" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Create BotanicalSynonym table
CREATE TABLE "BotanicalSynonym" (
    "id"     TEXT NOT NULL,
    "cropId" TEXT NOT NULL,
    "name"   TEXT NOT NULL,
    "source" TEXT NOT NULL,
    CONSTRAINT "BotanicalSynonym_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BotanicalSynonym_cropId_name_key" ON "BotanicalSynonym"("cropId", "name");
CREATE INDEX "BotanicalSynonym_name_idx" ON "BotanicalSynonym"("name");

ALTER TABLE "BotanicalSynonym"
    ADD CONSTRAINT "BotanicalSynonym_cropId_fkey"
    FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
