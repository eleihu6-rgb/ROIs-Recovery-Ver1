# Scenario Gantt 复用架构 — P2 实施计划（能力后端下发 + pane 可见性门控）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** live-server 的 `GET /api/scenario/:id/gantt-data` 返回体新增 `capabilities`（由 `fileType` + dictionary 派生，代码兜底）；前端 `ScenarioGanttSource.capabilities` 读它取代硬编码；驱动 **pane 可见性**——PO 场景只显示/允许 pairing+flight（无 roster），RO 显示 roster+pairing（允许三者）。编辑门控（canAssign 等）本期只让 capabilities 可用，实际编辑行为留 P3。

**Architecture:** 能力模型区分**允许集** `panes` 与**默认集** `defaultPanes`（RO: allowed=[roster,pairing,flight]/default=[roster,pairing]；PO: allowed=default=[pairing,flight]；TO: 仅预留，全空只读）。后端 `deriveScenarioCapabilities(fileType, dict)` 优先读 dictionary（`parent_code='SCENARIO_CAP_<TYPE>'`），缺失用代码兜底默认；配 seed 脚本写 PO/RO 配置。前端：scenario-gantt-source 读 `data.capabilities`；scenario-gantt-toolbar 的 add-pane 按 `panes` 过滤；scenario-layout-store 在 capabilities 首次到达时按 `defaultPanes` 重建布局、并关闭不在 `panes` 内的 pane。

**Tech Stack:** live-server（Fastify + Drizzle + TS, Vitest）；gantt（React 19 + Vite + TS + Zustand, Vitest）；Playwright e2e。

**上游 spec:** `docs/superpowers/specs/2026-06-14-scenario-gantt-reuse-design.md` §5/§8 phase P2。**前置:** P0+P1 已合并（source 抽象 + 三 pane 共享画布 + scenario-layout-store + 守卫）。

## 设计决策（已定）

1. **PO 默认 pairing+flight**（能力感知默认）→ `GanttCapabilities` 增加 `defaultPanes`。
2. **dictionary 驱动 + 代码兜底 + seed 脚本**（符合 CLAUDE.md 参数化；新航司零代码）。
3. **编辑行为留 P3**：本期 capabilities 的 roster/pairing 编辑 flag 透传但不接线。

## 文件结构

后端（live-server）新增/改：
- `live-server/src/services/scenario/scenario-capabilities.ts`（新）— `deriveScenarioCapabilities(fileType, dictRows)` + `GanttCapabilities` 类型 + 代码兜底默认
- `live-server/src/services/scenario/scenario-gantt-service.ts`（改）— `ScenarioGanttData` 加 `capabilities`；两个 builder 注入
- `live-server/src/routes/scenario/scenario.ts`（改，若需要在 route 取 dict）— 传 dictionary 给 builder（或 builder 内部用 dictionaryService）
- `live-server/src/__tests__/services/scenario/scenario-capabilities.test.ts`（新）— 派生单测
- `sql/seed/`（新增一个幂等 seed 脚本）— `SCENARIO_CAP_PO` / `SCENARIO_CAP_RO`（/`SCENARIO_CAP_TO` 预留）dictionary 配置

前端（gantt）改：
- `gantt/src/components/gantt/source/gantt-pane-source.ts` — `GanttCapabilities` 加 `defaultPanes`；`READ_ONLY_CAPABILITIES` 补字段
- `gantt/src/types/scenario-gantt.ts` — `ScenarioGanttData` 加 `capabilities: GanttCapabilities`
- `gantt/src/components/gantt/source/scenario-gantt-source.ts` — capabilities 读 `data.capabilities ?? READ_ONLY_CAPABILITIES`
- `gantt/src/components/gantt/source/__tests__/gantt-source-context.test.tsx` — stub 补 `defaultPanes`
- `gantt/src/stores/scenario-layout-store.ts` — 新增 `applyCapabilityDefaults(capabilities)` 动作 + add-pane 按 allowed 限制
- `gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx` — add-pane 按钮按 `capabilities.panes` 过滤
- `gantt/src/components/shell/scenario-gantt-view.tsx` — data 到达后调 `applyCapabilityDefaults`
- e2e：`e2e/tests/gantt/scenario-capabilities.spec.ts`（新）

---

