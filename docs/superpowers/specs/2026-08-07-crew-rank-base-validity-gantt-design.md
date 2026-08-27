# Crew Rank/Base 有效期过滤 + Gantt 失效红线

日期：2026-08-07
状态：Design Approved（待实现计划）

## 1. 背景与问题

Live Crew Filter 查询时，「过期组员」仍会被加载到 Gantt 界面。例如只勾选 Division **C — Cabin**
后，crew 895 / 1901 / 2109 仍出现在结果里。它们属于 rank/base 记录与当前排班窗口无交集的
过期组员，不应加载。

另外，当某个组员的 CrewRank/CrewBase 存在「结束时间落在打开时间段范围内」时，该组员**可以**
加载到界面，但结束时间之后需要在其 Gantt 行上绘制**红色虚线段**，表示这段时间之后不应继续分配任务。

Live 与 Scenario 需要同样的处理。

## 2. 现状确认（根因）

- **「Cabin」= Division `C` 药丸**（`gantt/src/components/layout/filter-dialog.tsx` 的
  `DIVISION_OPTIONS = [{ value: 'P', label: 'P — Pilot' }, { value: 'C', label: 'C — Cabin' }]`）。
  只选 Division 时，后端 SQL 仅生成 `crew.division IN ('C')`，**完全不检查 rank/base 有效期**。
- 多值 rank/base/fleet 过滤（`live-server/src/services/crew/crew-service.ts` list() 后半段）已有
  窗口交集逻辑 `eff_dt <= rangeEnd AND (exp_dt IS NULL OR exp_dt >= rangeStart)`，但只覆盖自身维度，
  且 Division-only / 无筛选路径没有该逻辑。
- **时间窗口已在链路中**：`rp-multi-select.tsx` 选中 RP 后把 Gantt `dateRange` 设为
  `[min(rp_start) − 7d, max(rp_end) + 7d]`（RP08 2026 → 2026-07-25 ~ 2026-09-07），并作为
  `dateRangeStart/dateRangeEnd` 传给 `GET /api/crew`。
- 所有 crew 加载路径（bootstrap / fetchCrews / fetchCrewsWithFilter / loadMore）最终都走
  `crewService.list()`；`ganttService.bootstrap` 也复用 `crewService.list`（slim）。改一处即覆盖全部。
- **Gantt canvas 无任何有效期/过期标记**（检索无 expir/validity/expired 渲染代码）。
- Scenario 侧 `live-server/src/services/scenario/scenario-crew-scope.ts` 的 `crewIdSet()` 已对
  rank/base 过滤做窗口交集（用 scenario 自身 `strDtLoc/endDtLoc`），但同样**只有选了对应条件才生效**，
  Division-only / 无 rank/base 条件时无有效性检查。

### 数据事实（UAT f8_uat_live 实证，窗口 2026-07-25 ~ 09-07）

| crew | rank | base | 判定 |
|---|---|---|---|
| 895 | IFD 2022-06-09 → **2026-03-31** | YYZ 2020→2055 | rank 窗口内无交集 → **Rule 1 排除** |
| 1901 | IFD 2025-03-02 → **2026-07-31** | YYZ 2022→2052 | 部分覆盖，失效点在窗口内 → **Rule 2 加载 + 红线@07-31** |
| 2109 | FA 2022→2052 | YYZ 2024→2054 | UAT 里有效（用户环境可能不同） |

- **晋升链存在**：如 2101 的 rank 2026-08-04 过期但存在后续覆盖记录（`has_covering = true`）；
  常见模式 `旧 rank exp ≈ 新 rank eff +1d`（如 FO 2022-03-30 → CA 2022-03-31）。
  → **红线不能对「窗口内每个 exp_dt」都画**，否则会误伤晋升边界。7 个窗口内 rank 过期的机组里
  只有 2101 是晋升边界，其余 6 个为真实失效。

## 3. 目标

1. **Rule 1（过滤）**：任何 crew 列表查询（含 Division-only、无筛选、显式 crewId）只返回在
   **当前窗口**内同时满足「至少一条 `crew_rank` 记录有交集」**且**「至少一条 `crew_base` 记录有交集」
   的机组。过期组员不再进入 Gantt。
2. **Rule 2（红线）**：机组在窗口内有 rank/base 失效点（之后无任何覆盖记录）时，其行上绘制
   **横向红色虚线段**，从失效点延伸到窗口最后一天，表示此后不可派任务。
3. Live 与 Scenario 行为一致（§Gantt-Unify：共享实现，来源差异藏进 source）。

## 4. 设计

### 4.1 窗口定义

