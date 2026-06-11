-- ReviewCheck is an audit table: a verdict must survive deletion of the source
-- or claim it judged. Switch both FKs from CASCADE to SET NULL.

ALTER TABLE "ReviewCheck" DROP CONSTRAINT "ReviewCheck_sourceId_fkey";
ALTER TABLE "ReviewCheck" ADD CONSTRAINT "ReviewCheck_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "RelationshipSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReviewCheck" DROP CONSTRAINT "ReviewCheck_claimId_fkey";
ALTER TABLE "ReviewCheck" ADD CONSTRAINT "ReviewCheck_claimId_fkey"
  FOREIGN KEY ("claimId") REFERENCES "RelationshipClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;
