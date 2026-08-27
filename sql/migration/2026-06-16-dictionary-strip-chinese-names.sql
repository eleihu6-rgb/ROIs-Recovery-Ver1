-- Strip " / 中文" bilingual suffix from all dictionary name values.
-- Seeds now store English-only names; this aligns existing DB rows.
UPDATE dictionary
SET    name       = regexp_replace(name, ' / .*$', ''),
       updated_at = NOW(),
       updated_by = 'migration'
WHERE  name LIKE '% / %';