- Live：当前选中 RP 集合 → `[min(rp_start) − 7d, max(rp_end) + 7d]`（即 `filter-store.dateRange`，
  已作为 `dateRangeStart/dateRangeEnd` 传后端）。
- Scenario：scenario 自身的 `strDtLoc/endDtLoc`（已有）。
- 后端兜底：未传 `dateRangeStart/dateRangeEnd` 时当前代码退化为 `[today, today]` —— 但所有
  Live 路径都必须显式传窗口（见 4.3），兜底仅防误用。

### 4.2 Rule 1 — 全局有效性过滤（后端）

`live-server/src/services/crew/crew-service.ts` 的 `list()` 在现有 conditions 之外追加两条
全局条件（对 rangeStart/rangeEnd，缺省同现状取 today）：

```sql
AND EXISTS (
  SELECT 1 FROM crew_rank cr
  WHERE cr.crew_id = crew.crew_id
    AND cr.eff_dt <= :rangeEnd::timestamp
    AND (cr.exp_dt IS NULL OR cr.exp_dt >= :rangeStart::timestamp)
)
AND EXISTS (
  SELECT 1 FROM crew_base cb
  WHERE cb.crew_id = crew.crew_id
    AND cb.eff_dt <= :rangeEnd::timestamp
    AND (cb.exp_dt IS NULL OR cb.exp_dt >= :rangeStart::timestamp)
)
```

- 与现有 rank/base 多选 EXISTS 条件 **AND 叠加**（多选 rank 时仍要求所选 rank 在窗口内有交集，
  且 base 也在窗口内有交集）。
- 显式 crewId（`crew_id IN (...)`）自动被这两条条件约束 → 过期组员即使被显式点名也不返回
  （用户决策点 3）。
- 索引：`crew_rank` 有 `(crew_id, ...)` unique index，`crew_base` 有 `crew_id` index，EXISTS
  按 crew_id 短路径命中，性能可接受（规划时以远端库 EXPLAIN 复核）。

`live-server/src/services/scenario/scenario-crew-scope.ts` 的 `crewIdSet()` 同样追加这两条
全局 EXISTS 条件，窗口用 `strDtLoc/endDtLoc`（`exp_dt IS NULL OR exp_dt >= strDtLoc`）。

### 4.3 前端必传窗口（配套改动）

`gantt/src/stores/crew-store.ts`：
- `fetchCrews()`：params 增加 `dateRangeStart/dateRangeEnd`（取 `useFilterStore.getState().dateRange`）。
- 无筛选 `loadMore`（append / activeGlobalFilter 为空时）：同样补传当前 dateRange。

否则全局条件在无筛选路径退化为 `[today, today]`，窗口语义错误。

> 待核实：`ganttService.bootstrap` 是否把 `startDate/endDate` 映射为 `dateRangeStart/dateRangeEnd`
> 传给 `crewService.list`；若没有则一并补上。

### 4.4 Rule 2 — 失效红线（前端共享层）

新增纯函数 `gantt/src/utils/crew-validity.ts`：

```ts
computeValidityBlock(
  ranks: CrewRankRecord[], bases: CrewBaseRecord[],
  winStartMs: number, winEndMs: number,
): number | null
```

算法（全部按 UTC ms）：
1. `rankCoversEnd` = 存在 rank 记录满足 `effDt <= winEnd && (expDt == null || expDt >= winEnd)`。
   `baseCoversEnd` 同理。
2. 若两者都 true → 返回 `null`（整窗口内有效，无红线）。
3. 否则对「未覆盖到末尾」的维度取 **窗口内最后覆盖点** = 该维度所有与窗口相交记录中
   `max(expDt)`（此时 expDt 必为有限值）：
   - `rankEnd = rankCoversEnd ? +∞ : max(expDt over overlapping rank records)`
   - `baseEnd = baseCoversEnd ? +∞ : max(expDt over overlapping base records)`
4. `block = min(rankEnd, baseEnd)`。
5. 仅当 `winStartMs < block < winEndMs` 时返回 `block`，否则 `null`。

覆盖语义保证：晋升边界（旧记录 exp 后跟新记录覆盖到窗口末）因第 1 步 `coversEnd=true` 而不触发；
真实失效（exp 后无覆盖）在第 3 步取到有限 block。

数据来源：非 slim 模式 crew 列表已带 `ranks/bases` 全量历史（`CrewRankRecord[]/CrewBaseRecord[]`）。
slim（首屏 bootstrap）无历史 → 红线在 phase-2 全量加载后出现，符合 §First-Paint。

