CREATE TABLE "CropTranslation" (
    "id" TEXT NOT NULL,
    "cropId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "commonNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "CropTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CropTranslation_cropId_locale_key" ON "CropTranslation"("cropId", "locale");
CREATE INDEX "CropTranslation_locale_idx" ON "CropTranslation"("locale");

ALTER TABLE "CropTranslation" ADD CONSTRAINT "CropTranslation_cropId_fkey"
    FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
