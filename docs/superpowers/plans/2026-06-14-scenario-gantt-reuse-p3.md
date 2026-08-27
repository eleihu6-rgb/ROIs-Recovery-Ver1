# Scenario Gantt 复用架构 — P3 实施计划（RO Roster 编辑 + rule-check 复用）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RO 场景的 Scenario Roster 支持编辑——**新分配 pairing（assign）、删除已优化 pairing（remove）、改派（reassign）**，复用 Live 的规则引擎做 pre-check 并在 canvas 上画违规 badge；编辑经乐观 patch（`pendingChanges`）+ 现有 `patch-output` 落盘（改 output.gz ASSIGNMENTS 段）。**Scenario-only**：新增 ScenarioEditController + ScenarioViolationSource，scenario pane 交互回调走它们；**Live 编辑代码不动**。**PO 航段编辑不在本期**（拆 P4，依赖航段落盘决策）。

**Architecture:** 编辑由 capabilities 门控（RO 的 `roster.canAssign/canRemove/canReassign`，本期启用为 true）。`source.edit`（ScenarioEditController）把 `GanttEditOp`（roster-assign/remove/reassign）映射成 `AssignmentPatch` → `scenarioGanttStore.addPatch`（乐观更新 `pendingChanges`，roster 经 `buildScenarioRosterItems` 已支持 patch 重算）。编辑后调 `source.violations.runPreCheck` → per-scenario 违规 store 更新 → scenario roster pane 在组件体**无条件**从该 store 构建 `violationMap` 传入共享 `renderRosterTasks`（规避条件 hook）。违规 store 复用 `ruleApi.batchCheck('/check/batch')`（引擎对 Live/Scenario 无差别）。编辑需持有 edit lock（scenario 已有 acquire/lock-status；patch-output 后端校验锁）。

**Tech Stack:** gantt（React 19 + Vite + TS + Zustand, Vitest）；live-server（仅 capabilities flag 改 + seed）；Playwright e2e。

**上游 spec:** `docs/superpowers/specs/2026-06-14-scenario-gantt-reuse-design.md` §6。**前置:** P0-P2 已合并（source 抽象 + 三 pane 共享 + 能力下发 + scenario roster 共享画布 + buildScenarioRosterItems）。

**关键决策（已定）:** P3=只做 RO roster 编辑；Scenario-only edit controller（Live 不动）。

**现成基建（探索确认）:**
- 后端 `applyOutputPatch` 已支持 roster `add/remove/reassign`（改 output.gz ASSIGNMENTS）；`patch-output` 路由校验 edit lock。
- 前端 `AssignmentPatch{op:'add'|'remove'|'reassign', crewId, pairingId, toCrewId?}`；`scenarioGanttStore.addPatch/save`（save→patchOutput→重载）。
- `buildScenarioRosterItems` 已按 `pendingChanges` 重算（add/remove/reassign）。
- `ruleApi.batchCheck(ruleGroupCode, items)`；`rule-check-store.preCheck` 逻辑可参照；`RuleViolation{ruleCode,ruleName,severity,canOverride,message,targetId,targetType,...}`；`buildCheckInputs`（roster-to-check-input）。
- 共享 `renderRosterTasks` 已接受 `violationMap: Map<taskId, severity>`；`violation-overlay.drawViolationBadge` 已用。
- drag：`createCrossPaneDragHandler` + `DragProvider`/`useCrossPaneDrag` + `registerPane`；`DragOperation`（move-task/assign-pairing/...）。

## 文件结构

后端（live-server）：
- `scenario-capabilities.ts`（改）— RO 的 `roster.canAssign/canRemove/canReassign` 兜底改 `true`（PO/TO 保持 false）
- `sql/seed/11-scenario-capabilities.sql`（改）— RO 三个 edit flag 改 '1'；新增一条 migration 注释或更新 seed（幂等，注意已 seed 的库需 migration——见 Task1）
- `scenario-capabilities.test.ts`（改）— RO edit flags=true 断言

