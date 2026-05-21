-- Fix 143 corrupted botanical author abbreviations containing U+FFFD replacement characters.
-- Each pattern maps a corrupted fragment to its correct Unicode form.
-- U+FFFD = chr(65533) in PostgreSQL.
--
-- Patterns are applied in a single pass using regexp_replace with the g flag.
-- Remaining corrupted names (if any) must be corrected manually:
--   SELECT id, "botanicalName" FROM "Crop" WHERE "botanicalName" LIKE '%' || chr(65533) || '%';

UPDATE "Crop" SET "botanicalName" = regexp_replace(
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  "botanicalName",
                  'M' || chr(65533) || 'll\.', 'Müll.', 'g'
                ),
                'G' || chr(65533) || 'rtn\.', 'Gärtn.', 'g'
              ),
              'S' || chr(65533) || 'derst\.', 'Söderst.', 'g'
            ),
            'Sch' || chr(65533) || 'n\.', 'Schön.', 'g'
          ),
          'H' || chr(65533) || 'cker', 'Höcker', 'g'
        ),
        'N' || chr(65533) || 'ttl\.', 'Nüttl.', 'g'
      ),
      'Kl' || chr(65533) || 'tzsch', 'Klötzsch', 'g'
    ),
    '^' || chr(65533) || '\.', 'Å.', 'g'
  ),
  chr(65533) || '\.', 'ö.', 'g'
)
WHERE "botanicalName" LIKE '%' || chr(65533) || '%';
