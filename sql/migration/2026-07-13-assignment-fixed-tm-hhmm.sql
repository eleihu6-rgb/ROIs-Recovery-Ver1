-- =============================================================================
-- 2026-07-13  assignment.fixed_str_tm / fixed_end_tm → varchar(5) HH:mm
-- =============================================================================
-- RES Pairing Planner reads these as base-local wall-clock times (e.g. '04:00').
-- Legacy numeric values (if any) are discarded; seed 31 fills RES codes.
-- Idempotent: safe to re-run.
-- =============================================================================

ALTER TABLE assignment
  ALTER COLUMN fixed_str_tm TYPE varchar(5) USING (
    CASE
      WHEN fixed_str_tm IS NULL THEN NULL
      WHEN fixed_str_tm::text ~ '^\d{1,2}:\d{2}$' THEN
        lpad(split_part(fixed_str_tm::text, ':', 1), 2, '0') || ':' || split_part(fixed_str_tm::text, ':', 2)
      ELSE NULL
    END
  );

ALTER TABLE assignment
  ALTER COLUMN fixed_end_tm TYPE varchar(5) USING (
    CASE
      WHEN fixed_end_tm IS NULL THEN NULL
      WHEN fixed_end_tm::text ~ '^\d{1,2}:\d{2}$' THEN
        lpad(split_part(fixed_end_tm::text, ':', 1), 2, '0') || ':' || split_part(fixed_end_tm::text, ':', 2)
      ELSE NULL
    END
  );

COMMENT ON COLUMN assignment.fixed_str_tm IS '固定开始墙钟时间（本地 HH:mm，5 字符）；RES 生成时按 base 时区转 UTC';
COMMENT ON COLUMN assignment.fixed_end_tm IS '固定结束墙钟时间（本地 HH:mm，5 字符）；end≤start 视为跨午夜';
