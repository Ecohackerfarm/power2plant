-- CreateEnum
CREATE TYPE "SourceClassification" AS ENUM ('SCIENTIFIC_PAPER', 'ACADEMIC_RESOURCE', 'GARDENING_GUIDE', 'BLOG_FORUM', 'PERSONAL_OBSERVATION');

-- AlterTable
ALTER TABLE "RelationshipSource" ADD COLUMN "sourceType" "SourceClassification";
