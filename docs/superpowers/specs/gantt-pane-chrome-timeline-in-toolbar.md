# Gantt Pane Chrome 重构 — 时间轴上移至标题行

> 2026-06-03 · branch `feat/gantt/timeline-in-toolbar` · F54

## 需求（用户原话）

1. Move the timeline to the row where has label "Roster Main".
2. Move the filter chips down to the original timeline row.
3. Move the toolbar (REPLACE, sorting) down to the original timeline row.

## 改动后布局（每个 pane，自上而下）

| 行 | 内容 | 实现 |
|----|------|------|
| 标题行 (32px) | 左：拖拽柄 + 色标 + 标题 + 计数徽章（宽度钉在 `leftPanelWidth + 2`）；右：**TimeAxis 时间轴**（与下方 canvas 左缘对齐） | `pane-toolbar.tsx`（复用既有 `time-axis.tsx`，含拖拽缩放/月份点击缩放/右键菜单/双击复位） |
| 原时间轴带 (30px) | 左（虚拟线右侧起）：filter / global-filter / sort / quick-filter chips + Clear all；右：REPLACE、Sort、Search、Quick filter、Column settings、Close | 新组件 `pane-condition-strip.tsx`，绝对定位覆盖在 canvas 顶部 30px 带上；外层 `pointer-events-none`（不挡左列头点击），内容区 `pointer-events-auto` |
| Canvas | 顶部 30px 改画空白带（`drawHeaderBand`），行对齐数学（rowY/frozen/hit-test）完全不变 | `pane-canvas.tsx` / `base-renderer.ts` |

## 关键决策

- **复用 `TimeAxis`**：旧共享时间轴组件（含全部交互）原样上移进标题行，删除 `pane-canvas.tsx` 内重复的 header 拖拽缩放 overlay（消除一份重复实现）。
- **保留 30px header band**：canvas 仍保留空白带以维持左列头与数据行的垂直对齐，canvas 几何零改动 → 回归风险最小。
- **条件 chips 行（24px）取消**：chips 移入固定带后，加/删筛选不再引起内容上下跳动，每个 pane 省 24px。
- 三个 pane（Roster / Pairing / Flight）统一改造，`PaneToolbar` 与 `PaneConditionStrip` 共享。
- 旧 testid 不变：`pane-condition-strip` / `pane-filter-chip` / `pane-sort-chip`，既有用例不需要改。

## 测试（全部通过）

- 新增 `e2e/tests/gantt/pane-chrome-timeline-toolbar.spec.ts`（4 用例）：
  时间轴位于标题行且与 canvas 对齐；拖拽缩放 + 双击复位仍可用（`__ganttTest.zoom()` 真值）；
  REPLACE/Sort/Settings 位于带内且标题行无按钮、strip 可点击穿透；
  filter chip 在带内渲染且 canvas 不下移、× 可移除。
- 既有 `roster-condition-chips` / `roster-filter-chips` / `roster-default-sort` 全绿。
- gantt 全量 e2e：105 passed；5 fail 均为既有环境性失败（3×tunnel、scenario-run 后端持久化——stash 验证无本改动同样失败）。
