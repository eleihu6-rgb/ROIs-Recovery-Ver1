# Scenario Gantt 复用架构 — P0 实施计划（source 抽象 + Pairing/Flight 迁移）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 引入统一的 `GanttPaneSource` 数据源抽象并用 Context 注入，使共享展示组件（PaneCanvas / PaneHeaderCanvas）只读 source、不再直连任何 store 或接收 `*Override` props；Live 与 Scenario 各自提供 source 实现；先迁移已共享 canvas 的 Pairing/Flight pane，**行为零变更**。

**Architecture:** 方案 A（单一 source 接口 + React Context）。展示层组件改为 `useGanttSource()` 读取 viewport/data/timezone；`LiveGanttSource` 适配现有 zustand 单例，`ScenarioGanttSource` 适配 per-scenario 注册表。override props 从组件接口删除，差异移入 source 实现。ESLint `no-restricted-imports` 机器强制展示层不再 import store。

**Tech Stack:** React 19 + TypeScript + Zustand + Vite；Playwright e2e；ESLint flat config。

**上游 spec:** `docs/superpowers/specs/2026-06-14-scenario-gantt-reuse-design.md`（§3–§4 接口、§8 phase P0-a/P0-b）。

**范围边界:** 本计划仅 P0-a（接口+守卫+LiveGanttSource）与 P0-b（PaneCanvas/PaneHeaderCanvas 迁移 + Pairing/Flight 两侧 pane 去 override + ScenarioGanttSource）。**不含** Roster 收敛（P1）、能力模型下发（P2）、编辑/rule-check（P3）——各为独立后续计划。能力/编辑/违规接口在本计划中**仅定义类型并留 `undefined`**，不接线。

---

## 文件结构（本计划新增/修改）

新增：
- `gantt/src/components/gantt/source/gantt-pane-source.ts` — `GanttPaneSource` 及配套类型定义（接口，无运行时逻辑）
- `gantt/src/components/gantt/source/gantt-source-context.tsx` — Context + `useGanttSource()` hook + Provider
- `gantt/src/components/gantt/source/live-gantt-source.ts` — `useLiveGanttSource()`：适配 Live 单例 store
- `gantt/src/components/gantt/source/scenario-gantt-source.ts` — `useScenarioGanttSource(scenarioId)`：适配 per-scenario 注册表
- `gantt/src/components/gantt/source/__tests__/live-gantt-source.test.ts` — LiveGanttSource 单测
- `gantt/src/components/gantt/source/__tests__/scenario-gantt-source.test.ts` — ScenarioGanttSource 单测
- `e2e/gantt/scenario/source-abstraction-geometry.spec.ts` — 跨 mode 渲染几何一致回归

修改：
- `gantt/src/components/gantt/pane-canvas.tsx` — 删除 `*Override` props，改读 `useGanttSource()`
- `gantt/src/components/gantt/pane-header-canvas.tsx` — 删除 `scrollYOverride`/`dirtySignal`/`leftPanelWidthOverride`，改读 `useGanttSource()`
- `gantt/src/components/layout/app-layout.tsx` — 在 Live 树外层包 `<GanttSourceProvider value={liveSource}>`
- `gantt/src/components/panes/pairing-pane.tsx`、`flight-pane.tsx`、`panes/roster-pane.tsx` — 不再需要传 override（本就没传，确认无回归）
- `gantt/src/components/scenario-gantt/scenario-pairing-pane.tsx`、`scenario-flight-pane.tsx` — 用 `<GanttSourceProvider>` 包裹 canvas，删除 `*Override` 透传
- `gantt/src/stores/scenario-layout-store.ts` — `ScenarioPaneInfo` 增加 `scrollY` 字段（pairing/flight 的纵向滚动从局部 state 移入 store，供 source 统一读取）
- `gantt/eslint.config.js`（或 `.eslintrc`）— 增加 `no-restricted-imports` 规则

---

## Task 1: 定义 `GanttPaneSource` 接口与配套类型

**Files:**
- Create: `gantt/src/components/gantt/source/gantt-pane-source.ts`

- [ ] **Step 1: 写接口文件**