## Task 1: 后端 — capabilities 派生 + 注入 gantt-data + seed

**Files:**
- Create: `live-server/src/services/scenario/scenario-capabilities.ts`
- Modify: `live-server/src/services/scenario/scenario-gantt-service.ts`
- Modify: `live-server/src/routes/scenario/scenario.ts`（若 builder 需要 fastify/dict 访问）
- Create: `live-server/src/__tests__/services/scenario/scenario-capabilities.test.ts`
- Create: `sql/seed/NN-scenario-capabilities.sql`（编号接续现有 seed）

- [ ] **Step 1: 读现状**

Read `scenario-gantt-service.ts`（`ScenarioGanttData` 接口 + `buildGanttDataSnapshot` + `buildGanttDataLiveRefresh` 的返回构造 + 它们的 `sc.fileType`）、`live-server/src/services/base/dictionary-service.ts`（`getByParentCode(fastify, parentCode)` 返回 `dictionary` 行，行有 `code`/`codeValue`/`parentCode`）、`live-server/src/routes/scenario/scenario.ts` 的 gantt-data handler（它怎么调 builder、有没有 `fastify` 在手）。确认 dictionary 行字段名（`code`、`codeValue`）。

- [ ] **Step 2: 写能力派生模块**

```ts
// live-server/src/services/scenario/scenario-capabilities.ts
export type ScenarioPaneType = 'roster' | 'pairing' | 'flight'

export interface GanttCapabilities {
  panes: ScenarioPaneType[]          // 允许出现的 pane
  defaultPanes: ScenarioPaneType[]   // 首次打开默认显示的 pane（⊆ panes）
  roster: { canAssign: boolean; canRemove: boolean; canReassign: boolean }
  pairing: { canEditSegments: boolean }
}

/** 代码兜底默认（dictionary 缺失时用）。与 spec §5 表一致；编辑 flag 本期全 false（P3 接线）。 */
const FALLBACK: Record<string, GanttCapabilities> = {
  RO: { panes: ['roster', 'pairing', 'flight'], defaultPanes: ['roster', 'pairing'],
        roster: { canAssign: false, canRemove: false, canReassign: false }, pairing: { canEditSegments: false } },
  PO: { panes: ['pairing', 'flight'], defaultPanes: ['pairing', 'flight'],
        roster: { canAssign: false, canRemove: false, canReassign: false }, pairing: { canEditSegments: false } },
  TO: { panes: [], defaultPanes: [],   // 仅预留，本次不实施
        roster: { canAssign: false, canRemove: false, canReassign: false }, pairing: { canEditSegments: false } },
}

/** dictionary 行（来自 getByParentCode('SCENARIO_CAP_<TYPE>')）reshape 成 GanttCapabilities。
 *  约定 code→codeValue：panes / defaultPanes = 逗号分隔；canAssign/canRemove/canReassign/canEditSegments = '0'|'1'。 */
export function capabilitiesFromDict(rows: { code: string | null; codeValue: string | null }[], fileType: string): GanttCapabilities {
  const fb = FALLBACK[fileType] ?? FALLBACK.RO
  if (!rows || rows.length === 0) return fb
  const map = new Map(rows.filter((r) => r.code).map((r) => [r.code as string, r.codeValue ?? '']))
  const list = (k: string, d: ScenarioPaneType[]): ScenarioPaneType[] => {
    const v = map.get(k); if (v == null) return d
    return v.split(',').map((s) => s.trim()).filter(Boolean) as ScenarioPaneType[]
  }
  const bool = (k: string, d: boolean): boolean => { const v = map.get(k); return v == null ? d : v === '1' || v.toLowerCase() === 'true' }
  return {
    panes: list('panes', fb.panes),
    defaultPanes: list('defaultPanes', fb.defaultPanes),
    roster: { canAssign: bool('canAssign', fb.roster.canAssign), canRemove: bool('canRemove', fb.roster.canRemove), canReassign: bool('canReassign', fb.roster.canReassign) },
    pairing: { canEditSegments: bool('canEditSegments', fb.pairing.canEditSegments) },
  }
}
```

- [ ] **Step 3: 注入 ScenarioGanttData**