前端（gantt）新增/改：
- `gantt/src/components/gantt/source/gantt-pane-source.ts`（改）— `GanttEditController`/`GanttEditOp`/`GanttViolationSource` 占位类型升级为 spec §6 正式形态（含 `runPreCheck`、`getContextActions`？见 Task3 决定）
- `gantt/src/stores/scenario-violation-store.ts`（新）— per-scenario 违规 registry store（复用 ruleApi.batchCheck）
- `gantt/src/components/gantt/source/scenario-violation-source.ts`（新）— `useScenarioViolationSource(scenarioId)` 实现 GanttViolationSource
- `gantt/src/components/gantt/source/scenario-edit-controller.ts`（新）— `useScenarioEditController(scenarioId)` 实现 GanttEditController
- `gantt/src/components/gantt/source/scenario-gantt-source.ts`（改）— `edit`/`violations` 由 capabilities 决定是否提供
- `gantt/src/components/scenario-gantt/scenario-roster-pane.tsx`（改）— 交互回调接 edit（right-click remove / drag）；violationMap 从违规 store 构建传入 renderContent；加锁
- `gantt/src/types/scenario-gantt.ts`（可能改）— AssignmentPatch 保持（roster 够用；segment 留 P4）
- e2e：`e2e/tests/gantt/scenario-roster-edit.spec.ts`（新）

> 注：P3 **不**扩展 patch 模型到 segment（P4）；AssignmentPatch 现状（add/remove/reassign）足够 RO roster。

---

## Task 1: 启用 RO roster 编辑能力（后端 + seed + 前端 flag 流通）

**Files:**
- Modify: `live-server/src/services/scenario/scenario-capabilities.ts`
- Modify: `sql/seed/11-scenario-capabilities.sql`（+ 视情况新增 migration）
- Modify: `live-server/src/__tests__/services/scenario/scenario-capabilities.test.ts`

- [ ] **Step 1: 后端 FALLBACK 改 RO edit flags**

`scenario-capabilities.ts` 的 `FALLBACK.RO.roster` 改为 `{ canAssign: true, canRemove: true, canReassign: true }`（PO/TO 保持全 false）。`canEditSegments` 仍 false（P4）。

- [ ] **Step 2: seed + migration**

`sql/seed/11-scenario-capabilities.sql` 把 `SCENARIO_CAP_RO` 的 `canAssign`/`canRemove`/`canReassign` 的 `code_value` 从 `'0'` 改 `'1'`。**注意幂等性**：seed 用 `ON CONFLICT DO NOTHING`，已 seed 的库不会更新——新增一个 migration `sql/migration/NN-scenario-cap-ro-edit.sql`（`UPDATE dictionary SET code_value='1' WHERE parent_code='SCENARIO_CAP_RO' AND code IN ('canAssign','canRemove','canReassign')`），按 `sql/migration/` 现有范式 + 注释。（读 `sql/migration/` 确认编号与格式。）

- [ ] **Step 3: 单测改**

`scenario-capabilities.test.ts`：RO fallback 断言 `roster.canAssign===true` 等；PO 仍 false。

- [ ] **Step 4: 验证 + Commit**

`cd live-server && npx vitest run src/__tests__/services/scenario/scenario-capabilities.test.ts` → 绿。`npm test` 不回归。`npx tsc --noEmit` 无新错误。
```bash
git add live-server/src/services/scenario/scenario-capabilities.ts live-server/src/__tests__/services/scenario/scenario-capabilities.test.ts sql/
git commit -m "feat(live-server): 启用 RO scenario roster 编辑能力（capabilities + seed/migration）"
```

---

## Task 2: ScenarioViolationSource（per-scenario 违规 store，复用规则引擎）

**Files:**
- Create: `gantt/src/stores/scenario-violation-store.ts`
- Create: `gantt/src/components/gantt/source/scenario-violation-source.ts`
- Modify: `gantt/src/components/gantt/source/gantt-pane-source.ts`（升级 GanttViolationSource 类型）
- Test: `gantt/src/components/gantt/source/__tests__/scenario-violation-source.test.ts`

