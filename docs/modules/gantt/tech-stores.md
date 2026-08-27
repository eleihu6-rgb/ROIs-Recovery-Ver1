# Zustand Store 架构

## Store 清单

| Store | 职责 |
|-------|------|
| `gantt-view-store` | pxPerHour、zoomMin/Max、scrollX、selectedTaskIds、hoveredTaskId、hoverPosition、dirty |
| `pane-store` | Pane 布局（显隐/高度/leftPanelWidth）、per-pane sortColumn/dropTargetRow/frozenRowIds/selectedRowIds（scrollY 已迁移至 layout-store） |
| `layout-store` | Pane 实例管理（type/position/viewport）、per-pane scrollY/scrollX/zoom（新架构，替代 pane-store.scrollY） |
| `roster-store` | Roster 数据（main/sub 独立）、baseItems/rosterItems 分层、5 种 CRUD 操作 |
| `pairing-store` | Pairing 数据、筛选、removeItem |
| `flight-store` | Flight 数据 |
| `crew-store` | Crew 列表、selectedCrewIds、detailCache、qualsCache |
| `filter-store` | 日期范围、筛选维度、localStorage 记忆 |
| `draft-store` | 操作日志、undo/redo、commit/discard、applyDraftOps |
| `lock-store` | 锁状态（Map）、WS 事件、心跳、acquire/release |
| `assignment-store` | Assignment Group 列表、颜色映射（group + individual assignment.color_hex）、getColor/getAssignmentColor |
| `column-store` | 列配置（per-pane）、显隐/排序/宽度、localStorage 持久化 |
| `history-store` | Undo/Redo 命令栈（direct 模式用，draft 模式不用） |
| `rule-check-store` | 违规数据、preCheck、confirmDialog、ruleGroupCode |
| `summary-store` | 汇总条数据 |
| `ui-store` | 弹窗/右键菜单/statusBarText |
| `theme-store` | 当前主题 + 亮暗模式 |
| `timezone-store` | 当前显示时区（IANA zoneId + airport）、timezoneOptions、formatTime 工具函数 |
| `drag-store` | 跨 Pane 拖拽状态（legacy，现由 drag-handler 管理） |
| `scenario-store` | Scenario 模块：列表分页/搜索筛选、选中场景详情、编辑草稿（draftDetail）、KPI、保存/状态流转 |

## roster-store base/displayed 分层

```
fetchRoster → server data → baseItems
                              ↓
                    applyDraftOps(baseItems) → rosterItems

undo/redo → 修改 draft.operations → 重算 rosterItems from baseItems
save 成功 → baseItems = rosterItems（promote）
discard   → rosterItems = baseItems（revert）
```

## scrollY 存储迁移

`scrollY` 原存储于 `pane-store.interactiveState[paneType].scrollY`，现迁移至 `layout-store.panes.get(paneId).viewport.scrollY`：

| 操作 | Store | 说明 |
|------|-------|------|
| 滚动事件写入 | `layoutStore.setViewport(paneId, { scrollY })` | onScroll handler 直接写入 |
| Canvas 渲染读取 | `layoutStore.panes.get(paneId)?.viewport?.scrollY` | render loop 使用 |
| 拖拽 hitTest 读取 | `layoutStore.panes.get(paneId)?.viewport?.scrollY` | registerPane.getScrollY 回调 |

`pane-store.getScrollY()` 仍存在但已废弃，仅用于 legacy 兼容。新代码应统一从 `layout-store` 读取。

## Store 间依赖

```
roster-store → draft-store（draft 模式分支）
             → lock-store（acquireLock）
             → rule-check-store（preCheck）
             → gantt-view-store（markDirty）

draft-store → roster-store（via callback，避免循环导入）
            → lock-store（releaseAllLocks）
            → pairing-api / roster-api（commit 时执行）

lock-store → gantt-view-store（markDirty）
           → ws client（WebSocket 事件）

rule-check-store → crew-store（fetchQuals）
                 → rule-api（batch check）
```
