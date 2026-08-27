-- 2026-08-26-fix-btn-log-idx-pbs-simulated-crew-portal.sql
-- 修正 system_menu 中 PBS_SIMULATED_CREW_PORTAL 下 BTN_LOG 的 idx。
-- 历史数据：BTN_LOG 被错误地存为 idx=2，与 BTN_CONFIG（idx=2）冲突，
-- 实际期望顺序是 BTN_SIMULATE=1 / BTN_CONFIG=2 / BTN_LOG=3
-- （参考 sql/seed/05-system-menu.sql lines 292-294）。
--
-- seed 文件用 ON CONFLICT (parent_menu_code, menu_code) DO NOTHING，
-- 不会回填已有行的 idx，因此只能通过 migration 显式修正。
-- （注：seed 在 2026-08-26 已改为 DO UPDATE，新增运行时不再需要此 migration；
--   此文件保留作为存量修正 + 历史审计记录，幂等可重复执行。）
--
-- 通过 search_path 切换目标 schema（f8_dev_* / f8_sit_* / f8_uat_*）。

UPDATE system_menu
SET idx = 3,
    updated_by = 'system',
    updated_at = now()
WHERE menu_code = 'BTN_LOG'
  AND parent_menu_code = 'PBS_SIMULATED_CREW_PORTAL'
  AND idx IS DISTINCT FROM 3;