在 `scenario-gantt-service.ts`：① `import { GanttCapabilities, capabilitiesFromDict } from './scenario-capabilities'`；② `ScenarioGanttData` 接口加 `capabilities: GanttCapabilities`（放在 `fileType` 之后）；③ 两个 builder（`buildGanttDataSnapshot`/`buildGanttDataLiveRefresh`）的返回对象加 `capabilities`。能力需要 dictionary 行——两个 builder 当前签名是否有 `fastify`？`buildGanttDataLiveRefresh` 有 `fastify`，`buildGanttDataSnapshot` 没有。两种处理（择一，实现时按现状定）：
  - (a) 在 **route handler**（`scenario.ts`）里 `const dictRows = await dictionaryService.getByParentCode(fastify, 'SCENARIO_CAP_' + sc.fileType)`，把 `capabilitiesFromDict(dictRows, sc.fileType)` 算好后 `data.capabilities = caps`（在 `success(reply, data)` 之前）。**推荐**——避免改 builder 签名，且 route 已有 `fastify`。
  - (b) 给 `buildGanttDataSnapshot` 也传 `fastify`。
  采用 (a)：在 route 里算 capabilities 并挂到 data。builder 的返回类型 `ScenarioGanttData` 仍需 `capabilities` 字段——给 builder 内部先填兜底 `capabilitiesFromDict([], sc.fileType)`，route 再用 dictionary 覆盖。这样类型完整且 route 决定最终值。

- [ ] **Step 4: 单测**

`scenario-capabilities.test.ts`（Vitest，纯函数）：
```ts
import { describe, it, expect } from 'vitest'
import { capabilitiesFromDict } from '../../../services/scenario/scenario-capabilities'
describe('capabilitiesFromDict', () => {
  it('falls back to code defaults when dict empty — PO', () => {
    const c = capabilitiesFromDict([], 'PO')
    expect(c.panes).toEqual(['pairing', 'flight'])
    expect(c.defaultPanes).toEqual(['pairing', 'flight'])
  })
  it('RO default shows roster+pairing but allows flight', () => {
    const c = capabilitiesFromDict([], 'RO')
    expect(c.panes).toEqual(['roster', 'pairing', 'flight'])
    expect(c.defaultPanes).toEqual(['roster', 'pairing'])
  })
  it('dictionary overrides fallback', () => {
    const rows = [{ code: 'panes', codeValue: 'pairing' }, { code: 'canEditSegments', codeValue: '1' }]
    const c = capabilitiesFromDict(rows, 'PO')
    expect(c.panes).toEqual(['pairing'])
    expect(c.pairing.canEditSegments).toBe(true)
    expect(c.defaultPanes).toEqual(['pairing', 'flight']) // 未覆盖 → 兜底
  })
})
```
若改了 route，加/扩 route 集成测试断言响应含 `capabilities`（按 `scenario.ts` 现有测试范式；若无则单测足够）。

- [ ] **Step 5: seed 脚本（幂等）**

Read `sql/seed/` 现有脚本的编号与 `dictionary` INSERT 范式（含 `parent_code`/`code`/`code_value`/`filiale` 默认、`ON CONFLICT DO NOTHING`）。新增 `sql/seed/NN-scenario-capabilities.sql`，写入 `parent_code='SCENARIO_CAP_RO'` 与 `'SCENARIO_CAP_PO'` 的行（panes / defaultPanes / canAssign / canRemove / canReassign / canEditSegments），值与 FALLBACK 一致。顶部注释说明用途+参数清单+修改记录（CLAUDE.md seed 规范）。`TO` 可留注释占位不写（仅预留）。

- [ ] **Step 6: 验证 + Commit**

Run: `cd /home/yuan.z/rois/rois-ai/live-server && npx vitest run src/__tests__/services/scenario/scenario-capabilities.test.ts` → 绿。
Run: `npm test 2>&1 | tail -8` → live-server 全测试不回归。
Run: `npx tsc --noEmit 2>&1 | tail -5` → 无新错误。
```bash
git add live-server/src/services/scenario/scenario-capabilities.ts live-server/src/services/scenario/scenario-gantt-service.ts live-server/src/routes/scenario/scenario.ts live-server/src/__tests__/services/scenario/scenario-capabilities.test.ts sql/seed/NN-scenario-capabilities.sql
git commit -m "feat(live-server): scenario gantt-data 下发 capabilities（fileType+dictionary 派生，代码兜底）+ seed"
```

