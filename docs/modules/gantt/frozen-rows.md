# 冻结行（Excel 式行置顶）

> 最后更新：2026-04-06

## 概述

类似 Excel 冻结窗格功能，将选中行置顶固定在 Pane 顶部，滚动时不跟随移动。适用于需要持续关注特定 Crew / Pairing / Flight 的排班场景。

## 功能规格

### 支持范围

三个 Pane 均支持冻结行：

| Pane | 冻结内容 | ID 标识 |
|------|---------|---------|
| Roster Main/Sub | Crew 行 | crewId |
| Pairing | Pairing 行 | pairingId |
| Flight | Flight 分组行 | registration |

### 操作方式

| 操作 | 方式 |
|------|------|
| 选择行 | 点击行（左侧面板区域） |
| 多选行 | Ctrl+Click 切换选中 |
| 范围选择 | Shift+Click 从上次点击到当前行 |
| 冻结选中行 | 右键菜单 → "Freeze Selected Rows" |
| 取消单行冻结 | 右键冻结行 → "Unfreeze Row" / 点击 pin 图标 |
| 取消全部冻结 | 右键菜单 → "Unfreeze All" |

### 视觉表现

- **选中行**：蓝色半透明背景高亮
- **冻结行**：置顶显示，右侧显示 📌 pin 图标（点击可解冻）
- **分隔线**：冻结区域与普通区域之间绘制 2px 实线分隔
- **滚动行为**：冻结行固定在顶部，普通行在冻结区域下方正常滚动

### 行重排逻辑

```
原始行数据（排序后）
  ↓
分离: frozenRowIds 匹配的行 → 冻结区
      其余行 → 普通区
  ↓
输出: [...冻结行（保持冻结顺序）, ...普通行（保持排序顺序）]
```

冻结行按冻结操作的先后顺序排列，非按原始排序。

## 技术实现

### Store 层（pane-store）

每个 Pane 独立维护冻结和选择状态：

```typescript
interface PaneInteractiveState {
  // ...existing fields
  frozenRowIds: string[]      // 冻结行 ID 列表（顺序即显示顺序）
  selectedRowIds: string[]    // 当前选中行 ID
  lastSelectedRowId: string | null  // Shift 范围选择锚点
}
```

关键方法：

| 方法 | 作用 |
|------|------|
| `freezeSelectedRows(pane)` | 将选中行追加到冻结列表，清除选择 |
| `unfreezeRow(pane, rowId)` | 移除单行冻结 |
| `unfreezeAll(pane)` | 清空全部冻结 |
| `selectRow(pane, rowId)` | 单选（清除其他） |
| `toggleRowSelection(pane, rowId)` | Ctrl+Click 切换 |
| `selectRowRange(pane, toRowId, allRowIds)` | Shift+Click 范围选择 |

### Canvas 渲染层

- `base-renderer.ts`：`rowY()` / `frozenZoneHeight()` 函数处理冻结区 Y 坐标偏移
- `pane-header-canvas.tsx`：绘制选中高亮、pin 图标、冻结分隔线
- `pane-canvas.tsx`：甘特图区域同步冻结行渲染

### 坐标计算

```
冻结行 Y = rowIndex × ROW_HEIGHT（不受 scrollY 影响）
普通行 Y = frozenZoneHeight + (rowIndex - frozenCount) × ROW_HEIGHT - scrollY
冻结分隔线 Y = frozenCount × ROW_HEIGHT
```

## 关键文件

| 文件 | 改动 |
|------|------|
| `gantt/src/stores/pane-store.ts` | frozenRowIds / selectedRowIds 状态 + 操作方法 |
| `gantt/src/components/gantt/renderers/base-renderer.ts` | rowY / frozenZoneHeight 坐标计算 |
| `gantt/src/components/gantt/pane-header-canvas.tsx` | 行选择 + pin 图标 + 分隔线渲染 |
| `gantt/src/components/gantt/pane-canvas.tsx` | 甘特图冻结行同步 |
| `gantt/src/components/panes/roster-pane.tsx` | 接入冻结行 + 行重排 |
| `gantt/src/components/panes/pairing-pane.tsx` | 接入冻结行 + 行重排 |
| `gantt/src/components/panes/flight-pane.tsx` | 接入冻结行 + 行重排 |
| `gantt/src/components/roster/context-menu.tsx` | 冻结/解冻菜单项 |
