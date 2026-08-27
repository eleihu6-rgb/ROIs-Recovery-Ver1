-- =============================================================================
-- 2026-07-07 assignment: one-letter type taxonomy + is_rest
-- =============================================================================
-- Type taxonomy:
--   L = Leave, O = Off, W = Work, T = Training, S = Reserve
-- is_rest = 1 only for L/O. Reserve remains non-rest.
-- =============================================================================

ALTER TABLE assignment ADD COLUMN IF NOT EXISTS is_rest smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN assignment.type IS 'Assignment category: L=Leave O=Off W=Work T=Training S=Reserve';
COMMENT ON COLUMN assignment.is_rest IS 'Rest flag: 1 for rest/non-work assignments (type L or O), 0 otherwise';

DELETE FROM dictionary
 WHERE parent_code = 'ASSIGN_TYPE'
   AND code IN ('FLY','GRD','LVE','SBY','TRN');

INSERT INTO dictionary (parent_code, code, name, idx, code_value)
SELECT v.parent_code, v.code, v.name, v.idx, v.code_value
FROM (
  VALUES
    ('ASSIGN_TYPE', 'L', 'Leave',    1, 'L'),
    ('ASSIGN_TYPE', 'O', 'Off',      2, 'O'),
    ('ASSIGN_TYPE', 'W', 'Work',     3, 'W'),
    ('ASSIGN_TYPE', 'T', 'Training', 4, 'T'),
    ('ASSIGN_TYPE', 'S', 'Reserve',  5, 'S')
) AS v(parent_code, code, name, idx, code_value)
WHERE NOT EXISTS (
  SELECT 1
  FROM dictionary d
  WHERE d.parent_code = v.parent_code
    AND d.code = v.code
);

WITH classified AS (
  SELECT
    id,
    CASE
      WHEN upper(assignment) = ANY (ARRAY['DO','GDO','TGDO','VGDO','BO','OBDO']::text[]) THEN 'O'
      WHEN upper(assignment) = ANY (ARRAY['AL','ALS','SL','ML','CL','PH','VAC','RVAC','ILL','ILADJ','LEAVE','MLOA','PATL','RCO','RSGN','UAV','UFF','UILL','UNMCS','UNS','UPD','WCB','WCNW']::text[]) THEN 'L'
      WHEN upper(assignment) = ANY (ARRAY['TRN','SIM','CRE','TRNG','CBT','CRM','BMT','UBMT','FTG','UFTG','ACPG','EPTP','TDG','TGS','TTT']::text[]) THEN 'T'
      WHEN upper(assignment) = ANY (ARRAY['SBY','ASBY','RES','PRAM','PRMM','PRPM','PRMOD','RESNQ']::text[]) THEN 'S'
      WHEN upper(type) IN ('L','O','W','T','S') THEN upper(type)
      WHEN upper(type) = 'LVE' THEN 'L'
      WHEN upper(type) = 'TRN' THEN 'T'
      WHEN upper(type) IN ('SBY','RES') THEN 'S'
      ELSE 'W'
    END AS next_type
  FROM assignment
)
UPDATE assignment a
SET
  type = c.next_type,
  is_rest = CASE WHEN c.next_type IN ('L','O') THEN 1 ELSE 0 END,
  updated_at = now(),
  updated_by = 'assignment_type_migration'
FROM classified c
WHERE a.id = c.id
  AND (
    a.type IS DISTINCT FROM c.next_type
    OR a.is_rest IS DISTINCT FROM CASE WHEN c.next_type IN ('L','O') THEN 1 ELSE 0 END
  );
