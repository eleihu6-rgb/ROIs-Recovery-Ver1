# KPI 合并至 scenario_result（drop scenario_kpi）Design

**Date:** 2026-08-14
**Status:** Approved (brainstorming)
**Affected modules:** `live-server`（scenario result / service / routes / workers）、`gantt`（scenario detail / KPI section）、`sql`（migration / schema / seed）、`e2e`

## Problem

场景 KPI 目前存在两套存储：结构化表 `scenario_kpi`（规范化）与 `scenario_result` 的 `type='kpi'` JSON（反规范化副本）。gantt 前端已优先读取 `scenario_result`（`results.kpi`），`scenario_kpi` 只是 fallback 与中间态。目标是让 `scenario_result` type=`kpi` 成为 KPI **唯一**数据源，删除 `scenario_kpi` 表及其全部读写路径。

## Current Architecture

- `scenario_kpi`：结构化 KPI 表（`scenario_id, kpi_names, kpi_values, description, idx, type`，唯一约束 `(scenario_id, kpi_names)`）。
  - 写入：`scenario-result-service.ts` 的 `computeAndPersistKpis`（1311-1585，delete+insert 1546-1563）、`syncScenarioPairingKpisFromDb`（450-578，经 `upsertCurrentLineKpi` 413 逐条写）、`scenario-service.ts` 的 `createKpi`/`updateKpi`/`removeKpi`（669-695，无消费者）。
  - 读取：`scenario-service.ts` 的 `getKpis`（655-663，路由 `GET /:id/kpi`）、`compareGroup`（620-651，场景组 KPI 对比，路由 `scenario.ts:990`）、`syncScenarioPairingKpisFromDb` 内部（559-572，读全量后反规范化）。
  - 清理：`scenario-service.ts:164` 删场景时 `delete from scenario_kpi`。
- `scenario_result`：通用 JSON blob（`scenario_id, type, json`，唯一约束 `(scenario_id, type)`）。`ScenarioResultType` 已含 `'kpi'`。
  - 写入：`scenario-result-store.upsertScenarioResultJson(fastify, id, 'kpi', rows)`（`scenario-result-service.ts:564`、`1567`）。
  - 读取：`scenario-result-store.getScenarioResults` → `payload.kpi`；路由 `GET /:id/results`（`scenario.ts:1045+`）。
- gantt：`scenario-store.ts` 并行 fetch `[detail, kpis, results, progress]`；`scenario-kpi-section.tsx:1584` `const kpiRows = results?.kpi.length ? results.kpi : kpis`（**已优先 results.kpi**）。
- 调用方：`computeAndPersistKpis` ← `POST /api/scenario/result`（engine 结果回调，`scenario.ts:1348`）+ admin 回填路由；`syncScenarioPairingKpisFromDb` ← KPI recompute worker（`scenario-kpi-recompute-worker.ts:22`，roster 编辑后异步重算，只重算 4 项 line/coverage，credit 4 项来自存量）。

## Design

### 1. 后端写入（`scenario-result-service.ts`）

- `computeAndPersistKpis`（1311-1585）：`rows` 已含全部 8 项 KPI。删除 `delete scenario_kpi`（1546）与 `insert scenarioKpi` 循环（1548-1563），**只保留** `upsertScenarioResultJson(fastify, scenarioId, 'kpi', rows.map(...))`（1567）。
- `syncScenarioPairingKpisFromDb`（450-578）：由「经 `upsertCurrentLineKpi` 写 scenario_kpi → 读 scenario_kpi 全量 → 反规范化」改为「计算 4 项 line/coverage → 读 scenario_result 现有 `kpi` JSON → 按 `kpiNames` 覆盖 4 项（保留 credit 4 项）→ 写回 scenario_result」。删除对 `scenario_kpi` 的读写。
- `upsertCurrentLineKpi`（413）删除。

### 2. 后端读取（`scenario-service.ts`）

- 删除 `getKpis`（655-663）。
- 删除 `createKpi`/`updateKpi`/`removeKpi`（669-695）。
- `compareGroup`（620-651）：改读 `scenario_result` `type='kpi'`（对 `scenarioIds` 批量 `select type, json ... where scenario_id = ANY(...) and type = 'kpi'`），保持返回 `{ scenario, kpis }` 形状不变。
- 删除 `delete from scenario_kpi`（164）。scenario_result 清理已由 `deleteScenarioResultJson` / `clearScenarioResult` 覆盖。

### 3. 路由（`scenario.ts`）

- 删除 `GET /:id/kpi`（1036）、`POST /:id/kpi`、`PUT /kpi/:kpiId`、`DELETE /kpi/:kpiId`。保留 `GET /:id/results`。

### 4. 模型/清理

- 删除 `live-server/src/models/scenario/scenario-kpi.ts`；`models/index.ts` 移除导出。
- 移除 `scenario-service.ts` 与 `scenario-result-service.ts` 中的 `scenarioKpi` import。

