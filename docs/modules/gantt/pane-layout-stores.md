# Pane Layout Stores

> Pane 布局系统状态管理
>
> Date: 2026-04-22
> Status: Implemented

## Store Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    layout-store.ts                      │
│  - grid: 2x2 array of pane IDs                         │
│  - panes: Map<string, PaneInstance>                    │
│  - paneCounters: Record<PaneType, number>              │
│  - dragState: DragState | null                         │
│                                                         │
│  Actions:                                               │
│  - addPane(type, row?, col?) → paneId                  │
│  - closePane(paneId)                                    │
│  - movePane(paneId, toRow, toCol, dropHint)            │
│  - startDrag(paneId, event)                            │
│  - endDrag()                                            │
│  - consolidateRow(row)                                  │
│  - resetLayout()                                        │
│  - setViewport(paneId, viewport)                       │
│  - setSelection(paneId, selection)                     │
└─────────────────────────────────────────────────────────┘
          │
          │ delegates to
          ▼
┌─────────────────────────────────────────────────────────┐
│                pane-instance-store.ts                  │
│  Convenience accessor layer                            │
│                                                         │
│  Viewport:                                              │
│  - getViewport(paneId)                                  │
│  - setScrollX(paneId, value)                            │
│  - setScrollY(paneId, value)                            │
│  - setZoom(paneId, value)                               │
│                                                         │
│  Selection:                                             │
│  - getSelection(paneId)                                 │
│  - setSelectedRows(paneId, ids)                         │
│  - toggleSelectedRow(paneId, id)                        │
│  - freezeRows(paneId, ids)                              │
│  - setSortColumn(paneId, column)                        │
│                                                         │
│  Tasks:                                                 │
│  - getSelectedTasks(paneId)                             │
│  - isTaskSelected(paneId, taskId)                       │
│  - selectTask(paneId, taskId)                           │
│  - toggleTaskSelection(paneId, taskId)                  │
│  - clearTaskSelection(paneId)                           │
└─────────────────────────────────────────────────────────┘

                    ↓ Legacy Adapter ↓

┌─────────────────────────────────────────────────────────┐
│                   pane-store.ts (legacy)               │
│  - LEGACY_TO_NEW_PANE_TYPE mapping                     │
│  - getPaneIdFromLegacyType()                           │
│  - delegateScrollYToLayoutStore()                      │
│  - Keep for backward compatibility                     │
└─────────────────────────────────────────────────────────┘
```

## layout-store.ts

核心布局状态管理。

**File:** `gantt/src/stores/layout-store.ts`

### Default State

```typescript
const DEFAULT_GRID: LayoutGrid = [
  ['roster-1', null],
  ['pairing-1', null]
]

const DEFAULT_COUNTERS: Record<PaneType, number> = {
  roster: 2,    // roster-1 已创建，下一个是 roster-2
  pairing: 2,
  flight: 1
}
```

### Actions

#### addPane(type, row?, col?)

添加新 Pane 到网格。

- 返回新 paneId，达到上限返回 null
- 自动查找空位置（若未指定 row/col）
- 自动生成唯一 ID（`{type}-{num}`）

#### closePane(paneId)

关闭 Pane。

- 从 grid 移除
- 从 panes Map 删除
- 自动 consolidateRow

#### movePane(paneId, toRow, toCol, dropHint)

移动/交换 Pane。

**Scenarios:**

| Scenario | Behavior |
|----------|----------|
| Empty target cell | Simple move, consolidate both rows |
| Same pane | No action |
| Split (single-pane row + left/right) | Split into 2-column |
| Swap (same row, both 2 panes) | Swap positions |
| Cross-row swap | Move to other row |

#### consolidateRow(row)

行合并：单 Pane 在 col 1 时移到 col 0。

```typescript
consolidateRow: (row) => {
  const { grid } = get()
  if (grid[row][1] !== null && grid[row][0] === null) {
    // Move pane from col 1 to col 0
    newGrid[row][0] = newGrid[row][1]
    newGrid[row][1] = null
  }
}
```

## pane-instance-store.ts

便捷访问层，委托给 layout-store。

**File:** `gantt/src/stores/pane-instance-store.ts`

### Viewport Operations

| Method | Behavior |
|--------|----------|
| `getViewport(paneId)` | 返回 viewport 或 undefined |
| `setScrollX(paneId, value)` | 设置 scrollX（clamp 0-100） |
| `setScrollY(paneId, value)` | 设置 scrollY（clamp >=0） |
| `setZoom(paneId, value)` | 设置 zoom（clamp 20-100） |

### Selection Operations

| Method | Behavior |
|--------|----------|
| `getSelection(paneId)` | 返回 selection |
| `setSelectedRows(paneId, ids)` | 设置选中行 |
| `toggleSelectedRow(paneId, id)` | 切换行选中状态 |
| `freezeRows(paneId, ids)` | 冻结行（去重） |
| `unfreezeRow(paneId, id)` | 解冻行 |
| `setSortColumn(paneId, column)` | 设置排序列（同列切换方向） |

### Task Selection

| Method | Behavior |
|--------|----------|
| `getSelectedTasks(paneId)` | 返回选中任务 ID 数组 |
| `isTaskSelected(paneId, taskId)` | 检查任务是否选中 |
| `selectTask(paneId, taskId)` | 单选任务 |
| `toggleTaskSelection(paneId, taskId)` | 切换任务选中 |
| `clearTaskSelection(paneId)` | 清空任务选中 |

## Legacy Adapter

在 pane-store.ts 顶部添加的兼容层。

```typescript
import { useLayoutStore } from './layout-store'
import type { PaneType as NewPaneType } from '@/types/layout'

const LEGACY_TO_NEW_PANE_TYPE: Record<string, NewPaneType> = {
  'roster-main': 'roster',
  'roster-sub': 'roster',
  'pairing': 'pairing',
  'flight': 'flight'
}

const getPaneIdFromLegacyType = (legacyType: string): string | null => {
  const newType = LEGACY_TO_NEW_PANE_TYPE[legacyType]
  if (!newType) return null
  
  const { panes } = useLayoutStore.getState()
  for (const [id, pane] of panes) {
    if (pane.type === newType) return id
  }
  return null
}
```

---

## Files

- `gantt/src/stores/layout-store.ts`
- `gantt/src/stores/pane-instance-store.ts`
- `gantt/src/stores/pane-store.ts` (legacy adapter)
- `gantt/src/stores/ui-store.ts` (openAddPaneMenu/closeAddPaneMenu)

---

*Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>*