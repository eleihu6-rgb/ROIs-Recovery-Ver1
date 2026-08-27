# Spec: Scenario 拖拽分配门禁 / Pairing 配比本地实时计算 / 跨用户 Roster 同步 / Header 动态 Rank-Base

> 日期：2026-08-06 · 状态：设计定稿 · 模块：live-server / gantt
> 关联：`docs/superpowers/specs/2026-08-05-manday-legality-async-recompute-push-design.md`、
> `docs/superpowers/specs/2026-06-08-composition-fill-open-design.md`、
> `docs/superpowers/specs/2026-06-15-scenario-persisted-legality-design.md`

## 1. 背景与问题（SIT 实测）

用户在 SIT（10.15.12.4）上删除一个带飞行环的 Roster 数据后，发现三个问题：

1. **Scenario Pairing 配比（fill）未随 Roster 变化**：Pairing pane 直接读
   `data.pairings[].compositions[].fill`（数据加载时的快照）。编辑（`pendingChanges`）和保存后
   都不更新它——`applyScenarioPatchesToData` 只更新 `assignments`，不改 `compositions[].fill`。
   且服务端 `add` patch 写入 `roster_acting_rank = NULL`（`scenario-patch-service.ts:242`），
   补丁新增的机组不计入任何槽位 fill。
2. **拖拽环回 Crew 后界面无反应**：drop → `edit.execute` → `await previewScenarioPatch` →
   `checkLiveDraftLegality`（`roster-store.ts:168`）用 `Promise.all` 并行发 **2 个**
   `POST /api/legality/preview-draft`（`before` 基线 + `after`），每个都是场景级重算；
   `addPatch` 被卡在其后，绘制延迟。
3. **其他打开同一 Scenario Gantt 的用户收不到 Roster 变更**：WS 只有
   `scenario-manday-updated` / `scenario-kpi-updated` / `scenario-legality-updated`，
   均不刷新 roster assignments。

性能验收目标：**拖拽 → 绘制 ≤ 100ms（越快越好）**。

## 2. 为什么检查发送两次

`checkLiveDraftLegality`（`gantt/src/stores/roster-store.ts:168-277`）需要区分
「本次编辑**新引入**的违规」与「当前 pending 状态下已存在的违规」：

- `before`：当前 `pendingChanges` 状态下的法规结果（基线）。
- `after`：加上本次 patch 后的法规结果。
- 二者 diff 后，只把 `after` 中**新出现**且与本次编辑相关的硬违规弹确认框 / 亮告警。

若只查 `after`，每次编辑都会把存量违规重复弹出。但两个请求都走 scenario 分支的完整预览
（`loadContext` + `createScenarioTempRoster` + `recalculatePreviewAccRefTz` +
`computeViolations`），一次拖拽 = 2 次场景级重算 → 慢。

## 3. 目标架构

### 3.1 A — 拖拽法规检查快路径（单请求 + 单 Crew 范围）

**客户端 `checkLiveDraftLegality`（`roster-store.ts`，Live/Scenario 共享）改为：**

```
先只发 after。
  after 无违规            → return true（合法拖拽 = 1 次请求）
  after 有违规            → 再发 before，diff 出 relevantNewViolations → 确认框 / 告警
```

- 语义不变（`if (afterResult.violations.length === 0) return true` 已是快路径，补 before 为懒加载）。
- `syncPeriodGdoSessionViolations`、`showConfirmDialog` 等告警行为保留。

**服务端 `previewDraftLegality`（`live-server/src/services/rule/legality-preview.ts:436`）
scenario 分支确认/收紧作用域：**

- `createScenarioTempRoster` 已按 `affectedCrewIds` 限定 temp roster（被拖 crew + 该 pairing
  配对机组），确认不扩为全场景。
- `recalculatePreviewAccRefTz` 已只算 temp roster 的 duty；确认 pairing_segment 查询只按
  被触及 pairing 过滤，不扫全 scenario。
