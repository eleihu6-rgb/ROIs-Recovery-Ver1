# ROIS-AI Gantt Pane Layout Design

> 四面板解耦重构设计方案
>
> Date: 2026-04-22
> Status: Implemented (2026-04-22)

## 1. Overview

### 1.1 Background

当前甘特图界面采用 `PaneContainer` 管理四个面板，存在以下问题：

- **耦合度高**: 所有面板共享全局 scrollX、pxPerHour、dateRange
- **硬编码布局**: 面板顺序和可见性无法自定义
- **单实例限制**: 每种面板类型只能有一个实例
- **缺乏拖拽**: 面板位置固定，用户无法调整布局

### 1.2 Goals

- 面板完全解耦，每个 Pane 实例独立管理 viewport 状态
- 支持 2x2 网格布局，用户可拖拽调整面板位置
- 支持同时打开多个相同类型的 Pane 实例
- 单 Pane 时自动撑满整行，两 Pane 时 50/50 分栏
- Shared Timeline 机制：单 Pane 共享时间轴，双 Pane 独立

### 1.3 Constraints

- 最多 4 个 Pane 同时打开
- 固定 2 行布局
- 每行最多 2 列
- Y 轴滚动始终独立

---

## 2. Layout Rules

### 2.1 Grid Structure

```
┌─────────────────────────────────────────┐
│  Toolbar (DateRange, Filter, Zoom...)   │
├─────────────────────────────────────────┤
│  Row 0                                  │
│  ┌─────────────┬─────────────┐  ← 2 cols│
│  │ Pane A      │ Pane B      │          │
│  └─────────────┴─────────────┘          │
│  ┌───────────────────────────┐  ← 1 col │
│  │ Pane A (spans full row)   │          │
│  └───────────────────────────┘          │
├─────────────────────────────────────────┤
│  Row 1                                  │
│  └───────────────────────────────────── │
├─────────────────────────────────────────┤
│  Status Bar                             │
└─────────────────────────────────────────┘
```

### 2.2 Placement Rules

| Condition | Behavior |
|-----------|----------|
| Row has 1 Pane | Pane spans full row width |
| Row has 2 Panes | Each Pane takes 50% width |
| Total Panes = 0 | Show "Add Pane" placeholder |
| Total Panes ≥ 4 | Disable add, show "Max 4 panes" |

### 2.3 Timeline & Scroll Rules

| Row State | Timeline | X Scroll | Y Scroll |
|-----------|----------|----------|----------|
| 1 Pane | Shared timeline above row | Shared scrollbar | Independent per pane |
| 2 Panes | Mini timeline per pane | Independent scrollbar | Independent per pane |

### 2.4 Drag & Drop Rules

| Scenario | Allowed Actions |
|----------|-----------------|
| Total Panes = 1 | Drag disabled |
| Total Panes > 1 | Drag enabled via header handle |
| Drop on empty cell | Move pane to empty position |
| Drop on single-pane row (left/right) | Split into 2-column layout |
| Drop on single-pane row (top/bottom) | Move to other row |
| Drop on 2-pane row | Only top/bottom allowed |
| Same row, 2 panes | Can swap positions |
| Pane closed | Remaining pane auto-consolidates |

---

## 3. Architecture Summary

### 3.1 Component Hierarchy

```
AppLayout
├── GanttSubToolbar
│   ├── AddPaneButtons (+ Roster, + Pairing, + Flight)
│   └── ResetLayoutButton
├── LayoutGrid
│   ├── GridRow[0] / GridRow[1]
│   │   ├── SharedTimeline / SharedScrollbar (single pane)
│   │   └── GridCell[0,0] / GridCell[0,1]
│   │       └── PaneWrapper
│   │           ├── PaneHeader (draggable)
│   │           ├── MiniTimeline / MiniScrollbar (split)
│   │           └── RosterPane / PairingPane / FlightPane
├── StatusBar
└── AddPaneMenu (popup)
```

### 3.2 Store Architecture

- **layout-store.ts**: Grid state, pane instances, drag-drop logic
- **pane-instance-store.ts**: Per-pane viewport/selection accessor
- **pane-store.ts (legacy)**: Adapter for backward compatibility

---

## 4. Design Decisions

### 4.1 Why 2x2 Grid?

- **Simplicity**: Fixed grid reduces complexity
- **Predictability**: Users know max 4 panes
- **Timeline sharing**: Easier to implement shared timeline
- **Performance**: Limited grid cells reduce re-render

### 4.2 Why Per-Pane Independent Viewport?

- **User flexibility**: Different zoom levels per pane
- **Task comparison**: Compare different time ranges
- **Decoupling**: Removes dependency on global state

### 4.3 Why No Sync Groups?

- **Complexity**: Sync groups add UI and state complexity
- **User confusion**: "Which pane is synced?" unclear
- **Independent preferred**: Users preferred independent control

---

## 5. Implementation Status

| Phase | Status |
|-------|--------|
| Phase 1: Types & Stores | ✅ Completed |
| Phase 2: Layout Components | ✅ Completed |
| Phase 3: Pane Refactor | ✅ Completed |
| Phase 4: Integration | ✅ Completed |
| Phase 5: Testing | Pending (optional) |

---

## 6. Related Documents

- **[pane-layout-types.md](pane-layout-types.md)** - 类型定义详细说明
- **[pane-layout-components.md](pane-layout-components.md)** - 组件实现详细说明
- **[pane-layout-stores.md](pane-layout-stores.md)** - Store 实现详细说明
- **pane-layout-demo.html** - 交互式演示原型

---

*Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>*