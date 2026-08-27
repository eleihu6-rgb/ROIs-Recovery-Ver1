# 草稿模式 + 任务锁定 + 多用户协同

## 核心原则

**所有数据变更操作（Roster / Pairing / Flight）必须走 draft → undo/redo → Save 流程，禁止直接调 API 入库。**

## 架构

```
┌─ 前端 ────────────────────────────────────────┐
│ draft-store: 操作日志（本地，不调 API）         │
│ lock-store: 锁状态（WebSocket 实时同步）        │
│ Canvas: 蓝线=自己的锁，红线=他人的锁            │
│ 工具栏: Delete + Undo + Redo + Save             │
└───────────────┬───────────────────────────────┘
                │ WS + REST
┌─ 后端 ───────┴───────────────────────────────┐
│ WebSocket /ws/locks: 锁事件广播                │
│ POST /api/locks/acquire|release|heartbeat      │
│ POST /api/draft/commit: 批量事务提交            │
└───────────────┬───────────────────────────────┘
                │
┌─ 数据层 ─────┴───────────────────────────────┐
│ Redis: lock:crew:{id}, lock:pairing:{id}      │
│       SET NX EX 300s + Lua 原子操作            │
│ PostgreSQL: 事务 replay 操作日志               │
└───────────────────────────────────────────────┘
```

## 操作类型

所有通过 draft-store 管理的操作：

| 操作 | type | 本地效果 | Save 时执行 |
|------|------|---------|------------|
| 移动 Roster 任务 | `move` | 改 crewId | `rosterApi.move()` |
| 交换 Roster 任务 | `swap` | 互换 crewId | `rosterApi.swap()` |
| 新增 Roster 任务 | `add` | 临时负 ID 添加 | `rosterApi.create()` |
| 更新 Roster 任务 | `update` | 本地合并字段 | `rosterApi.update()` |
| 删除单个 Roster 任务 | `remove` | 本地过滤移除 | `rosterApi.remove()` |
| 批量删除 Pairing + Crew 的所有任务 | `remove-pairing-from-crew` | 按 pairingId+crewId 过滤移除 | `rosterApi.removeByPairingAndCrew()` |
| **Pairing 拖拽分配给机组** | **`assign-pairing`** | **从 pairing-store 取 segments 生成占位 RosterItem（含 pickup/brief/debrief/dropoff 字段），本地显示** | **`rosterApi.assignPairing()`** |
| 删除 Pairing 本身 | `remove-pairing` | 本地移除 | `pairingApi.remove()` |
| 向 Pairing 添加航班 | `add-flight-to-pairing` | 本地添加 segment | `pairingApi.addSegment()` |
| 从航班创建 Pairing | `create-pairing-from-flights` | 本地创建 pairing | `pairingApi.createFromFlights()` |
| 创建地面任务 | `add-ground-task` | 临时负 ID 添加 N 条 mock items（Undo 一次移除全部 N 条） | `rosterService.createGroundTask()` |

### 批量删除设计要点

`remove-pairing-from-crew` 是单一 draft op，而非多个 `remove` op 的循环：
- **一次 markDirty()**：所有航段同时消失，而非逐段删除
- **Undo/Redo 正常**：移除 op 后重算 baseItems 即恢复全部航段
- **前端条件**：`pairingId != null` 时使用批量删除，`pairingId == null` 时用 `remove`

后续新增的 Pairing/Flight 增删改操作也必须扩展此表。

## 数据流

### base / displayed 分层

```
server fetch → baseItems（原始服务器数据，不可变）
                ↓
draft.applyDraftOps(baseItems) → rosterItems（显示数据）

Undo/Redo → 修改操作日志 → 重新 applyDraftOps(baseItems) → 更新 rosterItems
Save 成功 → baseItems = rosterItems（提升为新 base）
Discard   → rosterItems = baseItems（恢复原始）
```

### Save 双路径

```
有锁 → POST /api/draft/commit（批量事务，一个失败全回滚）
无锁 → 逐个调 roster/pairing API（降级模式，单用户场景）
```

## 任务锁定

### 锁获取

- 首次编辑 crew 时尝试获取 Redis 锁
- **锁获取失败不阻塞操作**（单用户降级）
- 锁范围：`lock:crew:{crewId}` + `lock:pairing:{pairingId}`
- TTL: 300 秒（5 分钟），心跳每 60 秒续租

### 多用户可视化

- WebSocket `/ws/locks` 实时广播
- 蓝色下划线：当前用户锁定的任务
- 红色下划线：其他用户锁定的任务
- 左侧面板：锁图标 + 用户名

### 冲突处理

- 锁冲突返回 409 + toast 提示
- 浏览器崩溃：锁 5 分钟后自动过期
- 关闭页面前 `beforeunload` 警告未保存

## Undo / Redo

- 操作日志 `operations[]` + `redoStack[]`
- Undo: 移除最后一个 op，从 base 重算 displayed
- Redo: 恢复 op，从 base 重算 displayed
- 快捷键：Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
- Draft 模式下不调 API，纯本地操作

## 关键文件

| 文件 | 职责 |
|------|------|
| `gantt/src/stores/draft-store.ts` | 操作日志 + commit/discard + applyDraftOps |
| `gantt/src/stores/lock-store.ts` | 锁状态 + WS 事件 + 心跳 |
| `gantt/src/stores/roster-store.ts` | 5 种操作的 draft/direct 双路径 |
| `gantt/src/services/ws.ts` | WebSocket 客户端 |
| `gantt/src/services/draft-api.ts` | 批量提交 API |
| `gantt/src/components/roster/draft-toolbar.tsx` | Delete + Undo + Redo + Save |
| `gantt/src/components/gantt/lock-overlay.ts` | Canvas 蓝/红下划线 |
| `live-server/src/plugins/websocket.ts` | WS 服务端 |
| `live-server/src/services/lock/lock-service.ts` | Redis 锁 |
| `live-server/src/routes/draft/draft.ts` | 批量提交端点 |