- [ ] **Step 1: 读 Live 范式**

Read `gantt/src/stores/rule-check-store.ts`（`preCheck`/`runChecks`/`violations: Map<'type:id', RuleViolation[]>`/accessors `getViolations`），`gantt/src/services/rule-api.ts`（`batchCheck(ruleGroupCode, items)`），`gantt/src/utils/roster-to-check-input.ts`（`buildCheckInputs`/`CheckInput`），`gantt/src/components/panes/roster-pane.tsx` 的 violationMap memo（如何从 violations 构建 `Map<taskId, severity>`），`gantt/src/types/rule-check.ts`。

- [ ] **Step 2: GanttViolationSource 类型升级**

`gantt-pane-source.ts`：把占位 `GanttViolationSource { useViolations: (...) => unknown[] }` 升级为 spec §6：
```ts
export interface GanttViolationSource {
  useViolations: (targetType: 'roster' | 'pairing' | 'crew', targetId: string) => RuleViolation[]
  runPreCheck: (affectedCrewIds: string[], simulated: RosterItem[], current?: RosterItem[]) => Promise<PreCheckResult>
}
```
import `RuleViolation`/`PreCheckResult` from `@/stores/rule-check-store`（或 types/rule-check）。**注意循环依赖**：若 gantt-pane-source import rule-check-store 造成循环，把 `RuleViolation`/`PreCheckResult` 移到 `@/types/rule-check.ts` 并两处 import。

- [ ] **Step 3: per-scenario 违规 store**

`scenario-violation-store.ts`：registry 模式（`getScenarioViolationStore(scenarioId)`，与 scenario-gantt-store 同范式），状态 `violations: Map<string,RuleViolation[]>`（键 `targetType:targetId`），动作：
```ts
runPreCheck(affectedCrewIds, simulatedItems, currentItems?) => Promise<PreCheckResult>  // 复用 rule-check-store 的 runChecks 逻辑：buildCheckInputs(simulatedItems) → ruleApi.batchCheck(ruleGroupCode, items) → 解析成 RuleViolation[]，写入 violations map（按 crew/pairing/roster 键）
getViolations(targetType, targetId) => RuleViolation[]
clear() => void
```
`ruleGroupCode` 取自 Live 的 `rule-check-store.ruleGroupCode`（同一选择；引擎无差别）——直接 `useRuleCheckStore.getState().ruleGroupCode`。**复用** rule-check-store 的 `runChecks`/解析逻辑：若可直接调用 rule-check-store 的内部 helper 则复用；否则把 build→batchCheck→parse 抽成共享 util `runRuleBatch(ruleGroupCode, items, ...)` 供两处用（DRY，CLAUDE.md 代码复用规范）。优先抽共享 util。

- [ ] **Step 4: ScenarioViolationSource 适配器**

`scenario-violation-source.ts`：
```ts
export const useScenarioViolationSource = (scenarioId: number): GanttViolationSource => useMemo(() => {
  const useStore = getScenarioViolationStore(scenarioId)
  return {
    useViolations: (targetType, targetId) => useStore((s) => s.violations.get(`${targetType}:${targetId}`) ?? EMPTY),
    runPreCheck: (crewIds, simulated, current) => getScenarioViolationStore(scenarioId).getState().runPreCheck(crewIds, simulated, current),
  }
}, [scenarioId])
```
`EMPTY` 为模块级稳定空数组。

- [ ] **Step 5: 测试**

`scenario-violation-source.test.ts`（manual createRoot/act 范式，mock `ruleApi.batchCheck`）：runPreCheck 调 batchCheck 并把违规写入 store，useViolations 读回对应 target 的违规；空时返回稳定空数组。

- [ ] **Step 6: 验证 + Commit**

