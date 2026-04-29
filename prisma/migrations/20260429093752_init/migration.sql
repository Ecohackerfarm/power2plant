-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('COMPANION', 'AVOID', 'ATTRACTS', 'REPELS', 'NURSE', 'TRAP_CROP');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('MUTUAL', 'ONE_WAY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RelationshipReason" AS ENUM ('PEST_CONTROL', 'POLLINATION', 'NUTRIENT', 'SHADE', 'ALLELOPATHY', 'OTHER');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('ANECDOTAL', 'TRADITIONAL', 'OBSERVED', 'PEER_REVIEWED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('TREFLE', 'USDA', 'OPENFARM_DUMP', 'PLANTBUDDIES', 'PFAF', 'WIKIDATA', 'GBIF', 'COMMUNITY', 'MANUAL');

-- CreateTable
CREATE TABLE "Crop" (
    "id" TEXT NOT NULL,
    "botanicalName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isNitrogenFixer" BOOLEAN NOT NULL DEFAULT false,
    "minTempC" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Crop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CropSource" (
    "id" TEXT NOT NULL,
    "source" "SourceType" NOT NULL,
    "externalId" TEXT,
    "url" TEXT,
    "rawData" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cropId" TEXT NOT NULL,

    CONSTRAINT "CropSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CropRelationship" (
    "id" TEXT NOT NULL,
    "type" "RelationshipType" NOT NULL,
    "direction" "Direction" NOT NULL DEFAULT 'MUTUAL',
    "reason" "RelationshipReason",
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "notes" TEXT,
    "cropAId" TEXT NOT NULL,
    "cropBId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CropRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelationshipSource" (
    "id" TEXT NOT NULL,
    "source" "SourceType" NOT NULL,
    "confidence" "ConfidenceLevel" NOT NULL DEFAULT 'ANECDOTAL',
    "url" TEXT,
    "notes" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relationshipId" TEXT NOT NULL,

    CONSTRAINT "RelationshipSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGarden" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGarden_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bed" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gardenId" TEXT NOT NULL,

    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Planting" (
    "id" TEXT NOT NULL,
    "bedId" TEXT NOT NULL,
    "cropId" TEXT NOT NULL,

    CONSTRAINT "Planting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Crop_botanicalName_key" ON "Crop"("botanicalName");

-- CreateIndex
CREATE UNIQUE INDEX "Crop_slug_key" ON "Crop"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CropSource_cropId_source_key" ON "CropSource"("cropId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "CropRelationship_cropAId_cropBId_key" ON "CropRelationship"("cropAId", "cropBId");

-- AddForeignKey
ALTER TABLE "CropSource" ADD CONSTRAINT "CropSource_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CropRelationship" ADD CONSTRAINT "CropRelationship_cropAId_fkey" FOREIGN KEY ("cropAId") REFERENCES "Crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CropRelationship" ADD CONSTRAINT "CropRelationship_cropBId_fkey" FOREIGN KEY ("cropBId") REFERENCES "Crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipSource" ADD CONSTRAINT "RelationshipSource_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "CropRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_gardenId_fkey" FOREIGN KEY ("gardenId") REFERENCES "UserGarden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planting" ADD CONSTRAINT "Planting_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planting" ADD CONSTRAINT "Planting_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