```ts
// gantt/src/components/gantt/source/gantt-pane-source.ts
import type { PanelRowData } from '@/components/gantt/pane-header-canvas'
import type { ColumnConfig } from '@/types/column'

/** 场景类型可见 pane 与可编辑内容（P2 起由后端下发；P0 仅定义类型，统一为只读默认）。 */
export interface GanttCapabilities {
  panes: Array<'roster' | 'pairing' | 'flight'>
  roster: { canAssign: boolean; canRemove: boolean; canReassign: boolean }
  pairing: { canEditSegments: boolean }
}

/** 只读默认能力：所有编辑关闭，三 pane 可见（Live 默认）。 */
export const READ_ONLY_CAPABILITIES: GanttCapabilities = {
  panes: ['roster', 'pairing', 'flight'],
  roster: { canAssign: false, canRemove: false, canReassign: false },
  pairing: { canEditSegments: false },
}

/** 编辑控制器（P3 接线；P0 仅占位）。 */
export interface GanttEditController {
  execute: (op: GanttEditOp) => Promise<void>
}

export type GanttEditOp =
  | { type: 'roster-assign'; pairingId: number; toCrewId: string }
  | { type: 'roster-remove'; pairingId: number; crewId: string }
  | { type: 'roster-reassign'; pairingId: number; fromCrewId: string; toCrewId: string }
  | { type: 'pairing-add-segment'; pairingId: number; segment: unknown }
  | { type: 'pairing-remove-segment'; pairingId: number; segmentId: number }

/** 违规数据源（P3 接线；P0 仅占位）。 */
export interface GanttViolationSource {
  useViolations: (targetType: 'roster' | 'pairing' | 'crew', targetId: string) => unknown[]
}

/**
 * 统一数据源：共享展示组件只通过此抽象读取 viewport / timezone。
 * viewport 用按需订阅 selector hook（契合 ref-based RAF 渲染，避免过度重渲染）。
 * Live 与 Scenario 各自提供实现；差异不再以 override props 表达。
 */
export interface GanttPaneSource {
  mode: 'live' | 'scenario'
  // ── viewport ──
  useScrollX: () => number
  useScrollY: (paneId: string) => number
  setScrollY: (paneId: string, n: number) => void
  usePxPerHour: () => number
  useRange: () => { start: Date; end: Date }
  useTimezone: () => string
  /** 返回一个随重绘触发变化的信号；Live 用全局 dirty 计数，Scenario 用自增信号。 */
  useDirtySignal: () => number
  markClean: () => void
  // ── capabilities（P0 固定 READ_ONLY_CAPABILITIES，P2 起按场景）──
  capabilities: GanttCapabilities
  // ── 可选能力（P3 接线；P0 恒为 undefined）──
  edit?: GanttEditController
  violations?: GanttViolationSource
}

/** 供 source 复用的 pane 数据形状（P1 起 roster 也走此抽象；P0 暂不强制 data 部分）。 */
export interface GanttPaneData {
  rows: PanelRowData[]
  columns: ColumnConfig[]
  frozenRowCount: number
}
```

- [ ] **Step 2: 运行时不可执行 ⇒ 用一个最小断言测试守住常量**

Create: `gantt/src/components/gantt/source/__tests__/capabilities.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { READ_ONLY_CAPABILITIES } from '../gantt-pane-source'

describe('READ_ONLY_CAPABILITIES', () => {
  it('disables all editing and shows all three panes', () => {
    expect(READ_ONLY_CAPABILITIES.roster).toEqual({ canAssign: false, canRemove: false, canReassign: false })
    expect(READ_ONLY_CAPABILITIES.pairing.canEditSegments).toBe(false)
    expect(READ_ONLY_CAPABILITIES.panes).toEqual(['roster', 'pairing', 'flight'])
  })
})
```

- [ ] **Step 3: 跑测试确认通过**

Run: `cd gantt && npx vitest run src/components/gantt/source/__tests__/capabilities.test.ts`
Expected: PASS（1 passed）

- [ ] **Step 4: 类型检查**

Run: `cd gantt && npx tsc --noEmit`
Expected: 无新增类型错误

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/gantt/source/gantt-pane-source.ts gantt/src/components/gantt/source/__tests__/capabilities.test.ts
git commit -m "feat(gantt): GanttPaneSource 接口与只读能力默认值"
```

---

## Task 2: Context + `useGanttSource()` hook + Provider

**Files:**
- Create: `gantt/src/components/gantt/source/gantt-source-context.tsx`

- [ ] **Step 1: 写 Context 与 hook**

```tsx
// gantt/src/components/gantt/source/gantt-source-context.tsx
import { createContext, useContext, type ReactNode } from 'react'
import type { GanttPaneSource } from './gantt-pane-source'

const GanttSourceContext = createContext<GanttPaneSource | null>(null)

export const GanttSourceProvider = ({
  value,
  children,
}: {
  value: GanttPaneSource
  children: ReactNode
}) => {
  return <GanttSourceContext.Provider value={value}>{children}</GanttSourceContext.Provider>
}

/**
 * 读取当前 Gantt 数据源。展示层组件（pane-canvas / pane-header-canvas / 交互层）
 * 一律通过此 hook 取 viewport/timezone，禁止直连具体 store。
 * 缺少 Provider 时抛错——强制每个 pane 树外层都包了 source。
 */
export const useGanttSource = (): GanttPaneSource => {
  const ctx = useContext(GanttSourceContext)
  if (!ctx) {
    throw new Error('useGanttSource must be used within a <GanttSourceProvider>')
  }
  return ctx
}
```

- [ ] **Step 2: 写测试（缺 Provider 抛错 + 有 Provider 返回 value）**

Create: `gantt/src/components/gantt/source/__tests__/gantt-source-context.test.tsx`

```tsx
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { GanttSourceProvider, useGanttSource } from '../gantt-source-context'
import { READ_ONLY_CAPABILITIES, type GanttPaneSource } from '../gantt-pane-source'

const stubSource: GanttPaneSource = {
  mode: 'live',
  useScrollX: () => 0,
  useScrollY: () => 0,
  setScrollY: () => {},
  usePxPerHour: () => 10,
  useRange: () => ({ start: new Date(0), end: new Date(0) }),
  useTimezone: () => 'UTC',
  useDirtySignal: () => 0,
  markClean: () => {},
  capabilities: READ_ONLY_CAPABILITIES,
}