---

## Task 2: 前端 — 类型对齐 + source 读 capabilities

**Files:**
- Modify: `gantt/src/components/gantt/source/gantt-pane-source.ts`
- Modify: `gantt/src/types/scenario-gantt.ts`
- Modify: `gantt/src/components/gantt/source/scenario-gantt-source.ts`
- Modify: `gantt/src/components/gantt/source/__tests__/gantt-source-context.test.tsx`

- [ ] **Step 1: GanttCapabilities 加 defaultPanes**

`gantt-pane-source.ts`：`GanttCapabilities` 接口加 `defaultPanes: Array<'roster' | 'pairing' | 'flight'>`（在 `panes` 之后）。`READ_ONLY_CAPABILITIES` 加 `defaultPanes: ['roster', 'pairing', 'flight']`（Live 不用布局，值无所谓，与 panes 一致即可）。

- [ ] **Step 2: ScenarioGanttData 加 capabilities**

`gantt/src/types/scenario-gantt.ts`：`import type { GanttCapabilities } from '@/components/gantt/source/gantt-pane-source'`；`ScenarioGanttData` 加 `capabilities: GanttCapabilities`（紧跟 `fileType`）。（注意循环依赖：gantt-pane-source 已 `import type` scenario 的 PanelRowData？不——它 import 自 pane-header-canvas/column。确认无循环；若有循环，把 `GanttCapabilities` 抽到一个独立小类型文件 `@/types/gantt-capabilities.ts` 并两处 import。实现时先试直接 import，tsc 报循环再抽离。）

- [ ] **Step 3: scenario-gantt-source 读 data.capabilities**

`scenario-gantt-source.ts`：当前 `capabilities: READ_ONLY_CAPABILITIES`。改为从 store 的 data 读：在 `useMemo` 工厂里 capabilities 不能是静态值（要随 data 变）——但 source 对象是 `useMemo([scenarioId])` 稳定的。capabilities 是非 hook 字段。两种：
  - (a) 把 `capabilities` 做成 getter：但接口 `capabilities` 是值不是函数。
  - (b) 让 source 的 capabilities 读 `getScenarioGanttStore(scenarioId).getState().data?.capabilities ?? READ_ONLY_CAPABILITIES`，在 useMemo 工厂内**于对象构造时**取一次——但 data 首帧为 null。
  正确做法：capabilities 改为在工厂里用 getter 语义。最简：把返回对象的 `capabilities` 定义为一个 **getter 属性**：
  ```ts
  return {
    mode: 'scenario',
    // …其它…
    get capabilities() {
      return getScenarioGanttStore(scenarioId).getState().data?.capabilities ?? READ_ONLY_CAPABILITIES
    },
  } as GanttPaneSource
  ```
  getter 每次读最新 data.capabilities，避免 data 异步到达的时序问题。确认消费方读 `source.capabilities` 是即时读（非订阅）——pane 可见性由 §Task3 的 view-level effect 驱动（订阅 data），故 source.capabilities 作为即时读足够。

- [ ] **Step 4: 修 stub**

`gantt-source-context.test.tsx` 的 `stubSource` 加 `defaultPanes` 到 capabilities（或因 READ_ONLY_CAPABILITIES 已含则无需）。`live-gantt-source.test.ts`/`scenario-gantt-source.test.ts` 若断言 capabilities 形状，补 `defaultPanes`。

- [ ] **Step 5: 验证 + Commit**

Run: `cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep -vE "node:fs|node:path|node:url"` → 干净。
Run: `npx vitest run src/components/gantt/source/` → 绿。
```bash
git add gantt/src/components/gantt/source/gantt-pane-source.ts gantt/src/types/scenario-gantt.ts gantt/src/components/gantt/source/scenario-gantt-source.ts gantt/src/components/gantt/source/__tests__/
git commit -m "feat(gantt): GanttCapabilities 加 defaultPanes；ScenarioGanttData 含 capabilities；scenario source 读 data.capabilities"
```

---

## Task 3: pane 可见性门控（add-pane 过滤 + 布局按能力调和）

**Files:**
- Modify: `gantt/src/stores/scenario-layout-store.ts`
- Modify: `gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx`
- Modify: `gantt/src/components/shell/scenario-gantt-view.tsx`

