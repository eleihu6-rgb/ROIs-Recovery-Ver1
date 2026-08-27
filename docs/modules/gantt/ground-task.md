# Ground Task Create & Edit

> 地面任务创建与编辑功能 — 非飞行任务（standby、training、leave 等）的直接管理

## 功能概述

地面任务（Ground Task）是 `roster_flight` 表中 `pairing_id = NULL` 的记录，代表非飞行职责（机场待命、培训、休假、模拟机、行政等）。本功能支持排班员在 Gantt 界面直接创建和编辑地面任务。

## 核心特性

| 特性 | 说明 |
|------|------|
| 批量创建 | 支持多机组同时创建（单次 API 调用，原子事务） |
| Assignment 自动填充 | 选择 Assignment 后自动填充 Assignment Group |
| 本地时区输入 | 跟随 Gantt 选定的 Display Timezone，标注基地机场代码（如 YOW） |
| REST 时间渲染 | 根据 `act_rest_min` 显示 REST 区块 |
| 草稿模式集成 | 支持 Undo/Redo，批量操作一次撤销 |
| 多触发入口 | 工具栏按钮、右键菜单、双击编辑 |

## 数据模型

### roster_flight 扩展

新增字段：

```sql
ALTER TABLE roster_flight ADD COLUMN act_rest_min integer;
```

**语义：**
- 地面任务：从 `assignment.rest_time` 复制（插入时）
- 飞行任务：始终 NULL（飞行任务的 REST 来自 `pairing_segment.duty_act_rest_min`）

### Assignment Group 代码

系统使用**简短代码**标识 Assignment Group：

| Code | 全称 | 说明 |
|------|------|------|
| FLT | Flight | 飞行任务 |
| DHD | Deadhead | 调机 |
| GND | Ground | 地面值勤 |
| ADM | Admin | 行政 |
| LVE | Leave | 假期 |
| SBY | Standby | 待命 |
| TRN | Training | 训练 |

> **注意**：前端过滤地面任务时使用 `defaultAssignmentGroup !== 'FLT' && !== 'DHD'`

### 地面任务字段规则

| 字段 | 地面任务值 |
|------|-----------|
| `pairing_id` | NULL |
| `assignment` | 用户选择（排除 FLT、DHD 组） |
| `assignment_group` | 从 assignment 自动填充 |
| `base` | 从 `crew_base` 查询生效 Base |
| `acting_rank` | 空字符串 `''` |
| `source` | `'MANUAL'` |
| `act_rest_min` | 从 assignment.rest_time 复制 |

### 可选 Assignment 类型

地面任务可选的 Assignment（排除 FLT/DHD 组）：

| Assignment | Description | Group |
|------------|-------------|-------|
| OFC | Office Duty / 办公室 | GND |
| BRF | Briefing / 讲评 | GND |
| MTG | Meeting / 会议 | ADM |
| MED | Medical Check / 体检 | ADM |
| TRN | Training / 训练 | TRN |
| SIM | Simulator / 模拟机 | TRN |
| CRE | CRE / 复训考核 | TRN |
| SBY | Standby / 待命 | SBY |
| ASBY | Airport Standby / 机场待命 | SBY |
| DO | Day Off / 休息日 | LVE |
| AL | Annual Leave / 年假 | LVE |
| SL | Sick Leave / 病假 | LVE |
| ML | Maternity Leave / 产假 | LVE |
| CL | Compassionate / 事假 | LVE |
| PH | Public Holiday / 法定假 | LVE |

## API 端点

### POST /api/roster/create-ground-task

批量创建地面任务（单次事务）。

**Request:**

```typescript
{
  crewIds: string[]       // 机组 ID 数组，至少 1 个
  assignment: string      // Assignment 代码，如 "SBY"
  startDtUtc: string      // ISO 8601 UTC
  endDtUtc: string        // ISO 8601 UTC
  comments?: string       // 备注（可选）
  username?: string       // 操作用户（默认 system）
}
```

**Response:** 成功返回创建的 `roster_flight` 行数组

**错误处理：**

