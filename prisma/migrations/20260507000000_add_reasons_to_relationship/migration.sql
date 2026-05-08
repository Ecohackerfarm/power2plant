-- AlterTable
ALTER TABLE "CropRelationship" ADD COLUMN "reasons" TEXT[] NOT NULL DEFAULT '{}';
