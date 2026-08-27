# PBS Reserve 六月 Coverage Seed 设计

## 背景

Reserve 页面通过后端接口读取 `pbs_reserve_coverage`，不是前端 mock。当前开发库只有 `Apr 2026` 和 `May 2026` 的 `F8` coverage 数据；当系统当前周期 fallback 到 `Jun 2026` 时，Reserve 页面会提示没有 coverage 数据。

## 目标

为开发/演示环境补齐 `Jun 2026 / F8` 的 Reserve coverage 数据，使 Reserve 页面能像四月份一样显示每日 reserve 覆盖数量。

## 范围

- 新增一个幂等 SQL migration。
- 写入 `pbs_reserve_coverage`：
  - `period_code = 'Jun 2026'`
  - `base_code = 'F8'`
  - `coverage_date = 2026-06-01` 到 `2026-06-30`
  - `required_reserve_count` 和 `available_off_count` 沿用现有 Apr/May seed 公式。
- 不修改前端页面逻辑。
- 不修改 Reserve bid 条件定义。

## 验收标准

- `pbs_reserve_coverage` 中存在 `Jun 2026 / F8` 30 天 active 数据。
- migration 可重复执行，不产生重复数据。
- Reserve 页面当前周期为 `Jun 2026` 时不再因为 coverage 缺失显示空状态。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单表 seed 补齐，任务很小。
- Suggested split: 不拆分。
- Write boundaries: 仅新增 SQL migration 和本设计文档。
- Conflict risk: 低。
- Execution gate: 用户已确认执行。