渲染：
- 在共享 source（`live-gantt-source.ts` / `scenario-gantt-source.ts`）或 `SharedRosterPane` 构建
  `Map<crewId, blockMs>`，随 `RosterRenderContext` 传入（新增字段，如 `crewValidityBlock`）。
- `gantt/src/components/gantt/renderers/roster-renderer.ts` `drawBucketsForRows` 内，对每个可见
  crew 若 `blockMs` 存在且落在 `[rangeStart, rangeEnd]` 内：计算 `x = timeToX(blockMs, rangeStart,
  pxPerHour, 'UTC') - scrollX`，从该 x 到 `timeToX(rangeEnd, ...) - scrollX`（超出 canvas 右缘则
  clamp）画横向红色虚线段，`y = rowY + ROW_HEIGHT / 2`，沿用现有虚线模式
  （`ctx.setLineDash([4,3])`，`strokeStyle` 用现有 `nowLineColor` 红 `#ef4444` 或新增 token，lineWidth 1.5，
  画完 `setLineDash([])`）。
- Scenario：**已确认** `scenario-crew-history.ts` 已将 `crew_rank/crew_base` 的 `eff_dt/exp_dt`
  attach 为 crew 对象的 `ranks/bases`（`effDt/expDt` ISO 字符串，与 Live `CrewRankRecord` 同形），
  共享 `computeValidityBlock` 直接可用；窗口用 scenario 自身 `strDtLoc/endDtLoc`。

### 4.5 设计决策记录

| # | 决策 | 选择 | 说明 |
|---|---|---|---|
| 1 | rank/base 交集要求 | **两者都须** | 过期组员 = rank/base 双失效 |
| 2 | 红线形态 | **横向红色虚线段** | 从失效点到窗口末，表达「此后勿派任务」 |
| 3 | 显式 crewId | **同样排除** | 必须满足有效 rank/base 最低要求 |
| 4 | 红线终点 | **RP 窗口最后一天**（rangeEnd） | 窗口外本就无任务 |

## 5. 涉及文件

后端：
- `live-server/src/services/crew/crew-service.ts` — 全局 rank/base EXISTS 条件
- `live-server/src/services/scenario/scenario-crew-scope.ts` — 同上（strDtLoc/endDtLoc）
- （待核实）`live-server/src/services/gantt/gantt-service.ts` bootstrap 的 startDate/endDate 映射

前端：
- `gantt/src/stores/crew-store.ts` — fetchCrews / 无筛选 loadMore 补传 dateRange
- `gantt/src/utils/crew-validity.ts` — 新增 `computeValidityBlock`
- `gantt/src/components/gantt/renderers/roster-renderer.ts` — 画红线 + `RosterRenderContext` 字段
- `gantt/src/components/panes/shared/roster-pane.tsx` 或共享 source — 构建 `Map<crewId, blockMs>`
- scenario 侧复用以上共享实现（`scenario-crew-history.ts` 已挂载同形 `ranks/bases`，无需额外改动）

## 6. 测试计划（§Playwright-Required / §No-Illusion）

- **Rule 1 E2E（live，真实后端）**：Division=C + RP08 窗口 → roster pane 不含 895（rank 已过期）；
  有效机组（如 2109）在。断言具体数据（`toContainText`/行存在性），非仅可见性。
- **Rule 2 E2E（live，真实后端）**：1901 行在 2026-07-31 处出现红色虚线段；通过现有
  `__ganttTest` 探针暴露 `crewValidityBlock` 断言 x 位置，或对画布做几何断言。
- **Scenario E2E**：复用 mock gantt-data + `__ganttTest` 探针（见 `docs/superpowers/specs/`
  scenario 既有做法），断言 rule 1 排除 / rule 2 红线。
- **后端单元（Vitest）**：`crew-service.list` 在窗口内 rank/base 双交集 / 单维度失效 / division-only /
  显式 crewId 四类用例的 WHERE 生成与结果。
- **前端单元（Vitest）**：`computeValidityBlock` 覆盖 全覆盖→null、rank 失效、base 失效、
  晋升链（有覆盖记录）→null、block 在窗口外→null。

## 7. 风险与备注

- 数据环境差异：用户示例（895/1901/2109）在 DEV 与 UAT 数据可能不同；以「窗口交集规则」为准，
  实现时以目标环境数据复核。
- 全局条件会让无 rank/base 记录（数据缺口）的机组被过滤；符合「过期不上界面」要求，但需留意
  是否掩盖数据质量问题。
- 红线仅为视觉标记（不阻止已存在任务的显示）；「此后不应继续分配」的硬约束不在本 spec 范围。