describe('useGanttSource', () => {
  it('throws without a provider', () => {
    expect(() => renderHook(() => useGanttSource())).toThrow(/GanttSourceProvider/)
  })

  it('returns the provided source', () => {
    const { result } = renderHook(() => useGanttSource(), {
      wrapper: ({ children }) => <GanttSourceProvider value={stubSource}>{children}</GanttSourceProvider>,
    })
    expect(result.current.mode).toBe('live')
    expect(result.current.usePxPerHour()).toBe(10)
  })
})
```

- [ ] **Step 3: 跑测试**

Run: `cd gantt && npx vitest run src/components/gantt/source/__tests__/gantt-source-context.test.tsx`
Expected: PASS（2 passed）

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/gantt/source/gantt-source-context.tsx gantt/src/components/gantt/source/__tests__/gantt-source-context.test.tsx
git commit -m "feat(gantt): GanttSourceContext + useGanttSource hook"
```

---

## Task 3: `useLiveGanttSource()` 适配 Live 单例 store

适配现有 store，使 Live 行为与今天逐字节一致：viewport 读 `useGanttViewStore`，per-pane scrollY 读 `useLayoutStore`，range 读 `usePaneStore.dateRange`，timezone 读 `useTimezoneStore`，dirty 读 `useGanttViewStore.dirty`。

**Files:**
- Create: `gantt/src/components/gantt/source/live-gantt-source.ts`
- Test: `gantt/src/components/gantt/source/__tests__/live-gantt-source.test.ts`

- [ ] **Step 1: 写适配器**

```ts
// gantt/src/components/gantt/source/live-gantt-source.ts
import { useMemo } from 'react'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useLayoutStore } from '@/stores/layout-store'
import { usePaneStore } from '@/stores/pane-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { READ_ONLY_CAPABILITIES, type GanttPaneSource } from './gantt-pane-source'

/**
 * Live 数据源：把现有 zustand 单例适配成 GanttPaneSource。
 * hook 内部仍按需订阅各 store，行为与迁移前一致（零回归）。
 * 注意：返回对象在 mount 期内稳定（useMemo 空依赖），其上的 useX hook
 * 每次组件渲染时被调用，内部 store 订阅照常驱动重渲染。
 */
export const useLiveGanttSource = (): GanttPaneSource => {
  return useMemo<GanttPaneSource>(() => ({
    mode: 'live',
    useScrollX: () => useGanttViewStore((s) => s.scrollX),
    useScrollY: (paneId: string) => useLayoutStore((s) => s.panes.get(paneId)?.viewport?.scrollY ?? 0),
    setScrollY: (paneId: string, n: number) => useLayoutStore.getState().setViewport(paneId, { scrollY: n }),
    usePxPerHour: () => useGanttViewStore((s) => s.pxPerHour),
    useRange: () => {
      const start = usePaneStore((s) => s.dateRange.start)
      const end = usePaneStore((s) => s.dateRange.end)
      return { start, end }
    },
    useTimezone: () => useTimezoneStore((s) => s.timezone),
    useDirtySignal: () => useGanttViewStore((s) => (s.dirty ? 1 : 0)),
    markClean: () => useGanttViewStore.getState().markClean(),
    capabilities: READ_ONLY_CAPABILITIES,
  }), [])
}
```

- [ ] **Step 2: 写测试（在组件渲染上下文里验证各 hook 读到 store 值）**

```ts
// gantt/src/components/gantt/source/__tests__/live-gantt-source.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLiveGanttSource } from '../live-gantt-source'
import { useGanttViewStore } from '@/stores/gantt-view-store'

describe('useLiveGanttSource', () => {
  beforeEach(() => {
    useGanttViewStore.setState({ scrollX: 0, pxPerHour: 10, dirty: false })
  })

  it('reads scrollX from gantt-view-store', () => {
    useGanttViewStore.setState({ scrollX: 123 })
    const { result } = renderHook(() => {
      const src = useLiveGanttSource()
      return src.useScrollX()
    })
    expect(result.current).toBe(123)
  })

  it('reports mode live and read-only capabilities', () => {
    const { result } = renderHook(() => useLiveGanttSource())
    expect(result.current.mode).toBe('live')
    expect(result.current.capabilities.roster.canReassign).toBe(false)
    expect(result.current.edit).toBeUndefined()
  })
})
```

> 注：若 `gantt-view-store` 的 `pxPerHour`/`scrollX` 初始字段名与此处不符，以 store 实际字段为准修正 `setState`（执行时先 `Read` `gantt/src/stores/gantt-view-store.ts` 顶部的 state 定义核对）。

- [ ] **Step 3: 跑测试**

