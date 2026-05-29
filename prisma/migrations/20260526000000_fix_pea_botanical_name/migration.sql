-- Fix pea crop: DB was seeded with Lathyrus L. (grass pea/sweet pea) but garden pea is Pisum sativum.
UPDATE "Crop"
SET "botanicalName" = 'Pisum sativum'
WHERE "botanicalName" = 'Lathyrus L.';
