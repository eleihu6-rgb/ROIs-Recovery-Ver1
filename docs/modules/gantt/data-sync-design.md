# Gantt 数据同步设计（草稿）

> 状态：设计草稿，待详细讨论
> 创建：2026-05-02

## 问题背景

当前系统中存在三个核心数据层级：

```
Flight（航班源数据）
    ↓ 组环
Pairing Segment（环内航段）
    ↓ 排班
Roster Flight（机组排班）
```

**问题**：当任意层级数据变化时，下游数据未同步更新。

## 现状分析

### 后端更新行为

| 操作 | 当前行为 | 缺失 |
|------|---------|------|
| Flight 更新时间 | 只更新 flight 表 | pairing_segment、roster_flight 未同步 |
| Pairing Segment 更新 | 只更新 pairing_segment | roster_flight 未同步 |
| Roster Flight 更新 | 只更新 roster_flight | 无反向同步 |
| Flight 删除 | 预检查是否在 pairing 中 | 允许但有数据残留风险 |

### 前端刷新行为

| Pane | 数据来源 | 刷新时机 |
|------|---------|---------|
| Flight Pane | flight API | 用户手动刷新 |
| Pairing Pane | pairing API + segments | 用户手动刷新 |
| Roster Pane | roster API + JOIN pairing_segment | 用户手动刷新 |

**问题**：三个 Pane 独立刷新，数据可能不一致。

## 数据流向

### 正向数据流（创建）

```
1. Flight 导入 → flight 表
2. Pairing 创建 → 从 flight 选择 → pairing + pairing_segment 表
3. Pairing 分配 → 从 pairing_segment 复制 → roster_flight 表
```

### 应有的同步流（更新）

```
Flight 时间变化
    → 查找关联的 pairing_segment（通过 flt_id）
    → 更新 pairing_segment.sch_str_dt_utc / sch_end_dt_utc
    → 查找关联的 roster_flight（通过 pairing_id + duty_seq + seg_seq）
    → 更新 roster_flight.sch_str_dt_utc / sch_end_dt_utc

Pairing Segment 变化
    → 查找关联的 roster_flight
    → 同步更新 roster_flight 对应字段
```

## 待确认问题

### 1. 同步范围

哪些字段需要级联同步？

**必须同步**：
- 计划时间：`sch_str_dt_utc`、`sch_end_dt_utc`
- 实际时间：`act_str_dt_utc`、`act_end_dt_utc`

**可选同步**：
- 机场代码：`dep_arp`、`arv_arp`
- 航班号：`flt_num`
- 进退场时间：`pickup_*`、`brief_*`、`debrief_*`、`dropoff_*`

### 2. 同步时机

- **选项 A**：所有 Flight 更新都触发级联同步
- **选项 B**：只有明确的时间编辑操作才触发（如 Flight Detail Modal 保存）
- **选项 C**：提供显式 API `/api/flight/:id/sync-downstream`

### 3. 前端刷新策略

- **选项 A**：WebSocket 推送通知各 Pane 刷新
  - Flight 更新 → 推送 `flight-updated` → Pairing/Roster stores 刷新
  - Pairing 更新 → 推送 `pairing-updated` → Roster stores 刷新

- **选项 B**：用户手动刷新按钮
  - 提供 "Sync All Panes" 按钮

- **选项 C**：定时轮询刷新（简单但效率低）

### 4. 缓存失效

当前 Redis 缓存策略：
- Flight 更新 → `invalidate flight:*`
- Pairing 更新 → `invalidate pairing:*`
- Roster 更新 → `invalidate roster:*`

**缺失**：跨层级缓存失效
- Flight 更新 → 需同时失效 `pairing:*` 和 `roster:*`

## 可能的解决方案

### 方案 1：后端级联更新 + WebSocket 通知

**后端**：
```typescript
// flight-service.ts
async update(fastify, id, data, username) {
  // 1. 更新 flight
  const flight = await updateFlight(id, data)

  // 2. 级联更新 pairing_segment
  const segments = await findSegmentsByFltId(id)
  await updateSegments(segments, data)

  // 3. 级联更新 roster_flight
  const rosterItems = await findRosterBySegments(segments)
  await updateRosterItems(rosterItems, data)

  // 4. WebSocket 通知前端
  fastify.ws.broadcast('flight-updated', { flightId: id })

  return flight
}
```

**前端**：
```typescript
// WebSocket 监听
socket.on('flight-updated', (data) => {
  usePairingStore.getState().refresh()
  useRosterStore.getState().refresh()
})
```

**优点**：实时同步，数据一致
**缺点**：改动大，需要 WebSocket 基础设施

### 方案 2：显式同步 API

提供独立 API 用于手动触发同步：

```
POST /api/flight/:id/sync-downstream
POST /api/pairing/:id/sync-roster
```

**优点**：可控，不自动触发
**缺点**：需要用户手动操作

### 方案 3：数据库触发器（不推荐）

PostgreSQL 触发器自动同步。

**优点**：后端无代码
**缺点**：调试困难，与项目"废弃 Oracle 触发器"原则冲突

## 建议下一步

1. **确认同步范围和时机**
2. **选择前端刷新策略**（WebSocket vs 手动）
3. **设计级联更新 API**
4. **实现后端级联更新逻辑**
5. **实现前端刷新机制**

## 相关文档

- [pairing-pane.md](pairing-pane.md) — Pairing Pane 渲染规范
- [roster-pane.md](roster-pane.md) — Roster Pane 渲染规范
- [tech-stores.md](tech-stores.md) — Zustand Store 架构