### 5. DB 迁移（一次完成）

新增 `sql/migration/YYYY-MM-DD-drop-scenario-kpi.sql`（幂等）：

```sql
-- Backfill: scenario_kpi → scenario_result type='kpi'（JSON 数组，id 对齐 idx 顺序 1..N）
insert into scenario_result (scenario_id, type, json, created_by, updated_by)
select scenario_id, 'kpi',
       jsonb_agg(jsonb_build_object(
         'id', row_number() over (partition by scenario_id order by idx, kpi_names),
         'scenarioId', scenario_id,
         'kpiNames', kpi_names,
         'kpiValues', kpi_values,
         'description', description,
         'idx', idx,
         'type', type
       ) order by idx, kpi_names) as json,
       'system', 'system'
  from scenario_kpi
 group by scenario_id
on conflict (scenario_id, type) do update set
  json = excluded.json, updated_by = excluded.updated_by, updated_at = now();

drop table scenario_kpi;
```

- `sql/schema/live/02-crew-roster.sql`：移除 scenario_kpi 建表（1775-1790）与 comment。
- `sql/seed/95-scenario-mock.sql`：移除 scenario_kpi INSERT（157-183）。

### 6. gantt 前端

- `scenario-store.ts`：移除 `kpis` state（33）、并行 fetch 里的 `kpis`（157/243/269），仅保留 `results`。
- `scenario-kpi-section.tsx:1584`：`const kpiRows = results?.kpi.length ? results.kpi : kpis` → `const kpiRows = results?.kpi ?? []`；删除 `kpis` prop（27）。
- `scenario-detail-panel.tsx`：删除 `kpis` 读取（40）与 `<ScenarioKpiSection kpis={kpis}`（128）。
- `scenario-api.ts`：删除 `getKpis`（126-128）。`ScenarioKpi` 类型保留（`results.kpi` 仍用）。

### 7. E2E

- 删除以下 spec 中 `/api/scenario/:id/kpi` 的 route mock（app 不再调用）：
  `scenario-toolbar-buttons.spec.ts:267`、`scenario-run-status-dot.spec.ts:81-82`、`scenario-kpi-results-canonical.spec.ts:153/194`、`scenario-pairing-info-follow-toolbar-tz.spec.ts:143`、`scenario-pairing-info-zless-timestamp.spec.ts:170`、`scenario-roster-edit.spec.ts:304`、`scenario-ground-task-open.spec.ts:112`。

### 8. 测试（含迁移门禁冲突回归）

- `scenario-result-service.test.ts`：`computeAndPersistKpis` 测试改为断言「只写 scenario_result type='kpi'、不写 scenario_kpi」（新源胜出的回归：若未来有人重写回 scenario_kpi，此测试红）。
- `scenario-kpi-section.test.tsx`：去掉 `kpis` prop。
- 检查 `scenario-service` / 相关测试是否有 `getKpis`/`compareGroup`/CRUD 断言，随代码同步更新。

## Out of Scope

- KPI 计算的算法/口径不变，仅存储位置迁移。
- `crew_kpi_adjust` 表（机组 KPI 手动调整）与本变更无关，不动。
- `scenario_result` 其他 type（raw_result / credit_hours / uncovered / distribution）不动。

## 迁移门禁审计（下游客）

| 层 | 检查 | 结论 |
|---|---|---|
| engine-server | `scenario_kpi` 引用 | 无（KPI 作为 report section 输出，不直接写表） |
| pbs-server | `scenario_kpi` 引用 | 无 |
| gantt | 读取 | `getKpis`/`kpis` fallback 删除；`results.kpi` 保留 |
| live-server worker | `syncScenarioPairingKpisFromDb` | 改为读-覆盖-写回 scenario_result |
| live-server admin | `scenario-kpi-backfill.ts` | 调用 `computeAndPersistKpis`，无需改动 |
| 删除路径 | `scenario-service.ts:164` | scenario_kpi delete 删除；scenario_result 已有清理 |
| docs | `scenario_kpi` 引用 | 待实现时扫描更新 |

**残余风险**：`syncScenarioPairingKpisFromDb` 的「读现有 kpi JSON → 覆盖 → 写回」需要保证并发安全（recompute worker 与结果回调理论上可能并发写同场景）；实现时用 `upsertScenarioResultJson` 的 upsert 语义，并以 recompute 后置。scenario_kpi 迁移回填在发布时序上必须先于新代码部署（否则新代码不写 scenario_kpi、回填又依赖它读存量）——发布时先跑迁移再切代码。

## Tests

| 层 | 文件 | 变更 |
|---|---|---|
| Backend unit | `live-server/src/__tests__/services/scenario/scenario-result-service.test.ts` | computeAndPersistKpis 断言只写 scenario_result |
| Frontend unit | `gantt/src/components/scenario/__tests__/scenario-kpi-section.test.tsx` | 去掉 kpis prop |
| E2E | 7 个 spec | 删除 /kpi mock |