- [ ] **Step 1: 读现状**

Read `scenario-layout-store.ts`（`makeDefault`、`addPane`、`closePane`、`grid`/`panes`/`counters`）、`scenario-gantt-toolbar.tsx`（add-pane 按钮 `['roster','pairing','flight'].map`、`openPaneTypes`、`onAddPane`、它从哪取 data/capabilities）、`scenario-gantt-view.tsx`（data 加载、怎么把 props 传给 toolbar/grid）。

- [ ] **Step 2: layout-store 新增 applyCapabilityDefaults + addPane 限制**

加动作：
```ts
applyCapabilityDefaults: (caps: { panes: ScenarioPaneType[]; defaultPanes: ScenarioPaneType[] }) => void
```
实现：① **只在首次**应用（store 加私有 flag `capabilitiesApplied: boolean`，初值 false）。首次：把 grid/panes **重建**为恰好 `defaultPanes`（按顺序放入网格，复用 makeDefault 的网格摆放规则），置 `capabilitiesApplied=true`。② 非首次（用户已交互后再次 load）：仅**关闭**类型 ∉ `caps.panes` 的现存 pane（enforce allowed），不动用户已开的合法 pane。
`addPane(type)` 开头加 guard：若调用方未先校验，仍可在 store 层拒绝——但 allowed 校验主要在 toolbar（Step 3）；store 的 addPane 可接受一个可选 allowed 检查或交给 UI。保持 store 简单：addPane 不强加 allowed（UI 已过滤），但 `applyCapabilityDefaults` 的关闭逻辑兜底。

> 重建网格时复用现有 `makeDefault` 的摆放（每个 pane 占一行的现状）；`defaultPanes=['pairing','flight']` → grid `[[pairing-1,null],[flight-1,null]]` + panes Map 含两者 + counters 更新。实现时严格按 store 现有 grid 结构构造，避免破坏 movePane/closePane 的不变量。

- [ ] **Step 3: toolbar add-pane 按 capabilities.panes 过滤**

`scenario-gantt-toolbar.tsx`：把 `(['roster','pairing','flight'] as const)` 改为按 `capabilities.panes` 过滤。capabilities 来源：toolbar 接收一个 `allowedPanes: ScenarioPaneType[]` prop（由 view 从 `data.capabilities.panes` 传入），`.filter((type) => allowedPanes.includes(type))`。PO 场景 → roster 按钮不出现。

- [ ] **Step 4: view 在 data 到达后应用默认**

`scenario-gantt-view.tsx`：新增 effect，当 `data?.capabilities` 可用时调用该 scenario 的 `getScenarioLayoutStore(scenarioId).getState().applyCapabilityDefaults(data.capabilities)`（只跑一次靠 store 内 flag 守卫）。并把 `allowedPanes={data?.capabilities?.panes ?? ['roster','pairing','flight']}` 传给 toolbar。
```ts
useEffect(() => {
  const caps = data?.capabilities
  if (caps) getScenarioLayoutStore(scenarioId).getState().applyCapabilityDefaults(caps)
}, [data?.capabilities, scenarioId])
```

- [ ] **Step 5: 验证（含 e2e）**

Run: `cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit | grep -vE "node:fs|node:path|node:url"` → 干净。`npx vitest run src/components/gantt/source/ src/components/scenario-gantt/` → 绿。`npm run build` → 成功。
手动/e2e 预检（栈在跑，`GANTT_TEST_PASS=admin123`）：打开一个 PO 场景应无 roster pane（pairing+flight），RO 场景有 roster。e2e 在 Task4 正式写。

- [ ] **Step 6: Commit**

```bash
git add gantt/src/stores/scenario-layout-store.ts gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx gantt/src/components/shell/scenario-gantt-view.tsx
git commit -m "feat(gantt): scenario pane 可见性按 capabilities 门控（add-pane 过滤 + 布局按 defaultPanes 调和）"
```

---

## Task 4: 能力门控 e2e + 版本号

**Files:**
- Create: `e2e/tests/gantt/scenario-capabilities.spec.ts`
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: 找真实 PO/RO 演示场景**