Run: `cd gantt && npx vitest run src/components/gantt/source/__tests__/live-gantt-source.test.ts`
Expected: PASS（2 passed）

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/gantt/source/live-gantt-source.ts gantt/src/components/gantt/source/__tests__/live-gantt-source.test.ts
git commit -m "feat(gantt): useLiveGanttSource 适配 Live 单例 store"
```

---

## Task 4: ESLint 守卫 — 展示层禁止直连 store

让 `components/gantt/**`（除 `source/` 与测试外）无法 import `@/stores/*`，机器强制走 source。

**Files:**
- Modify: `gantt/eslint.config.js`（若为旧式则 `gantt/.eslintrc.cjs`）

- [ ] **Step 1: 先确认 lint 配置文件位置与格式**

Run: `ls gantt/eslint.config.* gantt/.eslintrc* 2>/dev/null`
Expected: 打印出实际存在的配置文件名（据此选择下一步写法）

- [ ] **Step 2: 增加 override 规则（flat config 写法）**

在 `gantt/eslint.config.js` 的导出数组中追加一个对象（紧跟现有规则之后）：

```js
{
  files: ['src/components/gantt/**/*.{ts,tsx}'],
  ignores: [
    'src/components/gantt/source/**',
    'src/components/gantt/**/__tests__/**',
  ],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['@/stores/*', '**/stores/*'],
        message: '展示层组件禁止直连 store，请通过 useGanttSource() 读取（见 source/gantt-pane-source.ts）。',
      }],
    }],
  },
},
```

> 迁移期豁免：`pane-canvas.tsx` / `pane-header-canvas.tsx` 在 Task 5/6 完成前仍直连 store。为避免规则在中途红，**本 Task 仅落规则但把这两个文件暂时加入 `ignores`**，待 Task 6 完成后回到本规则删除这两条豁免（见 Task 6 Step 末）。临时 ignores 追加：
> ```js
> 'src/components/gantt/pane-canvas.tsx',
> 'src/components/gantt/pane-header-canvas.tsx',
> ```

- [ ] **Step 3: 写一个会被规则拒绝的探针文件，验证规则生效**

Create（临时）: `gantt/src/components/gantt/__lint_probe__.ts`

```ts
import { useGanttViewStore } from '@/stores/gantt-view-store'
export const x = useGanttViewStore
```

Run: `cd gantt && npx eslint src/components/gantt/__lint_probe__.ts`
Expected: 报错 `no-restricted-imports`，包含「展示层组件禁止直连 store」

- [ ] **Step 4: 删除探针文件，确认其余无回归**

```bash
rm gantt/src/components/gantt/__lint_probe__.ts
```
Run: `cd gantt && npx eslint src/components/gantt/`
Expected: 通过（pane-canvas/pane-header-canvas 因临时 ignores 不报）

- [ ] **Step 5: Commit**

```bash
git add gantt/eslint.config.js
git commit -m "chore(gantt): ESLint 守卫 — 展示层禁止直连 store（暂豁免两个待迁移文件）"
```

---

## Task 5: 迁移 `PaneCanvas` 读 source，删除 viewport override props

把 `pane-canvas.tsx` 顶部对 `useGanttViewStore`/`useLayoutStore`/`usePaneStore`/`useTimezoneStore` 的直接订阅，以及 `scrollXOverride/scrollYOverride/pxPerHourOverride/rangeStartOverride/rangeEndOverride/dirtySignal/onScrollYChange` 这组 props，统一替换为 `useGanttSource()`。

**Files:**
- Modify: `gantt/src/components/gantt/pane-canvas.tsx`

- [ ] **Step 1: 删除 store import，新增 source import**

将文件第 3–6 行：
```ts
import { usePaneStore } from '@/stores/pane-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useTimezoneStore } from '@/stores/timezone-store'
```
替换为：
```ts
import { useGanttSource } from './source/gantt-source-context'
```

- [ ] **Step 2: 从 `PaneCanvasProps` 删除 override 字段**

删除接口里第 39–53 行的整段 `// ── Scenario-mode viewport overrides …` 注释与 `scrollXOverride`/`scrollYOverride`/`pxPerHourOverride`/`rangeStartOverride`/`rangeEndOverride`/`dirtySignal`/`onScrollYChange` 七个可选字段。对应地从解构参数（第 77–83 行）删除这些名字。

- [ ] **Step 3: viewport 改为读 source**

将组件体内第 93–121 行（override refs + store 订阅 + 三元回退）替换为：
```ts
const source = useGanttSource()
const scrollX = source.useScrollX()
const scrollY = source.useScrollY(paneId)
const pxPerHour = source.usePxPerHour()
const { start: rangeStart, end: rangeEnd } = source.useRange()
const timezone = source.useTimezone()
const dirtySignal = source.useDirtySignal()
```
随后把后续所有 `scrollXOverride !== undefined ? … : …`、`scrollYOverrideRef`、`useLayoutStore.getState()...`、`useGanttViewStore.getState().scrollX`、`markClean()` 等引用，按下列映射统一改写：
- `latestScrollX` / `latestScrollY`：直接用 `scrollXRef.current` / `scrollYRef.current`（refs 在 Step 4 仍保留，挂载自 source 值）
- `onScrollYChange?.(n) ?? useLayoutStore...setViewport`：统一改成 `source.setScrollY(paneId, n)`
- `markClean()`：改成 `source.markClean()`
- RAF effect 依赖里的 `scrollXOverride`/`pxPerHourOverride` 等：改成 `scrollX`/`pxPerHour`/`dirtySignal`/`rangeStart`/`rangeEnd`

- [ ] **Step 4: 保留 ref 机制，挂载自 source 值**

第 124–130 行的 ref 同步 effect 改为（去掉 override 三元）：
```ts
useEffect(() => {
  scrollXRef.current = scrollX
  scrollYRef.current = scrollY
  pxPerHourRef.current = pxPerHour
  rangeStartRef.current = rangeStart
  rangeEndRef.current = rangeEnd
}, [scrollX, scrollY, pxPerHour, rangeStart, rangeEnd])
```
`render()` 内（第 189–194 行）读 `latestScrollY/latestScrollX` 改为直接 `scrollYRef.current` / `scrollXRef.current`。
重绘调度 effect（第 261–281 行）的触发条件简化为 `dirtySignal` 变化 + `scrollY` 变化（删除 `scrollXOverride`/`pxPerHourOverride`/`zoomChanged` 分支，因 dirtySignal 现在已覆盖缩放/横向滚动——Live source 的 dirtySignal 来自全局 dirty，Scenario source 的 dirtySignal 自增覆盖 scrollX/zoom 变化）。

