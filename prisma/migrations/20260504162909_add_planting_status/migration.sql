-- CreateEnum
CREATE TYPE "PlantingStatus" AS ENUM ('PLANNED', 'PLANTED', 'HARVESTED');

-- AlterTable
ALTER TABLE "Planting" ADD COLUMN     "status" "PlantingStatus" NOT NULL DEFAULT 'PLANNED';