栈在跑（`GANTT_TEST_PASS=admin123`）。已知 RO DONE 场景 id 6=`RO-2026-06 YEG Test---`。需要一个 PO 场景：查 `GET /api/scenario?pageSize=30`（带 admin token，token 在 `data.token`），挑一个 DONE 的 PO（如 id 4=`4-PO-2026-03 Mar Final`）。确认其 gantt-data 能打开（PO 引擎产物存在；若 502 则 mock，参照 `scenario-source-geometry.spec.ts` 的 mock 范式——但 mock 时要让响应含 `capabilities`，否则前端走兜底）。

- [ ] **Step 2: 写 e2e（Scen-2xxx 前缀）**

```ts
// e2e/tests/gantt/scenario-capabilities.spec.ts
// Scen-2008: PO 场景只显示 pairing+flight（无 roster pane / 无 roster add 按钮）；
// Scen-2009: RO 场景显示 roster pane、roster add 按钮存在。
// 用 render-stats（window.__ganttTest.render()）+ testid 断言：
//  - PO: 无 paneType 'scenario-roster' 的渲染回执；toolbar 无 [data-testid="sg-add-pane-roster"]；有 pairing/flight。
//  - RO: 有 'scenario-roster' 回执（roster-1）。
// 若用 mock，MOCK_GANTT_DATA 必须含 capabilities（PO: panes/defaultPanes=['pairing','flight']）+ fileType/scenarioStrDt/scenarioEndDt。
```
断言具体（§No-Illusion / CLAUDE.md 反模式）：用 `toHaveCount(0)` 断言 PO 无 roster add 按钮、render-stats 无 scenario-roster 条目；RO 有。

- [ ] **Step 3: 跑 e2e + 回归**

Run: `cd /home/yuan.z/rois/rois-ai && GANTT_TEST_PASS=admin123 npm --prefix e2e run test:gantt -- scenario-capabilities --reporter=line` → 绿（粘贴回执）。
Run: `GANTT_TEST_PASS=admin123 npm --prefix e2e run test:gantt -- scenario-source-geometry scenario-roster-shared-canvas perf-scenario-canvas-raf --reporter=line` → 全绿（PO/RO 门控不破坏既有）。

- [ ] **Step 4: 版本号 + Commit**

`gantt/src/version.ts`：前端 + 后端均改 → `FRONTEND_VERSION` +1 **且** `BACKEND_VERSION` +1（本期改了 live-server）。
```bash
git add gantt/src/version.ts e2e/tests/gantt/scenario-capabilities.spec.ts
git commit -m "test(e2e): scenario 能力门控（PO 无 roster / RO 有 roster）；版本号 +前后端"
```

---

## 收尾验证

- [ ] `cd live-server && npm test` → 绿；`npx tsc --noEmit` → 干净
- [ ] `cd gantt && npx tsc --noEmit && npx vitest run && npm run build` → 全绿
- [ ] `GANTT_TEST_PASS=admin123 npm --prefix e2e run test:gantt -- scenario-capabilities scenario-source-geometry scenario-roster-shared-canvas --reporter=line` → 全绿
- [ ] 粘贴 PASS 汇总

## 风险

- **循环依赖**（ScenarioGanttData ↔ GanttCapabilities）：若 tsc 报循环，把 `GanttCapabilities` 抽到 `@/types/gantt-capabilities.ts`（Task2 Step2 已备选）。
- **布局调和时序**：`applyCapabilityDefaults` 必须幂等且只在首次重建（flag 守卫），否则用户每次切 tab / data 刷新会重置其自定义布局。Task3 Step2 已要求 flag。
- **PO gantt-data 可用性**：PO 引擎产物若在 demo DB 缺失（502），e2e 用 mock（含 capabilities）。
- **后端 capabilities 时序**：route 用 dictionary 覆盖 builder 兜底——确认 route 一定执行覆盖（即使 dictionary 空，capabilitiesFromDict([] ) 返回兜底，与 builder 内兜底一致，幂等安全）。

## 后续（不在本计划）

- **P3**：编辑 + rule-check 接线——读 `capabilities.roster.canAssign/canRemove/canReassign` 与 `capabilities.pairing.canEditSegments` 门控 drag/context-menu/segment 编辑；patch 模型扩展；复用 Live rule-check（注意 `violations?.useViolations` 是 hook，不能条件调用——设计成恒存在+空默认或无条件调用）。
- 可选：6-13 文档的 Shell 层（共享 toolbar/filter UI）。
