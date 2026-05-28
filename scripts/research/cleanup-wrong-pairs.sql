-- Removes RelationshipSource records where the linked paper does not actually
-- study both crops in the pair. Generated from botanical verification (2026-05-21).
--
-- Logic: for each DOI, only keep source rows where the pair was confirmed.
-- All other rows for that DOI are deleted.

-- Helper: resolve a DOI url to the source IDs for a given crop-name pair
-- We delete by (url, cropA-name, cropB-name) — matching via the relationship's crops.

BEGIN;

-- ── 10.1007/s00299-024-03285-w ──────────────────────────────────────────────
-- Paper: Companion basil plants prime the tomato wound response (2024)
-- KEEP: basil + Tomato   DELETE: all other 13 pairs
DELETE FROM "RelationshipSource" rs
USING "CropRelationship" cr, "Crop" ca, "Crop" cb
WHERE rs."relationshipId" = cr.id
  AND cr."cropAId" = ca.id
  AND cr."cropBId" = cb.id
  AND rs.url = 'https://doi.org/10.1007/s00299-024-03285-w'
  AND NOT (
    (ca."botanicalName" ILIKE '%Ocimum%' OR ca.name ILIKE '%basil%')
    AND
    (cb."botanicalName" ILIKE '%Solanum lycopersicum%' OR cb.name ILIKE '%omato%')
  )
  AND NOT (
    (cb."botanicalName" ILIKE '%Ocimum%' OR cb.name ILIKE '%basil%')
    AND
    (ca."botanicalName" ILIKE '%Solanum lycopersicum%' OR ca.name ILIKE '%omato%')
  );

-- ── 10.1007/s11829-023-10033-6 ──────────────────────────────────────────────
-- Paper: Intercropping broccoli with Rhododendron/buckwheat (2024)
-- Linked as broccoli+strawberry — strawberry absent → DELETE ALL
DELETE FROM "RelationshipSource"
WHERE url = 'https://doi.org/10.1007/s11829-023-10033-6';

-- ── 10.1038/srep36445 ───────────────────────────────────────────────────────
-- Paper: Physiological response tomato/potato onion (2016)
-- "potato onion" = Allium cepa — NOT Solanum tuberosum
-- KEEP: onion + Tomato   DELETE: Tomato + Irish potato
DELETE FROM "RelationshipSource" rs
USING "CropRelationship" cr, "Crop" ca, "Crop" cb
WHERE rs."relationshipId" = cr.id
  AND cr."cropAId" = ca.id
  AND cr."cropBId" = cb.id
  AND rs.url = 'https://doi.org/10.1038/srep36445'
  AND NOT (
    (ca."botanicalName" ILIKE '%Allium%' OR ca.name ILIKE '%onion%')
    OR
    (cb."botanicalName" ILIKE '%Allium%' OR cb.name ILIKE '%onion%')
  );

-- ── 10.1111/een.12880 ───────────────────────────────────────────────────────
-- Paper: Companion planting attracts pollinators / strawberry yield (2020)
-- KEEP: borage + strawberry   DELETE: 8 other pairs
DELETE FROM "RelationshipSource" rs
USING "CropRelationship" cr, "Crop" ca, "Crop" cb
WHERE rs."relationshipId" = cr.id
  AND cr."cropAId" = ca.id
  AND cr."cropBId" = cb.id
  AND rs.url = 'https://doi.org/10.1111/een.12880'
  AND NOT (
    (ca."botanicalName" ILIKE '%Borago%' OR ca.name ILIKE '%borage%')
    AND
    (cb."botanicalName" ILIKE '%Fragaria%' OR cb.name ILIKE '%strawberry%')
  )
  AND NOT (
    (cb."botanicalName" ILIKE '%Borago%' OR cb.name ILIKE '%borage%')
    AND
    (ca."botanicalName" ILIKE '%Fragaria%' OR ca.name ILIKE '%strawberry%')
  );

