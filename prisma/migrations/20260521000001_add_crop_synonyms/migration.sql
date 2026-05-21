-- Add synonyms array field to Crop
ALTER TABLE "Crop" ADD COLUMN "synonyms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