`cd gantt && npx tsc --noEmit | grep -vE node:` 干净；`npx vitest run src/components/gantt/source/ src/stores/` 绿。
```bash
git add gantt/src/stores/scenario-violation-store.ts gantt/src/components/gantt/source/scenario-violation-source.ts gantt/src/components/gantt/source/gantt-pane-source.ts gantt/src/components/gantt/source/__tests__/scenario-violation-source.test.ts gantt/src/types/rule-check.ts 2>/dev/null
git commit -m "feat(gantt): ScenarioViolationSource — per-scenario 违规 store 复用规则引擎 batchCheck"
```

---

## Task 3: ScenarioEditController + 接线 scenario roster 编辑

**Files:**
- Create: `gantt/src/components/gantt/source/scenario-edit-controller.ts`
- Modify: `gantt/src/components/gantt/source/gantt-pane-source.ts`（GanttEditController 类型，若需 getContextActions）
- Modify: `gantt/src/components/gantt/source/scenario-gantt-source.ts`（按 capabilities 提供 edit/violations）
- Modify: `gantt/src/components/scenario-gantt/scenario-roster-pane.tsx`（交互接 edit + violationMap + 锁）

- [ ] **Step 1: 读现状**

Read `scenario-roster-pane.tsx`（P1 后的只读交互回调、renderContent、buildScenarioRosterItems、selectedTaskIds）；`scenario-gantt-store.ts`（addPatch/save/lockStatus/acquireLock）；`gantt-pane-source.ts`（GanttEditController/GanttEditOp 占位）；Live 的 `app-layout.tsx executeDragOperation` + `context-menu.tsx`（编辑动作范式）；`drag-context.tsx`/`drag-handler.ts`（cross-pane drag 如何 register/start/complete）。

- [ ] **Step 2: ScenarioEditController**

`scenario-edit-controller.ts`：
```ts
export const useScenarioEditController = (scenarioId: number): GanttEditController => useMemo(() => ({
  execute: async (op: GanttEditOp) => {
    const store = getScenarioGanttStore(scenarioId).getState()
    const caps = store.data?.capabilities
    // 能力门控：不允许则忽略（drag 命中阶段也会拒绝）
    if (op.type === 'roster-assign')   { if (!caps?.roster.canAssign)   return; store.addPatch({ op: 'add',      crewId: op.toCrewId, pairingId: op.pairingId }) }
    if (op.type === 'roster-remove')   { if (!caps?.roster.canRemove)   return; store.addPatch({ op: 'remove',   crewId: op.crewId,  pairingId: op.pairingId }) }
    if (op.type === 'roster-reassign') { if (!caps?.roster.canReassign) return; store.addPatch({ op: 'reassign', crewId: op.fromCrewId, pairingId: op.pairingId, toCrewId: op.toCrewId }) }
    // segment ops（P4）：忽略
    // 编辑后乐观重算（buildScenarioRosterItems 读 pendingChanges 已自动），触发 pre-check（异步，不阻塞 UI）
    // 由 pane 在 pendingChanges 变化的 effect 里调 runPreCheck（见 Step 5），或这里直接调：
  },
}), [scenarioId])
```
（`getContextActions` 是否需要：本期 context-menu 直接在 pane 里按 capabilities 渲染 remove 项即可，不一定要 `getContextActions`。GanttEditController 本期只需 `execute`。若加 getContextActions 则一并定义；否则保持 `{ execute }`。推荐保持最小 `{ execute }`，context-menu 逻辑在 pane 内门控。）

- [ ] **Step 3: scenario-gantt-source 提供 edit/violations（按能力）**

`scenario-gantt-source.ts`：注入 `edit` 与 `violations`。注意 source 是 `useMemo([scenarioId])`，而 edit/violation controller 也是 per-scenario 稳定的——可在 source 工厂里构造，或让 source 持有 controller 引用。简化：source 增加 `edit`/`violations` 为稳定引用（controller 内部用 getState，不依赖 render）。**能力门控**：`edit` 是否提供可恒提供（execute 内部按 capabilities 拒绝），`violations` 恒提供（read-only 也可显示历史违规）。避免"按能力决定 source 形状导致 hook 条件化"——**source.edit/violations 恒存在**，行为在内部按 capabilities 分流。

