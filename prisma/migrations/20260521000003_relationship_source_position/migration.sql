-- Add optional position column to RelationshipSource.
-- Records what the individual source says (COMPANION/AVOID/etc), which may differ
-- from the relationship's overall type when sources conflict.
ALTER TABLE "RelationshipSource" ADD COLUMN "position" "RelationshipType";
