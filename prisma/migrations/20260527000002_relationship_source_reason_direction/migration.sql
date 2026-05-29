-- AlterTable: add reason and sourceDirection to RelationshipSource
ALTER TABLE "RelationshipSource" ADD COLUMN "reason" "RelationshipReason";
ALTER TABLE "RelationshipSource" ADD COLUMN "sourceDirection" "Direction";