- [ ] **Step 4: 接线交互（remove 右键 + drag assign/reassign）**

在 `scenario-roster-pane.tsx`：
- **right-click remove**：`onItemRightClick`（P1 是 no-op）改为：若 `capabilities.roster.canRemove` 且命中 pairing，打开一个最小确认或直接 `source.edit.execute({type:'roster-remove', pairingId, crewId})`。可复用 Live 的 context-menu 组件或一个轻量 scenario 菜单——本期最小化：右键命中 pairing → 直接 execute remove（或一个原生确认）。门控：能力不允许则不显示/不执行。
- **drag**：scenario roster 参与 cross-pane drag 以支持 assign（pairing pane → roster crew）与 reassign（roster crew A → crew B）。**复用 drag-context**：scenario 布局需要一个 `DragProvider`，scenario 各 pane `registerPane`，drop 完成时把 `DragOperation` 映射成 `GanttEditOp` 调 `source.edit.execute`。这是本任务最高风险：
  - 在 scenario-layout-grid（或 scenario-gantt-view）外层包 `<DragProvider>`（一个 scenario 作用域的 cross-pane drag handler，其 `onDragComplete` 把 DragOperation→GanttEditOp→`source.edit.execute`）。
  - scenario roster pane 的 `handleCanvasReady` 里 `crossPaneDrag.registerPane({...})`（参照 Live roster-pane 的 registerPane：getCanvasElement/getScrollY/getRowCount/getRowId）。
  - scenario pairing pane 同样 register（作为 assign 的 drag 源）。
  - 命中阶段按 capabilities 拒绝非法 drop（`onDropTargetChange` 不高亮）。
  - **若 cross-pane drag 接线过重/风险高**，本任务可先只做 **remove（右键）+ reassign（roster 内拖拽，单 pane 内 drag 较简单）**，把 **assign（跨 pane 拖拽）** 拆成 Task3b 独立小步——实现者按复杂度判断，DONE_WITH_CONCERNS 说明拆分。

- [ ] **Step 5: violationMap + pre-check + 锁**

- **violationMap**：pane 组件体内**无条件**调 `source.violations.useViolations(...)`（scenario source 恒提供 violations，规避条件 hook），把违规构建成 `Map<taskId, severity>`（参照 Live roster-pane 的 violationMap memo），传入 renderContent 的 `RosterRenderContext.violationMap`（替换 P1 的 `EMPTY_VIOLATION_MAP`）。
- **pre-check 触发**：`useEffect`，当 `pendingChanges` 变化时，对受影响 crew 调 `source.violations.runPreCheck(affectedCrewIds, built.items)`（built.items 已含 pending 重算）。debounce 可选。
- **锁**：编辑前确保持有 edit lock。`source.edit.execute` 或 pane 在首次编辑时 `getScenarioGanttStore(scenarioId).getState().acquireLock(scenarioId)`（若未持有）。若锁被他人持有，编辑应被禁止（toolbar 已有锁 UI）。最小：execute 前检查 `lockStatus.isOwner`，非 owner 则提示并不执行。

- [ ] **Step 6: 验证**

`cd gantt && npx tsc --noEmit | grep -vE node:` 干净；`npx vitest run src/components/gantt/source/ src/components/scenario-gantt/` 绿；`npm run build` 成功。e2e 正式在 Task4。

- [ ] **Step 7: Commit**

```bash
git add gantt/src/components/gantt/source/scenario-edit-controller.ts gantt/src/components/gantt/source/scenario-gantt-source.ts gantt/src/components/gantt/source/gantt-pane-source.ts gantt/src/components/scenario-gantt/scenario-roster-pane.tsx gantt/src/components/scenario-gantt/scenario-layout-grid.tsx 2>/dev/null
git commit -m "feat(gantt): RO scenario roster 编辑（remove/assign/reassign 经 ScenarioEditController，能力门控 + pre-check + 违规渲染）"
```