| 场景 | HTTP 状态 | 错误信息 |
|------|----------|---------|
| endDtUtc ≤ startDtUtc | 400 | `endDtUtc must be after startDtUtc` |
| Assignment 不存在 | 400 | `Assignment 'XXX' not found` |
| 机组无 crew_base | 400 | `No valid crew_base record for F8001, F8002 on 2026-05-08...` |

**原子性保证：** 事务内执行，任一机组失败则全部回滚。

## 前端实现

### UI Store (ui-store.ts)

```typescript
// Dialog 状态
groundTaskDialogOpen: boolean
groundTaskMode: 'create' | 'edit'
groundTaskEditItem: RosterItem | null
groundTaskPrefill: { crewId?, startDate?, startTime? } | null

// Actions
openGroundTaskCreate(prefill?)  // 打开创建对话框
openGroundTaskEdit(item)        // 打开编辑对话框
closeGroundTaskDialog()         // 关闭对话框
setGroundTaskPrefill(prefill)   // 设置预填充（不打开对话框）
```

### GroundTaskDialog 组件

**创建模式：**

| 字段 | 控件 | 说明 |
|------|------|------|
| Crew IDs | Tag 输入 | 多选，Enter/逗号/空格添加 |
| Assignment | 原生 select | 从 `/api/assignment` 加载；过滤 `defaultAssignmentGroup !== 'FLT' && !== 'DHD'` |
| Assignment Group | 只读显示 | 自动填充 |
| Start | Date + Time | 本地时区输入（Display Timezone），时区代码显示在输入框右侧，可预填充 |
| End | Date + Time | 本地时区输入（Display Timezone），时区代码显示在输入框右侧 + Duration 显示 |
| Remark | Textarea | 可选备注 |

**编辑模式：**

- Crew ID 锁定（Lock 图标）
- 所有其他字段可编辑
- Danger Zone 含 Delete 按钮

**实现方式：** 固定定位 overlay `z-[9999]`，与 filter-dialog/rule-confirm-dialog 一致，保证在所有 Gantt overlay 之上。

### 时间转换

地面任务对话框使用 Gantt 选定的 Display Timezone（IANA，如 `America/Toronto`）进行输入和回显，而非原始 UTC。

**辅助函数（gantt-utils.ts）：**

| 函数 | 方向 | 说明 |
|------|------|------|
| `localToUtc(dateStr, timeStr, timezone)` | 本地 → UTC | 以 UTC 正午为参考点调用 `getTimezoneOffset` 获取 DST 感知偏移量，然后将本地日期+时间转换为 UTC ISO 字符串 |
| `utcToLocalDate(utcTs, timezone)` | UTC → 本地日期 | 使用 `Intl.DateTimeFormat` 将 UTC 时间戳转为本地 `YYYY-MM-DD` 字符串，供编辑模式回显 |
| `utcToLocalTime(utcTs, timezone)` | UTC → 本地时间 | 使用 `Intl.DateTimeFormat` 将 UTC 时间戳转为本地 `HH:MM` 字符串，供编辑模式回显 |
| `getTimezoneOffset(utcTime, timezone)` | — | 返回有符号分钟偏移（正数=东区，负数=西区），DST 感知 |

**右键预填充：** 画布点击坐标对应的时间通过 `Intl.DateTimeFormat` 按 Display Timezone 转换后预填入对话框（而非直接使用 UTC 值）。

**编辑模式：** 从数据库读取的 UTC 时间戳通过 `utcToLocalDate` / `utcToLocalTime` 转换为本地时区的日期和时间，填入各字段；提交时再通过 `localToUtc` 转回 UTC 发送给后端。

### Roster Store (roster-store.ts)

```typescript
addGroundTask(paneId, data): Promise<RosterItem[] | null>
```

- 草稿模式：创建 mock items，添加 `add-ground-task` 操作
- 直接模式：调用 API，更新状态

### Draft Op 类型

```typescript
type: 'add-ground-task'
groundTaskData: { crewIds, assignment, startDtUtc, endDtUtc, comments? }
mockItems?: RosterItem[]  // 临时渲染项（可选）
```

**Undo 行为：** 单次撤销移除所有 N 个 mock items。