-- ── 10.1111/j.1461-9563.2012.00598.x ───────────────────────────────────────
-- Paper: Imitation companion planting / Brussels sprout + plastic (2013)
-- Linked as Carrot + rosemary — neither present → DELETE ALL
DELETE FROM "RelationshipSource"
WHERE url = 'https://doi.org/10.1111/j.1461-9563.2012.00598.x';

-- ── 10.1111/j.1570-7458.2005.00325.x ───────────────────────────────────────
-- Paper: Cabbage root fly behaviour / cabbage + clover (2005)
-- All 7 companion pairs wrong (companions = clover only) → DELETE ALL
DELETE FROM "RelationshipSource"
WHERE url = 'https://doi.org/10.1111/j.1570-7458.2005.00325.x';

-- ── 10.1371/journal.pone.0213071 ────────────────────────────────────────────
-- Paper: French marigolds protect tomato from whiteflies via limonene (2019)
-- basil+rue: rue absent; broccoli+tomato: broccoli absent → DELETE BOTH
DELETE FROM "RelationshipSource"
WHERE url = 'https://doi.org/10.1371/journal.pone.0213071';

-- ── 10.18343/jipi.30.2.389 ──────────────────────────────────────────────────
-- Paper: Water spinach + chili intercropping (2025)
-- "water spinach" = Ipomoea aquatica ≠ Spinacia oleracea → DELETE ALL 3
DELETE FROM "RelationshipSource"
WHERE url = 'https://doi.org/10.18343/jipi.30.2.389';

-- ── 10.18805/ag.d-5921 ──────────────────────────────────────────────────────
-- Paper: Maize + spinach/radish intercropping (2024)
-- Linked as radish+spinach — they're each paired with maize separately, not together → DELETE
DELETE FROM "RelationshipSource"
WHERE url = 'https://doi.org/10.18805/ag.d-5921';

-- ── 10.18805/ijare.a-5960 ───────────────────────────────────────────────────
-- Paper: Maize high-density / cluster bean sequence (2022)
-- Cluster bean = Cyamopsis ≠ Phaseolus; Allium/carrot absent → DELETE ALL 3
DELETE FROM "RelationshipSource"
WHERE url = 'https://doi.org/10.18805/ijare.a-5960';

-- ── 10.20961/agrotechresj.v5i2.54333 ───────────────────────────────────────
-- Paper: Basil growth / tomato-basil intercropping Wondo Genet (2021)
-- KEEP: basil + Tomato   DELETE: oregano, rue, sage, pepper+basil
DELETE FROM "RelationshipSource" rs
USING "CropRelationship" cr, "Crop" ca, "Crop" cb
WHERE rs."relationshipId" = cr.id
  AND cr."cropAId" = ca.id
  AND cr."cropBId" = cb.id
  AND rs.url = 'https://doi.org/10.20961/agrotechresj.v5i2.54333'
  AND NOT (
    (ca."botanicalName" ILIKE '%Ocimum%' OR ca.name ILIKE '%basil%')
    AND
    (cb."botanicalName" ILIKE '%Solanum lycopersicum%' OR cb.name ILIKE '%omato%')
  )
  AND NOT (
    (cb."botanicalName" ILIKE '%Ocimum%' OR cb.name ILIKE '%basil%')
    AND
    (ca."botanicalName" ILIKE '%Solanum lycopersicum%' OR ca.name ILIKE '%omato%')
  );

-- ── 10.21273/hortsci.29.5.523d ──────────────────────────────────────────────
-- Paper: Cabbage + Indian mustard companion planting (1994)
-- All 7 pairs wrong (none of the listed companions appear) → DELETE ALL
DELETE FROM "RelationshipSource"
WHERE url = 'https://doi.org/10.21273/hortsci.29.5.523d';

