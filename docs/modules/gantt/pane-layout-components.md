# Pane Layout Components

> Pane 布局系统组件实现
>
> Date: 2026-04-22
> Status: Implemented

## Component Hierarchy

```
AppLayout
├── GanttSubToolbar
│   ├── AddPaneButtons (+ Roster, + Pairing, + Flight)
│   └── ResetLayoutButton
│
├── LayoutGrid (new)
│   ├── GridRow[0]
│   │   ├── SharedTimeline (if single pane)
│   │   ├── SharedScrollbar (if single pane)
│   │   ├── GridCell[0,0]
│   │   │   └── PaneWrapper
│   │   │       ├── MiniTimeline (if split)
│   │   │       ├── RosterPane / PairingPane / FlightPane  (drag/close props passed in)
│   │   │       └── MiniScrollbar (if split)
│   │   └── GridCell[0,1] (or null for span-full)
│   │
│   └── GridRow[1]
│       └── ... (same structure)
│
├── StatusBar
└── AddPaneMenu (popup)
```

## LayoutGrid

根布局容器，渲染 2x2 网格。

**File:** `gantt/src/components/layout/layout-grid.tsx`

```typescript
export const LayoutGrid = () => {
  const grid = useLayoutStore(s => s.grid)

  return (
    <div className="flex flex-col flex-1 overflow-hidden gap-1 p-1">
      <GridRow row={0} cells={grid[0]} />
      <GridRow row={1} cells={grid[1]} />
    </div>
  )
}
```

## GridRow

行容器，处理共享时间轴和滚动条。

**File:** `gantt/src/components/layout/grid-row.tsx`

**Props:**
- `row: 0 | 1` - 行索引
- `cells: [string | null, string | null]` - 行内的 Pane ID

**Behavior:**
- 单 Pane 时显示 SharedTimeline 和 SharedScrollbar
- 双 Pane 时隐藏共享组件，使用 MiniTimeline/MiniScrollbar
- 单 Pane 时跳过 col 1 渲染（span-full）

```typescript
export const GridRow = ({ row, cells }: GridRowProps) => {
  const paneCount = cells.filter(Boolean).length
  const isSplit = paneCount === 2
  const hasPanes = paneCount > 0

  return (
    <div className="flex flex-col flex-1 overflow-hidden border border-border rounded-md">
      {hasPanes && !isSplit && <SharedTimeline row={row} />}
      {hasPanes && !isSplit && <SharedScrollbar row={row} />}
      <div className="flex flex-1 overflow-hidden">
        {cells.map((paneId, colIndex) => {
          if (paneCount === 1 && colIndex === 1) return null
          return <GridCell key={colIndex} row={row} col={colIndex} paneId={paneId} spanFull={paneCount === 1} />
        })}
      </div>
    </div>
  )
}
```

## GridCell

单元格容器，处理拖拽放置逻辑。

**File:** `gantt/src/components/layout/grid-cell.tsx`

**Props:**
- `row: 0 | 1`
- `col: 0 | 1`
- `paneId: string | null`
- `spanFull: boolean`

**Behavior:**
- 空 PaneId 时显示 AddPaneButton
- 有 PaneId 时渲染 PaneWrapper
- 处理 dragover/dragleave/drop 事件
- 计算 drop indicator 位置（top/bottom/left/right）

## PaneWrapper

Pane 容器，组合时间轴、内容、滚动条，并将拖拽/关闭回调注入子 Pane。

**File:** `gantt/src/components/layout/pane-wrapper.tsx`

**Props:**
- `paneId: string`
- `row: 0 | 1`

**Behavior:**
- 从 `useLayoutStore` 取 `startDrag`, `endDrag`, `closePane`
- 构造 `PaneDragProps` 并透传给各 Pane 组件（由 PaneToolbar 渲染拖拽手柄和关闭按钮）
- 分行时渲染 MiniTimeline/MiniScrollbar
- 根据 Pane 类型渲染对应组件（RosterPane/PairingPane/FlightPane）

```typescript
export interface PaneDragProps {
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClose?: () => void
}

const renderPaneContent = (type: PaneType, paneId: string, dragProps: PaneDragProps) => {
  switch (type) {
    case 'roster': return <RosterPane paneId={paneId} {...dragProps} />
    case 'pairing': return <PairingPane paneId={paneId} {...dragProps} />
    case 'flight': return <FlightPane paneId={paneId} {...dragProps} />
  }
}
```

> **注**：PaneHeader（独立标题行）已于 2026-05-29 移除。拖拽手柄和关闭按钮现在集成在各 Pane 的 `PaneToolbar` 第一行中，以节省竖向空间。

## SharedTimeline

单 Pane 行的共享时间轴。

**File:** `gantt/src/components/layout/shared-timeline.tsx`

**Behavior:**
- 显示时间标签（每 4 小时）
- 同步该行第一个 Pane 的 scrollX
- 高度 28px

## MiniTimeline

分行时每个 Pane 的独立迷你时间轴。

**File:** `gantt/src/components/layout/mini-timeline.tsx`

**Behavior:**
- 显示时间标签（每 6 小时）
- 使用各自 Pane 的 scrollX
- 高度 20px（更紧凑）

## SharedScrollbar

单 Pane 行的共享水平滚动条。

**File:** `gantt/src/components/layout/shared-scrollbar.tsx`

**Behavior:**
- 同步该行的 scrollX
- 拖动时更新所有相关 Pane 的 viewport

## MiniScrollbar

分行时每个 Pane 的独立迷你滚动条。

**File:** `gantt/src/components/layout/mini-scrollbar.tsx`

**Behavior:**
- 每个 Pane 独立控制 scrollX
- 更新各自 Pane 的 viewport

## AddPaneButton

空单元格的添加 Pane 按钮。

**File:** `gantt/src/components/layout/add-pane-button.tsx`

```typescript
export const AddPaneButton = () => (
  <div className="flex items-center gap-1 text-muted-foreground text-sm">
    <Plus className="w-4 h-4" />
    <span>Add Pane</span>
  </div>
)
```

## DropIndicator

拖拽放置位置指示器。

**File:** `gantt/src/components/layout/drop-indicator.tsx`

**Props:**
- `position: 'top' | 'bottom' | 'left' | 'right'`

**Behavior:**
- 根据位置显示对应边缘的高亮条
- 半透明 primary 颜色

## AddPaneMenu

添加 Pane 的弹出菜单。

**File:** `gantt/src/components/layout/add-pane-menu.tsx`

**Behavior:**
- 居中弹出
- 显示 Roster/Pairing/Flight 选项
- 达到 4 Pane 限制时显示提示
- 点击选项后调用 layoutStore.addPane

---

## Files

```
gantt/src/components/layout/
├── layout-grid.tsx
├── grid-row.tsx
├── grid-cell.tsx
├── pane-wrapper.tsx
├── shared-timeline.tsx
├── mini-timeline.tsx
├── shared-scrollbar.tsx
├── mini-scrollbar.tsx
├── add-pane-button.tsx
├── drop-indicator.tsx
└── add-pane-menu.tsx
```

---

*Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>*