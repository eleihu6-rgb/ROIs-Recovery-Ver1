# Pane Layout Types

> Pane 布局系统类型定义
>
> Date: 2026-04-22
> Status: Implemented

## Core Types

### PaneType

```typescript
// Pane type identifiers (simplified)
export type PaneType = 'roster' | 'pairing' | 'flight'
```

### PaneInstance

Pane 实例配置，包含唯一 ID、类型、标题和独立的状态。

```typescript
export interface PaneInstance {
  id: string              // Unique instance ID (e.g., 'roster-1', 'roster-2')
  type: PaneType
  title: string           // Display title (e.g., 'Roster #1')

  viewport: PaneViewport
  selection: PaneSelection
  selectedTaskIds: string[]  // Array for JSON serialization
}
```

### PaneViewport

每个 Pane 实例独立的视口状态（完全解耦）。

```typescript
export interface PaneViewport {
  scrollX: number       // Horizontal scroll position (0-100%)
  scrollY: number       // Vertical scroll position (pixels)
  zoom: number          // Pixels per hour (20-100)
}
```

### PaneSelection

每个 Pane 实例独立的选区状态。

```typescript
export interface PaneSelection {
  selectedRowIds: string[]   // IDs of selected rows
  frozenRowIds: string[]     // IDs of frozen/pinned rows
  sortColumn: string | null
  sortDirection: 'asc' | 'desc'
}
```

## Grid Types

### GridPosition

2x2 网格位置。

```typescript
export interface GridPosition {
  row: 0 | 1              // Top or bottom row
  col: 0 | 1              // Left or right column
}
```

### LayoutGrid

布局网格状态，固定 2x2 结构。

```typescript
export type LayoutGrid = [
  [string | null, string | null],  // Row 0
  [string | null, string | null]   // Row 1
]
```

### LayoutState

完整布局状态。

```typescript
export interface LayoutState {
  grid: LayoutGrid
  panes: Map<string, PaneInstance>
  readonly maxPanes: 4
}
```

## Interaction Types

### DragState

拖拽操作期间的状态。

```typescript
export interface DragState {
  paneId: string
  fromPosition: GridPosition
  dropPosition: 'top' | 'bottom' | 'left' | 'right' | 'center'
}
```

### SharedTimelineState

单 Pane 行的共享时间轴状态。

```typescript
export interface SharedTimelineState {
  row: 0 | 1
  scrollX: number
}
```

## Constants

### PANE_COLORS

Pane 类型颜色映射，用于标题指示器。

```typescript
export const PANE_COLORS: Record<PaneType, string> = {
  roster: '#3b82f6',    // blue
  pairing: '#22c55e',   // green
  flight: '#a855f7'     // purple
}
```

### PANE_NAMES

Pane 类型显示名称。

```typescript
export const PANE_NAMES: Record<PaneType, string> = {
  roster: 'Roster',
  pairing: 'Pairing',
  flight: 'Flight'
}
```

## Legacy Mapping

旧 PaneType 映射到新类型，用于向后兼容。

```typescript
const LEGACY_TO_NEW_PANE_TYPE: Record<string, PaneType> = {
  'roster-main': 'roster',
  'roster-sub': 'roster',
  'pairing': 'pairing',
  'flight': 'flight'
}
```

---

## Files

- `gantt/src/types/layout.ts` - 类型定义源文件
- `gantt/src/types/index.ts` - 类型导出（PaneType 别名为 LayoutPaneType）

---

*Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>*