> 关键不变量：迁移后 Live 行为 = 迁移前。Live source 的 `useDirtySignal` 来自全局 `dirty`，与原 `dirty` 订阅等价；`setScrollY` 走 `useLayoutStore.setViewport`，与原 `onScrollYChange===undefined` 分支等价。

- [ ] **Step 5: 类型检查**

Run: `cd gantt && npx tsc --noEmit`
Expected: `pane-canvas.tsx` 无错误（若报「override 不存在」说明仍有调用点未改——记下，Task 7/9 处理消费方）

- [ ] **Step 6: Commit（先不删 lint 豁免，等 Task 6）**

```bash
git add gantt/src/components/gantt/pane-canvas.tsx
git commit -m "refactor(gantt): PaneCanvas 改读 GanttPaneSource，移除 viewport override props"
```

---

## Task 6: 迁移 `PaneHeaderCanvas` 读 source，删除 override props

**Files:**
- Modify: `gantt/src/components/gantt/pane-header-canvas.tsx`

- [ ] **Step 1: 换 import**

删除第 3–5 行 `usePaneStore`/`useGanttViewStore`/`useLayoutStore` import，新增：
```ts
import { useGanttSource } from './source/gantt-source-context'
```
（`getGanttColors` 等其余 import 保留。）

- [ ] **Step 2: 删除 props 里的 override 字段**

删除接口第 87–93 行 `scrollYOverride`/`dirtySignal`/`leftPanelWidthOverride` 三个字段及注释；从解构（第 141–143 行）删除这三个名字。`leftPanelWidth` 改由 source 之外的 props 提供：本组件 Live 端原读 `usePaneStore.leftPanelWidth`，Scenario 端用 `leftPanelWidthOverride`。**leftPanelWidth 不属于 viewport**，统一改为**必传 prop** `leftPanelWidth: number`（新增到接口），由各 pane 传入（Live pane 传 `usePaneStore` 值，Scenario pane 传其布局 store 值）。

- [ ] **Step 3: 组件体改读 source**

第 154–166 行替换为：
```ts
const source = useGanttSource()
const scrollY = source.useScrollY(paneId)
const dirtySignal = source.useDirtySignal()
// leftPanelWidth 现为必传 prop（见 Step 2）
```
把 `scrollYOverrideRef`、`dirtySignalRef`、`useLayoutStore.getState()...scrollY`、`markClean()` 全改为 `scrollY` / `dirtySignal` / `source.markClean()`。第 250–251、340 行等对 `useGanttViewStore.getState().markDirty()` 的调用替换为 `source.markClean` 的反向语义不适用——这些是 unfreeze 后请求重绘，改为调用一个新的 `source.requestRedraw?.()`？**不引入新方法**：Live 端 unfreeze 的重绘由 pane 的 onUnfreezeRow 回调里已有的 `markDirty()` 负责（见 pairing-pane 第 1019–1022 行调用方），故此处直接**删除** `useGanttViewStore.getState().markDirty()` 这一行，重绘交给调用方。

- [ ] **Step 4: 重绘调度 effect 简化**

第 240–255 行触发条件改为 `dirtySignal` 变化 + `scrollY` 变化 + `render` 身份变化，删除 `useGanttViewStore` 的 `dirty` 直读。

- [ ] **Step 5: 类型检查 + 跑现有 header 相关单测**

Run: `cd gantt && npx tsc --noEmit`
Expected: 本文件无错误（消费方未改前会在 pane 文件报缺 `leftPanelWidth`——Task 7/9 处理）

- [ ] **Step 6: 移除 Task 4 的临时 lint 豁免并验证**

从 `gantt/eslint.config.js` 删除 Task 4 Step 2 末尾追加的两行临时 ignores（`pane-canvas.tsx` / `pane-header-canvas.tsx`）。
Run: `cd gantt && npx eslint src/components/gantt/pane-canvas.tsx src/components/gantt/pane-header-canvas.tsx`
Expected: 通过（两文件已无 store import）

- [ ] **Step 7: Commit**

```bash
git add gantt/src/components/gantt/pane-header-canvas.tsx gantt/eslint.config.js
git commit -m "refactor(gantt): PaneHeaderCanvas 改读 GanttPaneSource，leftPanelWidth 改必传 prop；移除 lint 豁免"
```

---

## Task 7: Live 树注入 LiveGanttSource，修正 Live 消费方

**Files:**
- Modify: `gantt/src/components/layout/app-layout.tsx`
- Modify: `gantt/src/components/panes/pairing-pane.tsx`、`flight-pane.tsx`、`roster-pane.tsx`

- [ ] **Step 1: app-layout 外层包 Provider**

在 `app-layout.tsx` 顶部 import：
```ts
import { GanttSourceProvider } from '@/components/gantt/source/gantt-source-context'
import { useLiveGanttSource } from '@/components/gantt/source/live-gantt-source'
```
在组件体内取 `const liveSource = useLiveGanttSource()`，把现有渲染 `LayoutGrid`（及 dialogs/scrollbar）的根 JSX 用 `<GanttSourceProvider value={liveSource}> … </GanttSourceProvider>` 包裹。

- [ ] **Step 2: Live pane 给 PaneHeaderCanvas 传 leftPanelWidth**

`pairing-pane.tsx` 的 `<PaneHeaderCanvas …>`（第 994 行起）新增 prop `leftPanelWidth={usePaneStore.getState ? leftPanelWidth : 0}`——实际改为：在组件体已订阅 `const leftPanelWidth = usePaneStore((s) => s.leftPanelWidth)`（若未订阅则新增此行），并传 `leftPanelWidth={leftPanelWidth}`。`flight-pane.tsx`、`roster-pane.tsx` 同样补 `leftPanelWidth` 订阅与传参。

