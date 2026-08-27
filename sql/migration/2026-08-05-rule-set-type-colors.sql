-- Configure the Rule Set type badge colors through the existing RULE_SET_TYPE dictionary.
-- name stores a CSS hex color and can be changed from Configuration Dictionary.
UPDATE dictionary
SET name = CASE code
  WHEN 'LIVE' THEN '#34AEE0'
  WHEN 'PBS' THEN '#5B4DBE'
  WHEN 'RO' THEN '#FFCC4B'
END
WHERE parent_code = 'RULE_SET_TYPE'
  AND code IN ('LIVE', 'PBS', 'RO');

INSERT INTO dictionary (parent_code, code, name, idx, code_value)
VALUES
  ('RULE_SET_TYPE', 'LIVE', '#34AEE0', 1, 'LIVE'),
  ('RULE_SET_TYPE', 'PBS', '#5B4DBE', 2, 'PBS'),
  ('RULE_SET_TYPE', 'RO', '#FFCC4B', 3, 'RO')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;