-- ── 10.21273/horttech.16.1.0012 ─────────────────────────────────────────────
-- Paper: Companion crop config effect on onion / canola+barley (2006)
-- All 10 pairs wrong (companions studied = canola/barley, not any listed crop) → DELETE ALL
DELETE FROM "RelationshipSource"
WHERE url = 'https://doi.org/10.21273/horttech.16.1.0012';

-- ── 10.2478/v10184-011-0052-7 ───────────────────────────────────────────────
-- Paper: Cucumber mosaic virus in water mint (2012)
-- Cucumber only in virus name, not studied as plant → DELETE
DELETE FROM "RelationshipSource"
WHERE url = 'https://doi.org/10.2478/v10184-011-0052-7';

-- ── 10.3390/HORTICULTURAE7040063 ────────────────────────────────────────────
-- Paper: Portulaca oleracea companion to strawberry under salt stress (2021)
-- Companion = purslane (Portulaca), not borage/broccoli → DELETE ALL
DELETE FROM "RelationshipSource"
WHERE url = 'https://doi.org/10.3390/HORTICULTURAE7040063';

-- ── 10.3390/agriculture14091485 ─────────────────────────────────────────────
-- Paper: Herbal companion crops in soybean (2024)
-- Borage mentioned but companion to soybean, not strawberry → DELETE
DELETE FROM "RelationshipSource"
WHERE url = 'https://doi.org/10.3390/agriculture14091485';

-- ── 10.3390/agronomy14061129 ────────────────────────────────────────────────
-- Paper: Suppressing Ralstonia / basil+cilantro companion to tomato (2024)
-- basil+rue: rue absent; broccoli+tomato: broccoli absent → DELETE ALL
DELETE FROM "RelationshipSource"
WHERE url = 'https://doi.org/10.3390/agronomy14061129';

-- ── 10.4038/jas.v4i1.1642 ───────────────────────────────────────────────────
-- Paper: Radish + vegetable amaranth intercropping (2010)
-- Cucumber, hyssop, pea all absent → DELETE ALL 3
DELETE FROM "RelationshipSource"
WHERE url = 'https://doi.org/10.4038/jas.v4i1.1642';

-- ── 10.52763/pjsir.biol.sci.65.1.2022.18.27 ────────────────────────────────
-- Paper: Indian spinach aquaponics with Nile tilapia (2022)
-- Basella alba ≠ Spinacia; pepper absent; not companion planting → DELETE
DELETE FROM "RelationshipSource"
WHERE url = 'https://doi.org/10.52763/pjsir.biol.sci.65.1.2022.18.27';

-- ── 10.54119/discovery.kwgb1918 ─────────────────────────────────────────────
-- Paper: Austrian winter-pea cover crop / corn (2008)
-- Pisum arvense + Vigna unguiculata, not Lathyrus → DELETE
DELETE FROM "RelationshipSource"
WHERE url = 'https://doi.org/10.54119/discovery.kwgb1918';

-- ── 10.63072/aab.23002 ──────────────────────────────────────────────────────
-- Paper: Marigold companion crop review / tomato pest control (2023)
-- Broccoli absent, paper reviews marigold+tomato → DELETE
DELETE FROM "RelationshipSource"
WHERE url = 'https://doi.org/10.63072/aab.23002';

-- ── 10.1080/17429145.2017.1392624 ───────────────────────────────────────────
-- Paper: Root interactions and tomato/potato onion companion cropping (2017)
-- "Potato onion" = Allium cepa — asparagus absent → DELETE
DELETE FROM "RelationshipSource"
WHERE url = 'https://doi.org/10.1080/17429145.2017.1392624';

-- ── Orphan cleanup ───────────────────────────────────────────────────────────
-- Remove CropRelationship rows that now have zero RESEARCH sources
-- and were created solely by the research importer (no PLANTBUDDIES/PFAF sources).
-- These have no supporting evidence left.
DELETE FROM "CropRelationship" cr
WHERE NOT EXISTS (
  SELECT 1 FROM "RelationshipSource" rs WHERE rs."relationshipId" = cr.id
);

COMMIT;
