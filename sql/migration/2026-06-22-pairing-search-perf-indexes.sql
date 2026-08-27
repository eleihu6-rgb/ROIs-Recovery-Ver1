-- ============================================================
-- 2026-06-22: Pairing-search 热路径性能索引（live schema）
-- ============================================================
--
-- 功能说明：
--   为 PBS pairing 申请页的交互式搜索（Pairing Number 自动补全 / SEARCH 预览 /
--   pool 计数 / airport options）补齐缺失的 live-schema 索引。
--
-- 业务背景：
--   这些热查询按 base + bid-period 过滤 pairing，period 过滤来自
--   `pairing.sch_str_dt_utc`。但现有 pairing 日期索引建在另一个列
--   `pairing_act_str_dt_utc` 上（idx_pairing_base_fleet / idx_pairing_str_end），
--   唯一可用的是 base-only 偏索引 idx_pairing_base —— 于是 period 过滤退化为
--   「先按 base 全量取出，再 Filter 掉非本期」的过滤扫描（实测 YYZ June：
--   Bitmap Index Scan idx_pairing_base 取 7024 行 → Filter 删 5972 行）。
--   配合查询侧把 `(sch_str_dt_utc at time zone 'UTC')::date between …` 改写成
--   sargable 的半开区间 `sch_str_dt_utc >= start and < end`（见 pbs-server
--   pairing-search-preview-query.ts / pairing-airport-options-query.ts），
--   下面的 (base, sch_str_dt_utc) 复合索引即可把过滤扫描变为 index range。
--
--   (b) 为 pairing_segment 的 start/end rollup（min/max 进退场时间）建覆盖索引，
--   让分组聚合（grouped LEFT JOIN，替换原来每行 3 次相关子查询）走 index-only。
--
-- 详见诊断与交接文档：
--   docs/modules/pbs/pairing-page-slow-load-perf-analysis.md
--   docs/handoff/pbs/pairing-search-perf-improvement-handoff.md
--
-- 幂等：全部 create index if not exists。
-- 多 Schema 执行：脚本不含 schema 前缀，通过 `SET search_path TO <airline>` 切换。
-- 注意：生产环境对在线库执行时，请改用 `CREATE INDEX CONCURRENTLY`（不能在事务内，
--   需逐条单独执行）以避免写锁；本文件提供的是可重入的常规形式，供 fresh init /
--   维护窗口使用。
-- ============================================================

-- (a) base + period-date 复合索引（RC1/RC5）：支撑 base 等值 + sch_str_dt_utc 半开区间
create index if not exists idx_pairing_base_sch_str
    on pairing (base, sch_str_dt_utc)
    where is_deleted = 0;

-- (b) pairing_segment rollup 覆盖索引（RC2）：min(brief_start)/min(coalesce(brief_start,sch_str))/
--     max(debrief_end)（以及自动补全用到的 sch_end_dt_utc）走 index-only 聚合
create index if not exists idx_pairing_segment_pair_rollup
    on pairing_segment (pairing_id)
    include (brief_start_utc, debrief_end_utc, sch_str_dt_utc, sch_end_dt_utc)
    where is_deleted = 0;
