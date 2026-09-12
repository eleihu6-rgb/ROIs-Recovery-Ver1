-- =============================================================================
-- 2026-09-12  AL / DO 固定为整日窗口 (fixed_str_tm 00:00 → fixed_end_tm 23:59)
-- =============================================================================
-- 需求 (Ryan): Annual Leave (AL) 与 Day Off (DO) 属于整日任务，创建 Ground Task
-- 时不应让排班员逐个填时间——把这两个 assignment 的固定窗口设成整日，前端据此
-- 自动填充并锁定起止时间。
--
-- 现状: AL 的 fixed_str_tm/fixed_end_tm 为 NULL；DO 为 00:00–12:59（半日，历史遗留）。
-- 目标: 两者统一为 00:00–23:59（整日，与 Ground Task 对话框默认的 23:59 收尾一致）。
--
-- 说明: AL/DO 属 LVE assignment group，不在 RES_CALL_TYPE 允许集合内，因此本次改动
--       不影响 RES Pairing Planner 的固定窗口解析（该逻辑只读 RES 呼叫类代码）。
-- 幂等: 按 assignment code 定点 UPDATE，可安全重复执行。
-- =============================================================================

UPDATE assignment
SET fixed_str_tm = '00:00',
    fixed_end_tm = '23:59',
    updated_by   = 'migration',
    updated_at   = now()
WHERE assignment IN ('AL', 'DO')
  AND (fixed_str_tm IS DISTINCT FROM '00:00' OR fixed_end_tm IS DISTINCT FROM '23:59');