- 实施时以 SIT 实测为验收：单 crew 拖拽的 `preview-draft` 请求 + 前端重绘 ≤ 100ms。
  若 >300ms，回评叠加「乐观绘制 + 异步检查」。

### 3.2 B — Scenario 分配职级门禁（assign 前置，新增）

拖拽 assign（`scenario-edit-controller.ts` 的 `roster-assign`）在 `previewScenarioPatch`
**之前**执行职级解析 + Open 槽位门禁：

```
1. validRanks = crew.ranks 历史中 eff_dt <= 任务日期 && (exp_dt 为空 或 任务日期 < exp_dt)
   ├─ 空 → notify「CrewRank 数据无效，不能分配」→ 停止
2. openSlots = pairing.compositions 中 plan > fill（fill 用本地有效 assignments 算）
   ├─ 空 → notify「该 Pairing 位置已满」→ 停止
3. 解析 actingRank：
   ├─ validRanks 中优先取与某 openSlot.rank 匹配的（多个匹配 → rank.display_order 最小者）
   └─ 无匹配 → 取 eff_dt 最新的一条（= 跨职级）
4. 若 3 的 actingRank ∉ openSlots 的 rank 集合（跨职级）：
   ├─ 弹确认框「是否进行跨职级分配」
   ├─ OK → actingRank = openSlots 中 rank.display_order 最小的槽位 rank
   └─ 取消 → 不分配
5. 通过 → patch 携带 rosterActingRank → 合法性快路径 → addPatch
```

- **任务日期** = 被拖 pairing 的 `schStrDtUtc` 日期。
- **display_order**：`GET /api/rank` → `reference-store.ranks`（`RankOption.displayOrder`），
  门禁前确保 `useReferenceStore.getState().loaded`，否则 `load()`；未就绪时回退 composition 顺序。
- **reassign**（roster 拖到另一 crew）：目标 crew 对 pairing 当前有效 Open 槽位复用同一套解析，
  与 assign 一致；如实现中发现 reassign 语义需单独处理，在 plan 阶段收窄为 assign-only。
- **跨职级确认框**：新建 `AppDialog`（`@rois/ui`）基础的 promise 式确认组件
  （`showConfirmDialog` 只接受 `RuleViolation[]`，不通用）。遵守 §Pop-up Window Standard。

### 3.3 C — Scenario Roster Header 动态 Rank/Base（对齐 Live）+ Pairing 本地配比

#### C1 服务端下发 crew 历史

`scenario-gantt-service.ts` / `scenario-gantt-db-service.ts` 的 gantt 数据构建，为场景内机组附带
完整 `crew_rank` + `crew_base` 历史（按场景时间窗，取自 live 表）：

```
ScenarioGanttCrew 增加：
  ranks?: CrewRankRecord[]   // { crewId, rank, effDt, expDt }
  bases?: CrewBaseRecord[]   // { crewId, base, effDt, expDt }
```

与 Live `useCrewStore` 的 `crew.ranks`/`crew.bases` 同构（`gantt/src/types/crew.ts:54`）。

#### C2 客户端 Header 按视口最左日期解析

`scenario-gantt-source.ts` 的 `useRosterModel`（panel 行构建）：

- 计算 `viewportLeftDate`：与 Live `live-gantt-source.ts:689-693` 同式
  （`xToTime(scrollX, strDtLoc, pxPerHour)` → `calendarDateInTimeZone` → `calendarDateToUtcMidnight`），
  scenario 的 scrollX/pxPerHour 在 scenario-gantt-store，strDtLoc 在 data，timezone 在 timezone-store。
- 面板行 rank/base 用 `getAllEffective(crew.ranks, viewportLeftDate)` / `getAllEffective(crew.bases,
  viewportLeftDate)`，多记录 `|` 拼接；无历史回退 `c.crewRank ?? c.rank` / `c.base`。