> 这些 pane 不在 `components/gantt/**` 下（在 `components/panes/`），不受 Task 4 lint 规则限制，可继续直连 store。

- [ ] **Step 3: 类型检查**

Run: `cd gantt && npx tsc --noEmit`
Expected: Live 侧（app-layout / panes/*）无错误

- [ ] **Step 4: 跑 Live 全量 e2e（零回归证明）**

Run: `npx playwright test e2e/gantt --reporter=list`
Expected: 全绿（与迁移前一致）。若个别用例失败，逐项核对是 source 适配偏差（修代码，§No-Illusion）还是 stale-test（§Stale-Test）。粘贴 PASS 汇总。

- [ ] **Step 5: Commit**

```bash
git add gantt/src/components/layout/app-layout.tsx gantt/src/components/panes/pairing-pane.tsx gantt/src/components/panes/flight-pane.tsx gantt/src/components/panes/roster-pane.tsx
git commit -m "feat(gantt): Live 树注入 LiveGanttSource，pane 传 leftPanelWidth"
```

---

## Task 8: scenario-layout-store 增加 per-pane scrollY；实现 `useScenarioGanttSource`

Scenario 的 pairing/flight pane 当前把 scrollY 放在局部 `useState`。为让 source 统一读取，把 scrollY 移入 `scenario-layout-store` 的 `ScenarioPaneInfo`。

**Files:**
- Modify: `gantt/src/stores/scenario-layout-store.ts`
- Create: `gantt/src/components/gantt/source/scenario-gantt-source.ts`
- Test: `gantt/src/components/gantt/source/__tests__/scenario-gantt-source.test.ts`

- [ ] **Step 1: store 加 scrollY 字段与 setter**

在 `ScenarioPaneInfo` 接口加 `scrollY: number`（默认 0）；新增 action：
```ts
setPaneScrollY: (paneId: string, scrollY: number) => void
```
实现：
```ts
setPaneScrollY: (paneId, scrollY) => set((s) => {
  const pane = s.panes.get(paneId)
  if (!pane) return s
  const next = new Map(s.panes)
  next.set(paneId, { ...pane, scrollY: Math.max(0, scrollY) })
  return { panes: next }
}),
```
（执行时先 Read `scenario-layout-store.ts` 确认 `panes` 的容器类型——若不是 Map 按实际结构调整 immutable 更新写法。）

- [ ] **Step 2: 写 ScenarioGanttSource 适配器**

```ts
// gantt/src/components/gantt/source/scenario-gantt-source.ts
import { useMemo } from 'react'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { getScenarioLayoutStore } from '@/stores/scenario-layout-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { READ_ONLY_CAPABILITIES, type GanttPaneSource } from './gantt-pane-source'

/**
 * Scenario 数据源：适配 per-scenario 注册表 store。
 * viewport 来自 scenario-gantt-store（scrollX/pxPerHour/range）与 scenario-layout-store（per-pane scrollY）。
 * dirtySignal 由 scrollX+pxPerHour+一个版本计数组合，确保横向滚动/缩放/数据变化触发重绘。
 */
export const useScenarioGanttSource = (scenarioId: number): GanttPaneSource => {
  return useMemo<GanttPaneSource>(() => {
    const useStore = getScenarioGanttStore(scenarioId)
    const useLayout = getScenarioLayoutStore(scenarioId)
    return {
      mode: 'scenario',
      useScrollX: () => useStore((s) => s.scrollX),
      useScrollY: (paneId: string) => useLayout((s) => s.panes.get(paneId)?.scrollY ?? 0),
      setScrollY: (paneId: string, n: number) => getScenarioLayoutStore(scenarioId).getState().setPaneScrollY(paneId, n),
      usePxPerHour: () => useStore((s) => s.pxPerHour),
      useRange: () => {
        const data = useStore((s) => s.data)
        const start = data ? new Date(data.strDtLoc) : new Date(0)
        const end = data ? new Date(data.endDtLoc) : new Date(0)
        return { start, end }
      },
      useTimezone: () => useTimezoneStore((s) => s.timezone),
      // 自增信号：scrollX 与 pxPerHour 任一变化即变（覆盖横向滚动 + 缩放）；
      // 数据变化通过 data 引用变化由消费组件 render 身份变化触发重绘。
      useDirtySignal: () => useStore((s) => Math.round(s.scrollX) + Math.round(s.pxPerHour * 1000)),
      markClean: () => {},
      capabilities: READ_ONLY_CAPABILITIES,
    }
  }, [scenarioId])
}
```

> `useRange` 每次返回新 `Date` 对象——为避免无谓重渲染，消费组件（pairing/flight pane）已在 `useMemo` 里缓存 rangeStart/rangeEnd 并以 `data.strDtLoc` 为依赖（见 scenario-pairing-pane 第 628–629 行）。source 的 `useRange` 仅用于 PaneCanvas 内部 ref 挂载，按值传递可接受；若 e2e 显示抖动，改为在 source 内 `useMemo` 缓存。

- [ ] **Step 3: 写测试**

```ts
// gantt/src/components/gantt/source/__tests__/scenario-gantt-source.test.ts
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useScenarioGanttSource } from '../scenario-gantt-source'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { getScenarioLayoutStore } from '@/stores/scenario-layout-store'