**服务端 Zod Schema：** `live-server/src/routes/draft/draft.ts` 中的 discriminated union 已包含 `add-ground-task` 分支，字段为 `type: 'add-ground-task'`、`groundTaskData: { crewIds, assignment, startDtUtc, endDtUtc, comments? }` 及可选的 `mockItems`。

## 地面任务 Puck 渲染

地面任务 Puck（`pairingId === null`）在 `roster-renderer.ts` 中独立处理，与飞行任务使用不同高度和布局。

### 尺寸与位置

- **高度：** 使用 `SEGMENT_FLIGHT_HEIGHT`（20 px），而非旧的 `TASK_HEIGHT`（30 px）
- **垂直居中：** 在行高内垂直居中绘制
- **REST 区块：** 高度也同步更新为 20 px

### 文字布局（按 Puck 宽度自适应）

| 宽度 | 显示内容 |
|------|---------|
| ≥ 70 px（宽） | 粗体 Assignment 代码居中（`y + taskH/2 - 3`）；开始时间左对齐 + 结束时间右对齐（`y + taskH/2 + 4`，等宽字体） |
| ≥ 30 px（中） | Assignment 代码居中 |
| ≥ 16 px（窄） | 3 字符缩写居中 |

### 颜色

地面任务颜色通过 `assignment-store` 的 `getAssignmentColor(task.assignment, task.assignmentGroup)` 获取：

1. 优先使用 `assignment.color_hex`（每个 assignment 单独配色）
2. fallback 到 assignment group 颜色（与飞行任务一致的 `getColor(group)` 路径）

飞行任务仍使用 `getColor(task.assignmentGroup)`（组级颜色），不受 per-assignment 颜色影响。

### assignment-store 变更

- `fetchGroups()` 并发加载 `/api/assignment/group` 和 `/api/assignment`
- 构建 `assignmentColorMap: Map<string, string>`（assignment 代码 → `#RRGGBB`）
- 新增 `getAssignmentColor(assignment: string | null, group: string): string`

## 触发入口

| 入口 | 行为 |
|------|------|
| 工具栏 SquarePlus 按钮 | 打开创建对话框（无预填充） |
| Roster Pane 空白区域右键 | 打开创建对话框（预填充 crewId + 时间） |
| 地面任务右键菜单 | "Edit Ground Task" 选项 |
| 地面任务双击 | 打开编辑对话框 |

## REST 区块渲染

地面任务条结束后，如有 `actRestMin > 0`，渲染 REST 区块：

- **位置：** 任务条右侧
- **宽度：** `actRestMin` 分钟 × `pxPerHour`
- **样式：** 与飞行任务 REST 相同（半透明背景、虚线边框、"REST" 标签）

```typescript
// roster-renderer.ts
if (task.pairingId === null && task.actRestMin > 0) {
  // 绘制 REST 区块
}
```

## 类型定义

### CreateGroundTaskInput

```typescript
interface CreateGroundTaskInput {
  crewIds: string[]
  assignment: string
  startDtUtc: string
  endDtUtc: string
  comments?: string
}
```

### UpdateRosterInput 扩展

```typescript
interface UpdateRosterInput {
  // ...existing fields
  assignment?: string
  assignmentGroup?: string
  actRestMin?: number | null
}
```

### RosterItem 扩展

```typescript
interface RosterItem {
  // ...existing fields
  actRestMin?: number | null  // 地面任务 REST 时间
}
```

## 测试覆盖

后端测试（Vitest）：

- ✅ 批量创建返回正确结果
- ✅ 缺失 crew_base 返回错误（列出机组 ID）
- ✅ Assignment 不存在返回错误
- ✅ 原子性验证（部分失败时全部回滚）

## 数据初始化

Seed 脚本：`sql/seed/03-assignment.sql`

包含：
- 7 个 assignment_group（FLT/DHD/GND/ADM/LVE/SBY/TRN）
- 19 个 assignment 类型
- 19 个 assignment_group_map 映射

## 关联文档

- [roster-pane.md](roster-pane.md) — Roster Pane 交互
- [draft-mode.md](draft-mode.md) — 草稿模式机制
- [assignment-types.md](assignment-types.md) — Assignment 类型体系
- 设计规格：`docs/superpowers/specs/2026-05-06-ground-task-design.md`