---

## Task 4: RO 编辑 e2e + 版本号

**Files:**
- Create: `e2e/tests/gantt/scenario-roster-edit.spec.ts`
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: 写 e2e（Scen-2xxx）**

栈在跑（`GANTT_TEST_PASS=admin123`）。用 RO 场景 id 6（mock gantt-data，capabilities 含 RO edit flags=true）。mock `patch-output` + `acquire-lock`/`lock-status`（返回 isOwner=true）。测试：
- Scen-201x：打开 RO 场景，右键一个 roster pairing → remove → 断言该 pairing 从 crew 行消失（render-stats 或 canvas 几何变化 / pending 计数 > 0）。
- Scen-201x：drag assign（若 Task3 含 assign）→ pairing 出现在目标 crew 行；或 reassign → pairing 从 A 行移到 B 行。
- Scen-201x：编辑后若产生违规，断言违规 badge（render-stats 的 violation 信息，或 mock batchCheck 返回违规 → 断言 canvas 画了 badge——用一个可观测信号）。
- save → patch-output 被调用（mock 断言请求体含正确 patch）。
断言具体（§No-Illusion / CLAUDE.md 反模式）；mock `/check/batch` 返回确定性违规以测 badge。

- [ ] **Step 2: 跑 e2e + 回归**

`cd /home/yuan.z/rois/rois-ai && GANTT_TEST_PASS=admin123 npm --prefix e2e run test:gantt -- scenario-roster-edit --reporter=line` → 绿（粘贴回执）。
回归：`GANTT_TEST_PASS=admin123 npm --prefix e2e run test:gantt -- scenario-capabilities scenario-source-geometry scenario-roster-shared-canvas --reporter=line` → 全绿（编辑不破坏 PO 门控 / 只读路径）。

- [ ] **Step 3: 版本号 + Commit**

`gantt/src/version.ts`：前端 + 后端（本期改了 capabilities flag/seed）均 +1 → FRONTEND +1 且 BACKEND +1。
```bash
git add gantt/src/version.ts e2e/tests/gantt/scenario-roster-edit.spec.ts
git commit -m "test(e2e): RO scenario roster 编辑（remove/assign/reassign + 违规 + save）；版本 +前后端"
```

---

## 收尾验证
- [ ] `cd live-server && npm test`（capability 相关）+ `npx tsc --noEmit` → 无新错误
- [ ] `cd gantt && npx tsc --noEmit && npx vitest run && npm run build` → 全绿
- [ ] `GANTT_TEST_PASS=admin123 npm --prefix e2e run test:gantt -- scenario-roster-edit scenario-capabilities scenario-source-geometry --reporter=line` → 全绿
- [ ] 粘贴 PASS 汇总

## 风险
- **cross-pane drag 接线（Task3 Step4）最高风险**：scenario 需自己的 DragProvider + registerPane。缓解：可先做 remove（右键）+ reassign（单 pane 内 drag），assign 拆 Task3b。逐 commit 可回滚。
- **条件 hook**：source.violations 恒提供、pane 无条件调 useViolations——务必不要 `source.violations?.useViolations()` 条件调用（spec §6 警示）。
- **锁竞争**：非 owner 不可编辑；patch-output 后端已校验锁（409）。前端编辑前检查 isOwner。
- **pre-check 性能**：pendingChanges 每变都 batchCheck 可能频繁——debounce + 只检受影响 crew。
- **seed/migration**：已 seed 的库要 migration 才能让 RO edit flags 生效（Task1 Step2）。

## 后续（不在本计划）
- **P4**：PO 航段编辑（pairing-add-segment/remove-segment）——需先定航段落盘（扩展 applyOutputPatch 改 output.gz 航段段，或 scenario 入库 spec）；patch 模型扩展为 `ScenarioPatch` 判别联合（spec §7）。
- 可选：6-13 文档 Shell 层（共享 toolbar/filter UI）；把 Live 编辑也重构到 GanttEditController（全抽象，spec §6 完整愿景）。