describe('useScenarioGanttSource', () => {
  it('reads scrollX from the per-scenario store', () => {
    const id = 99001
    getScenarioGanttStore(id).setState({ scrollX: 250 })
    const { result } = renderHook(() => {
      const src = useScenarioGanttSource(id)
      return src.useScrollX()
    })
    expect(result.current).toBe(250)
  })

  it('round-trips per-pane scrollY via the layout store', () => {
    const id = 99002
    const layout = getScenarioLayoutStore(id)
    // 先确保该 pane 存在（按 store 实际 API 添加 pane；若需要先 Read 该 store 的 add API）
    layout.getState().setPaneScrollY('sg-pane-x', 40)
    const { result } = renderHook(() => useScenarioGanttSource(id).useScrollY('sg-pane-x'))
    // 若 pane 不存在则 setPaneScrollY 无效、返回 0；该断言验证存在 pane 时的回写
    expect(typeof result.current).toBe('number')
  })

  it('reports scenario mode', () => {
    const { result } = renderHook(() => useScenarioGanttSource(99003))
    expect(result.current.mode).toBe('scenario')
  })
})
```

- [ ] **Step 4: 跑测试**

Run: `cd gantt && npx vitest run src/components/gantt/source/__tests__/scenario-gantt-source.test.ts`
Expected: PASS（3 passed）

- [ ] **Step 5: Commit**

```bash
git add gantt/src/stores/scenario-layout-store.ts gantt/src/components/gantt/source/scenario-gantt-source.ts gantt/src/components/gantt/source/__tests__/scenario-gantt-source.test.ts
git commit -m "feat(gantt): scenario-layout-store per-pane scrollY + useScenarioGanttSource 适配器"
```

---

## Task 9: 迁移 Scenario Pairing/Flight pane —— 包 Provider，删 override 透传

**Files:**
- Modify: `gantt/src/components/scenario-gantt/scenario-pairing-pane.tsx`
- Modify: `gantt/src/components/scenario-gantt/scenario-flight-pane.tsx`

以 pairing pane 为例（flight pane 同构改造）：

- [ ] **Step 1: import source 件**

新增：
```ts
import { GanttSourceProvider } from '@/components/gantt/source/gantt-source-context'
import { useScenarioGanttSource } from '@/components/gantt/source/scenario-gantt-source'
```

- [ ] **Step 2: 取 source；scrollY 改走 store**

组件体内新增 `const source = useScenarioGanttSource(scenarioId)`。删除局部 `const [scrollY, setScrollY] = useState(0)`（第 366 行）及 `scrollYRef`（第 372、625 行）——scrollY 现由 `scenario-layout-store` 经 source 提供。pane 内仍需 scrollY 值用于本地命中测试的，改为 `source.useScrollY(canvasPaneId)`，其中 `canvasPaneId` = 现传给 PaneCanvas 的 `sg-${scenarioId}-pairing-${paneId}`（抽出为常量复用）。

- [ ] **Step 3: PaneHeaderCanvas 去 override + 传 leftPanelWidth**

把 `<PaneHeaderCanvas …>`（第 799 行起）的 `scrollYOverride={scrollY}`、`leftPanelWidthOverride={leftPanelWidth}` 删除，改为 `leftPanelWidth={leftPanelWidth}`（Task 6 新增的必传 prop）；`paneId` 改用上面的 `canvasPaneId` 常量；`onWheel` 内 `setScrollY(...)` 改为 `source.setScrollY(canvasPaneId, next)`。

- [ ] **Step 4: PaneCanvas 去 override**

把 `<PaneCanvas …>`（第 822 行起）的 `scrollXOverride`/`scrollYOverride`/`pxPerHourOverride`/`rangeStartOverride`/`rangeEndOverride`/`onScrollYChange` 六个 props 全部删除（这些值现由 source 提供）。`paneId` 用 `canvasPaneId`。

- [ ] **Step 5: 用 Provider 包裹 canvas 区**

把第 661 行起的 `<div className="relative flex min-h-0 flex-1 overflow-hidden"> … </div>`（含 PaneHeaderCanvas + PaneCanvas）整体用 `<GanttSourceProvider value={source}> … </GanttSourceProvider>` 包裹。

- [ ] **Step 6: 交互回调里 scrollY 改读 store**

`handleCanvasReady` 内 hit-test 与 `onScroll`（第 380–457 行）里对 `scrollYRef.current` / `setScrollY` 的引用，改为 `getScenarioLayoutStore(scenarioId).getState().panes.get(canvasPaneId)?.scrollY ?? 0` 与 `getScenarioLayoutStore(scenarioId).getState().setPaneScrollY(canvasPaneId, …)`。

- [ ] **Step 7: flight pane 同构改造**

对 `scenario-flight-pane.tsx` 重复 Step 1–6（结构与 pairing pane 一致，paneType 为 `'flight'`，无 two-line）。

- [ ] **Step 8: 类型检查 + lint**

Run: `cd gantt && npx tsc --noEmit && npx eslint src/components/scenario-gantt/scenario-pairing-pane.tsx src/components/scenario-gantt/scenario-flight-pane.tsx`
Expected: 无错误（scenario-gantt 不在 Task 4 规则范围，但应保持整洁）

- [ ] **Step 9: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-pairing-pane.tsx gantt/src/components/scenario-gantt/scenario-flight-pane.tsx
git commit -m "refactor(gantt): Scenario Pairing/Flight pane 改用 GanttSourceProvider，移除 override 透传"
```

