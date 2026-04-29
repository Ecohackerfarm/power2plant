-- DropForeignKey
ALTER TABLE "Bed" DROP CONSTRAINT "Bed_gardenId_fkey";

-- DropForeignKey
ALTER TABLE "CropRelationship" DROP CONSTRAINT "CropRelationship_cropAId_fkey";

-- DropForeignKey
ALTER TABLE "CropRelationship" DROP CONSTRAINT "CropRelationship_cropBId_fkey";

-- DropForeignKey
ALTER TABLE "CropSource" DROP CONSTRAINT "CropSource_cropId_fkey";

-- DropForeignKey
ALTER TABLE "Planting" DROP CONSTRAINT "Planting_bedId_fkey";

-- DropForeignKey
ALTER TABLE "RelationshipSource" DROP CONSTRAINT "RelationshipSource_relationshipId_fkey";

-- CreateIndex
CREATE INDEX "CropRelationship_cropBId_idx" ON "CropRelationship"("cropBId");

-- CreateIndex
CREATE INDEX "Planting_bedId_idx" ON "Planting"("bedId");

-- CreateIndex
CREATE INDEX "Planting_cropId_idx" ON "Planting"("cropId");

-- CreateIndex
CREATE INDEX "RelationshipSource_relationshipId_idx" ON "RelationshipSource"("relationshipId");

-- AddForeignKey
ALTER TABLE "CropSource" ADD CONSTRAINT "CropSource_cropId_fkey" FOREIGN KEY ("cropId") REFERENCES "Crop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CropRelationship" ADD CONSTRAINT "CropRelationship_cropAId_fkey" FOREIGN KEY ("cropAId") REFERENCES "Crop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CropRelationship" ADD CONSTRAINT "CropRelationship_cropBId_fkey" FOREIGN KEY ("cropBId") REFERENCES "Crop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipSource" ADD CONSTRAINT "RelationshipSource_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "CropRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_gardenId_fkey" FOREIGN KEY ("gardenId") REFERENCES "UserGarden"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planting" ADD CONSTRAINT "Planting_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
