# PBS Search 与算法导出 Pairing 资格修复实施计划

## 目标

按已批准的设计修复两条真实链路：

1. Search Pairings 只返回 `FLY + active segment`，并修正 Property 103 空事实/dateScope 的 Award/Avoid 适用性。
2. `live-server` 的 `PAIRING_SCORE.csv` 对 Current、YEG-14、Scenario 三类导出逐 Crew 校验窗口、Base、Rank 和有效 FLY Pairing。

设计文档：

`docs/superpowers/specs/2026-07-23-pbs-search-pairings-fly-candidate-scope-design.md`

## 实施步骤

### 1. 冻结回归

- 在 Pairing Search service/query tests 中建立 GRD、无 active segment 被排除的失败用例。
- 在 Property 103 condition tests 中建立：
  - 无事件事实 Award/Avoid 均不命中；
  - dateScope 外 Award/Avoid 均不命中。
- 在 `live-server` Pairing Score tests 中建立 Crew 844 / Pairing 147759 等价 fixture。
- 先运行 focused tests，确认新用例能捕获旧实现。

### 2. Search Pairings 基础候选

- 在 Search Pairings 的共享候选 SQL 中加入：
  - `upper(btrim(p.assignment_group)) = 'FLY'`；
  - active `pairing_segment` EXISTS。
- 让分页 summary、rows、Current Rules count 使用相同基础资格。
- 保留现有 Base、Rank、Period 和稳定排序。

### 3. Property 103 适用性

- 将事件存在、dateScope 适用性与时间偏好拆开。
- Award/Avoid 只反转时间偏好，不反转事件存在或日期适用性。
- 同步普通 preview 和 Current Rules materialized facts。

### 4. Algorithm Export 逐 Crew 资格

- 批量加载导出 Crew 的 `crew_base` / `crew_rank` 有效期记录。
- Pairing match row 携带当地 origin date、Base、有效航段和 composition ranks。
- Current/YEG 使用 `periodCode` 月窗口；Scenario 使用显式窗口或 period fallback，并保留既有 ±7 天 buffer。
- 在写入 counter 前逐 Crew 校验：
  - FLY；
  - active segment；
  - 窗口；
  - 当日 prime Base；
  - 当日 Rank。
- 保持 Algorithm Avoid 的正向命中 + Avoid counter 语义和 CSV 格式。

### 5. 验证

- Pairing Search focused tests。
- Property 103 condition tests。
- `live-server` Pairing Score / Algorithm Export tests。
- `pbs-server` 与 `live-server` build。
- 远端 PostgreSQL 只读 SQL / EXPLAIN，确认 TB8549 被排除且无 N+1。
- 真实 Portal Playwright，确认 Search Pairings 不显示 TB8549/空 legs。
- `git diff --check`。
- GitNexus `detect-changes --scope compare --base-ref main`。

## 写入边界

- `pbs-server/src/services/pairing-search/**`
- `live-server/src/services/algorithm-export/**`
- 对应 focused tests
- 必要的 PBS Portal Playwright
- 本 spec/plan

不修改或暂存当前工作树中既有 Bid Summary 改动，不创建 Migration，不改变 CSV contract。
