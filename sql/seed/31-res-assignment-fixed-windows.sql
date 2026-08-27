-- 31-res-assignment-fixed-windows.sql
-- RES assignment fixed windows (HH:mm) + RES_CALL_TYPE including P_MM (PRMM).
-- Idempotent: upserts fixed times and dictionary windows.

-- ── Assignment master: create missing RES codes, always refresh fixed windows ──
INSERT INTO assignment (assignment, description, type, is_rest, color_hex, fixed_str_tm, fixed_end_tm, fixed_credit_min, default_assignment_group)
SELECT v.assignment, v.description, 'S', 0, '66CDAA', v.fixed_str_tm, v.fixed_end_tm, 240, 'RES'
FROM (VALUES
  ('PRAM', 'Pilot Reserve AM',  '04:00', '16:00'),
  ('PRMM', 'Pilot Reserve Mid', '10:00', '22:00'),
  ('PRPM', 'Pilot Reserve PM',  '14:00', '23:59'),
  ('CRAM', 'Cabin Reserve AM',  '03:00', '15:00'),
  ('CRPM', 'Cabin Reserve PM',  '10:00', '22:00')
) AS v(assignment, description, fixed_str_tm, fixed_end_tm)
WHERE NOT EXISTS (
  SELECT 1 FROM assignment a WHERE a.assignment = v.assignment
);

UPDATE assignment AS a
SET
  fixed_str_tm = v.fixed_str_tm,
  fixed_end_tm = v.fixed_end_tm,
  updated_by = 'system',
  updated_at = now()
FROM (VALUES
  ('PRAM', '04:00', '16:00'),
  ('PRMM', '10:00', '22:00'),
  ('PRPM', '14:00', '23:59'),
  ('CRAM', '03:00', '15:00'),
  ('CRPM', '10:00', '22:00')
) AS v(assignment, fixed_str_tm, fixed_end_tm)
WHERE a.assignment = v.assignment;

-- ── RES_CALL_TYPE: insert missing keys (incl P_MM) ──
INSERT INTO dictionary (parent_code, code, name, idx, code_value)
SELECT v.parent_code, v.code, v.name, v.idx, v.code_value
FROM (VALUES
  ('RES_CALL_TYPE', 'P_AM', 'Pilot Reserve AM',  1, 'PRAM|04:00|16:00|0'),
  ('RES_CALL_TYPE', 'P_MM', 'Pilot Reserve Mid', 2, 'PRMM|10:00|22:00|0'),
  ('RES_CALL_TYPE', 'P_PM', 'Pilot Reserve PM',  3, 'PRPM|14:00|23:59|0'),
  ('RES_CALL_TYPE', 'C_AM', 'Cabin Reserve AM',  4, 'CRAM|03:00|15:00|0'),
  ('RES_CALL_TYPE', 'C_PM', 'Cabin Reserve PM',  5, 'CRPM|10:00|22:00|0')
) AS v(parent_code, code, name, idx, code_value)
WHERE NOT EXISTS (
  SELECT 1 FROM dictionary d WHERE d.parent_code = v.parent_code AND d.code = v.code
);

-- Refresh windows / call codes for existing RES_CALL_TYPE rows (insert-only seed is not enough).
UPDATE dictionary AS d
SET
  code_value = v.code_value,
  name = v.name,
  idx = v.idx,
  updated_by = 'system',
  updated_at = now()
FROM (VALUES
  ('RES_CALL_TYPE', 'P_AM', 'Pilot Reserve AM',  1, 'PRAM|04:00|16:00|0'),
  ('RES_CALL_TYPE', 'P_MM', 'Pilot Reserve Mid', 2, 'PRMM|10:00|22:00|0'),
  ('RES_CALL_TYPE', 'P_PM', 'Pilot Reserve PM',  3, 'PRPM|14:00|23:59|0'),
  ('RES_CALL_TYPE', 'C_AM', 'Cabin Reserve AM',  4, 'CRAM|03:00|15:00|0'),
  ('RES_CALL_TYPE', 'C_PM', 'Cabin Reserve PM',  5, 'CRPM|10:00|22:00|0')
) AS v(parent_code, code, name, idx, code_value)
WHERE d.parent_code = v.parent_code AND d.code = v.code;