- 与 Live `buildPanelRows`（`live-gantt-source.ts:583-588`）一致，随最左日期动态变化。

#### C3 Pairing 配比本地实时计算（只改 Pairing pane）

- `AssignmentPatch` 增加 `rosterActingRank?: string`；`buildEffectiveAssignments`
  （`build-scenario-roster-items.ts:31`）与 `applyScenarioPatchesToData`
  （`scenario-roster-edit.ts:43`）把补丁 rank 带进有效 assignments。
- 新增纯函数 `computeScenarioPairingCompositions(effectiveAssignments, crew, pairings)`
  → `Map<pairingId, { rank, plan, fill }[]>`，按 `(pairingId, rank)` 统计 distinct crew，
  rank = `rosterActingRank ?? rank ?? crewRank`（与 server `recomputeCompositionFill` 一致，
  `scenario-gantt-service.ts:678-707`）。
- `buildPairingItems`（`scenario-pairing-adapter.ts:99`）增加可选 `fillOverrides` 参数：
  传入则用本地 fill 覆盖 `c.fill`；不传维持 server fill（`gantt-day-statistics-dialog.tsx:78`
  等其它调用点不受影响）。
- `makeScenarioPairingPaneSource.useRows` 订阅 `pendingChanges`，用
  `buildEffectiveAssignments(data.assignments, pendingChanges)` + `data.crew` 算 fillOverrides。
- 覆盖 filter / `isFull` 自动跟随。**不依赖 DB fill**；服务端 fill 持久化保留，供 KPI worker
  （`syncScenarioPairingKpisFromDb`）使用。

#### C4 服务端 patch 应用写入 roster_acting_rank

`scenario-patch-service.ts` 的 `add`（含 revive 软删行）与 `reassign` 分支，把补丁的
`rosterActingRank` 写入 `roster_flight.roster_acting_rank`（替换硬编码 `NULL`/`p.division` 位置），
使 fill 计入对应槽位。

### 3.4 D — 跨用户 Roster 同步（广播 patches + 未打开跳过）

**服务端 `POST /:id/patch-output`**（`scenario.ts:1620-1682`）补丁应用成功后：

```
wsBroadcast(airlineSchema, { type: 'scenario-roster-updated', scenarioId, patches }, editorUserId)
```

- `wsBroadcast(schema, msg, excludeUserId)` 排除编辑者本人（`websocket.ts:158`），避免重复应用；
  同用户多标签同被排除（同 userId）。
- `patches` 即本次应用成功的 `AssignmentPatch[]`。

**客户端 `use-scenario-ws-updates.ts`** 新增分支：

```
if (m.type === 'scenario-roster-updated' && Number(m.scenarioId) === scenarioId) {
  const store = getScenarioGanttStore(scenarioId).getState()
  if (!store.data) return            // 未打开 / 未加载 → 跳过，打开时全量加载
  const next = applyScenarioPatchesToData(store.data, m.patches)
  if (next !== store.data) store.setState({ data: next, dataRevision: store.dataRevision + 1 })
}
```

- `dataRevision++` 触发画布重绘 + 配比/Header 重算。
- 与 GanttSyncManager 缓冲（`gantt-sync-manager.ts`）兼容：未加载期间消息被缓冲，加载后重放。

## 4. 数据流示例

```
拖拽 pairing → Crew（assign）
  1. 职级门禁：解析有效 rank → Open 槽位 → actingRank（可能跨职级确认）→ patch{rosterActingRank}
  2. 合法性快路径：1 次 preview-draft（无违规即过）
  3. addPatch → pendingChanges → useRosterModel/useRows 重算 → 立即绘制 + Header 动态 rank + Pairing fill 本地重算
点 Save → POST /patch-output
  ├─ 应用补丁（含 roster_acting_rank 写入）→ 入队 manday/kpi + 法规
  ├─ wsBroadcast {scenario-roster-updated, patches}（排除编辑者）
  └─ 编辑者本地 applyScenarioPatchesToData → dataRevision++
其他用户（已打开同场景）：
  ├─ 收到 scenario-roster-updated → data 非空 → 本地应用 patches → 重绘 + fill/Header 重算
  └─ data 为空（未打开）→ 跳过，打开时全量加载
manday/kpi/legality worker 完成 → 原有 scenario-* WS 推送 → 定向刷新（现有逻辑）
```

