# Gantt Live↔Scenario "Shell 层" 评估与决策

> 2026-06-14 · 状态：评估 / 建议缓做 · 关联：`2026-06-13-gantt-live-scenario-code-sharing-design.md`（他人并行设计）、`2026-06-14-scenario-gantt-reuse-design.md`（本项目 spec，P0–P3 已落地）

## 背景：P0–P3 已共享什么、还剩什么

P0–P3 已通过 `GanttPaneSource` 抽象共享了**画布层及以下**——`PaneCanvas` / `PaneHeaderCanvas` / `renderers` / `interactions` / 能力模型 / 编辑控制器 / 违规源。Live 与 Scenario 的画布渲染、交互、能力门控、RO 编辑全部走同一套。

**仍然各写一套的是"画布之上的 UI"**：每个 pane 组件（`panes/roster-pane.tsx` vs `scenario-gantt/scenario-roster-pane.tsx`；pairing / flight 同理）各自实现工具栏、筛选 UI、排序 chips、condition strip、quick-filter。最明显的重复是 `scenario-pairing-pane.tsx` 里整套 `PillGroup`/`TextChipField`/filter popover，**重复**了 Live `filter-dialog` 的逻辑。后果：新增一个筛选项 / 工具栏按钮仍需改 Live + Scenario 两处。

## "Shell 层"是什么（6-13 文档 Layer 2）

抽出共享的 `RosterPaneShell` / `PairingPaneShell` / `FlightPaneShell`，把**工具栏 / 筛选 / 排序 / condition-strip / 行选择**等画布之上的 UI 全部收进去，由一个**更厚的 adapter**（6-13 的 `GanttPaneAdapter`：rows + sort/filter 状态 + actions）参数化。pane 文件退化成薄包装：

```tsx
export const RosterPane = ({ paneId }) => <RosterPaneShell adapter={useLiveRosterAdapter(paneId)} />
export const ScenarioRosterPane = ({ scenarioId, paneId }) => <RosterPaneShell adapter={useScenarioRosterAdapter(...)} />
```

效果：画布之上的 UI 特性一次改、两端自动生效。

## 与本项目架构的关系

- **6-13 文档 Layer 3（canvas，靠 `*Override` props）已被本项目 P0 的 `GanttPaneSource` 抽象取代**——更干净（override props 已删除、ESLint/Vitest 守卫强制展示层不直连 store）。6-13 Layer 3 的代码示例已对不上当前 main，不应再实现。
- **6-13 Layer 1（厚 adapter）+ Layer 2（Shell）是本项目未做的增量**，可叠加在薄 source 之上：`GanttPaneSource` 继续供画布 viewport/能力/编辑；Shell + 一个上层 adapter 供工具栏/筛选/排序 UI。两者不冲突。

## 收益 vs 成本/风险

**收益（真实）**：消除剩余的工具栏/筛选/排序重复，尤其 Scenario 重写的那套 filter UI；新增上层 UI 特性一次生效。

**成本/风险（不低）**：
- 需重写 6 个 pane 组件、定义一个能覆盖两端的厚 adapter。
- Live 的上层逻辑有大量**真·Live-only** 细节：pairing 服务端排序（`applySort` 枚举键）、分页 `load-more`、draft（undo/redo/commit）、编辑锁、quick-filter 服务端 debounce。6-13 文档自己把这些列为 "divergence points"。把它们塞进共享 Shell 需要 adapter 暴露大量可选能力，Shell 内部仍要按 mode 分支——抽象收益会被稀释。
- Scenario 的筛选是纯客户端、Live 多为服务端——两者语义不同，统一到一个 adapter 接口需谨慎设计。

## 决策：建议缓做（Defer）

P0–P3 已拿下高价值的画布共享 + 能力门控 + RO 编辑；Shell 层属"锦上添花"。建议：

1. **暂不实施**。等工具栏/筛选/排序的重复真正成为维护痛点（例如多次出现"改了 Live 忘改 Scenario"的筛选/工具栏 bug）再启动。
2. **启动前先与 6-13 文档作者对齐**，确认以本项目的薄 source + 叠加 Shell 为统一方向，避免两份设计并行打架。
3. 若启动，建议**逐 pane 增量**（先 pairing——它的 filter UI 重复最明显），而非一次重写三对 pane。

## 现状可接受性

当前 Scenario 各 pane 的上层 UI 重复是**有界的、已工作的**——不阻塞任何功能，只是维护面没收敛到极致。在 Shell 层启动前，新增上层 UI 特性请记得 Live + Scenario 两处同步（或就该特性单独抽小组件复用）。