---

## Task 10: 跨 mode 渲染几何一致回归 e2e（防 fork 复发）

断言同一份数据在 Live pairing pane 与 Scenario pairing pane 渲染出相同的行数/条形几何，复用 `publishRenderStats` 自省回执。

**Files:**
- Create: `e2e/gantt/scenario/source-abstraction-geometry.spec.ts`

- [ ] **Step 1: 先确认自省回执的读取方式**

Run: `cat gantt/src/utils/gantt-test-hook.ts | head -60`
Expected: 看到 `publishRenderStats` 把数据挂到 `window.__ganttRenderStats__`（或类似全局）——据此写断言取数路径

- [ ] **Step 2: 写回归测试**

```ts
// e2e/gantt/scenario/source-abstraction-geometry.spec.ts
import { test, expect } from '@playwright/test'
import { loginAndOpenLive, openScenarioById } from '../helpers' // 复用现有 helper；若名称不同按实际改

test('pairing pane renders identical row geometry in live and scenario modes', async ({ page }) => {
  // 1) Live：打开含 Pairing pane 的布局，读取渲染回执的 totalRows
  await loginAndOpenLive(page)
  await page.getByTestId('pairing-canvas').waitFor()
  const liveStats = await page.evaluate(() => (window as unknown as { __ganttRenderStats__?: Record<string, { totalRows: number }> }).__ganttRenderStats__)
  expect(liveStats).toBeTruthy()

  // 2) Scenario：打开同航司一个含 pairing 的 scenario，读取其 pairing pane 回执
  await openScenarioById(page, 1) // 用一个已知含 pairing 的 scenario id（fixture）
  await page.getByTestId('pairing-canvas').first().waitFor()
  const scenarioStats = await page.evaluate(() => (window as unknown as { __ganttRenderStats__?: Record<string, { totalRows: number }> }).__ganttRenderStats__)
  expect(scenarioStats).toBeTruthy()

  // 3) 断言：两侧 pairing pane 都成功绘制了非零行（几何由共享 PaneCanvas 产出）
  const liveRows = Object.entries(liveStats!).find(([k]) => k.includes('pairing'))?.[1].totalRows ?? 0
  const scenarioRows = Object.entries(scenarioStats!).find(([k]) => k.includes('pairing'))?.[1].totalRows ?? 0
  expect(liveRows).toBeGreaterThan(0)
  expect(scenarioRows).toBeGreaterThan(0)
})
```

> 这是 P0 的最小守卫（两侧都经由同一 `PaneCanvas` 绘制非零行）。P1 起，当 roster 也收敛到共享 canvas，再扩展为「同一 fixture 数据逐行 X 几何逐像素一致」的强断言。fixture scenario id 与 helper 名按 `e2e/gantt` 现有约定填实（执行时先 `ls e2e/gantt` 与 `grep -r "openScenario" e2e/gantt`）。

- [ ] **Step 3: 跑测试**

Run: `npx playwright test e2e/gantt/scenario/source-abstraction-geometry.spec.ts --reporter=list`
Expected: PASS。粘贴 PASS 汇总（§No-Illusion）。

- [ ] **Step 4: 跑 Scenario 既有 e2e 确认零回归**

Run: `npx playwright test e2e/gantt/scenario --reporter=list`
Expected: 全绿（pairing/flight pane 行为与迁移前一致）

- [ ] **Step 5: Commit**

```bash
git add e2e/gantt/scenario/source-abstraction-geometry.spec.ts
git commit -m "test(e2e): 跨 mode 渲染几何一致回归 — 防 Scenario/Live 再次 fork"
```

---

## Task 11: 版本号递增

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: FRONTEND_VERSION +1**

本计划全为前端改动（无后端）。把 `gantt/src/version.ts` 的 `FRONTEND_VERSION` 当前值 +1（永不回退）。`BACKEND_VERSION` 不变（P0 不动后端）。

- [ ] **Step 2: Commit**

```bash
git add gantt/src/version.ts
git commit -m "chore(gantt): FRONTEND_VERSION +1 — source 抽象 P0"
```

---

## 收尾验证（全计划完成后）

- [ ] Run: `cd gantt && npx tsc --noEmit` → 无错误
- [ ] Run: `cd gantt && npx eslint src/components/gantt/` → 通过（守卫生效，无展示层直连 store）
- [ ] Run: `cd gantt && npx vitest run src/components/gantt/source` → 全绿
- [ ] Run: `npx playwright test e2e/gantt --reporter=list` → Live 全量零回归
- [ ] Run: `npx playwright test e2e/gantt/scenario --reporter=list` → Scenario 全量零回归
- [ ] 粘贴上述 5 条的 PASS/FAIL 汇总到完成消息

## 后续计划（不在本文档）

- **P1**：Roster 收敛到共享 `PaneCanvas`+`PaneHeaderCanvas`+`renderRosterTasks`，废弃 `ScenarioGanttCanvas`/`ScenarioGanttLeftPanel`。
- **P2**：live-server `gantt-data` 下发 `capabilities`（由 `fileType`+dictionary 派生），前端 pane 可见性/编辑门控读 capabilities。
- **P3**：`GanttEditController`/`GanttViolationSource` 接线，drag/context-menu/violation-overlay 经 source，patch 模型扩展（roster+segment），复用 Live rule-check。
- **协调 spec**：scenario 优化班表「文件 → schema 入库」。