## 5. 错误处理

- 职级门禁：无有效 rank / 无 Open 槽位 → `notify` 明确文案，不产生 patch。
- 跨职级确认取消 → 不分配，无 pending 副作用。
- 合法性快路径失败：沿用现有 `checkLiveDraftLegality` 的 catch → `notify.error`，返回 false。
- 广播 patch 应用：`applyScenarioPatchesToData` 纯函数不抛错；`dataRevision` bump 幂等，重复广播无害
  （`remove` 幂等；`add` 对已存在 (crewId,pairingId) 需幂等去重——见 C3/实施注意）。
- WS 断线：`wsClient` 自动重连 + GanttSyncManager catchup（现有机制）。

## 6. 测试

**后端（Vitest）**：
- `scenario-patch-service`：`add`/`reassign` 断言 `roster_acting_rank` 从补丁写入；
  revive 软删行同样更新 rank。
- `computeScenarioPairingCompositions`（或 client 纯函数单测）：remove/add/reassign 增量、
  rank 回退、多 crew distinct。
- 职级解析纯函数：无有效 rank / 无 Open / 多 rank 匹配（display_order）/ 跨职级。

**前端（Playwright，§Playwright-Required）**：
- 删带环 roster → Pairing pane fill 立即减 1；拖回 → 立即绘制 + fill 恢复。
- Open 满 → 「该 Pairing 位置已满」提示；CrewRank 无效 → 提示。
- 跨职级 → 确认框；OK 后按 Open 槽位 `display_order` 最小者分配。
- Header Rank/Base 随视口最左日期变化（滚动后解析变化）。
- 双端同步：A 保存 → B（已打开同场景）fill/Header 更新；B 未打开 → 收到消息不处理。

**性能验收**：SIT 实测拖拽 → 绘制 ≤ 100ms；`preview-draft` 合法拖拽只发 1 次。

## 7. 实施阶段（供 writing-plans 拆分）

1. **P0 前置**：`checkLiveDraftLegality` 单请求快路径（客户端，Live/Scenario 共享）+ 单测。
2. **P1 服务端**：scenario gantt 数据下发 crew_rank + crew_base 历史（C1）；
   `scenario-patch-service` 写入 `roster_acting_rank`（C4）。
3. **P2 客户端配比**：`AssignmentPatch.rosterActingRank` + `computeScenarioPairingCompositions`
   + `buildPairingItems.fillOverrides` + pairing pane 订阅 pendingChanges（C3）。
4. **P3 职级门禁**：职级解析 + Open 槽位 + 跨职级确认（AppDialog）+ assign 接入（B）。
5. **P4 Header 动态**：`useRosterModel` viewportLeftDate + 动态 rank/base（C2）。
6. **P5 跨用户同步**：server 广播 `scenario-roster-updated` + 客户端应用/跳过（D）。
7. **P6 验收**：SIT 性能实测 + Playwright 全套。

## 8. 不做的事（明确排除）

- 不改 Live 的 assign 职级行为（Live 保持 `panelRank` 直填，门禁仅 Scenario）。
- 不改 Flight pane composition 与 Pairing Info dialog 的 fill 来源（用户确认「只改 Pairing pane」）。
- 不把 DB fill 从服务端移除（KPI worker 依赖）；客户端展示侧不依赖它。
- 不做乐观绘制 + 异步回滚（用户确认保留阻塞检查，先走快路径）。
