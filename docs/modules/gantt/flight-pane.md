# Flight Pane

## Header badge

The Flight pane title badge shows **flight legs** (`flightTotal` from `listGrouped`), not RegNo rows after grouping / bin-pack (`total`). Filtered state: `filteredFlightTotal/unfilteredFlightTotal`.

## 左侧固定列

- 单行布局
- 字段：RegNo (Registration), Fleet
- 有机尾号行：显示原始 register（如 "B-1234"）
- 无机尾号行：显示 `[B787-1]`（方括号区分虚拟分组）

## 智能分组逻辑

### 两阶段分组（`groupFlights` in flight-store.ts）

```
Flight[]（API 扁平列表）
  ↓
阶段1 — 分桶:
  ├─ 有 register → 按机尾号分组
  └─ 无 register → 按 fleet 分组
  ↓
阶段2 — bin-packing 防重叠:
  有机尾号: 按时间排序，不重叠即可同行
  无机尾号: 链式连接优先（arvArp===depArp 同行），其次不重叠
  ↓
输出 FlightItem[]（每个子行 = 一个 Gantt 行）
```

### 行命名

| 场景 | registration 字段 | 左侧面板显示 |
|------|-------------------|-------------|
| 有机尾号，第 1 子行 | "B-1234" | B-1234 |
| 有机尾号，溢出子行 | "B-1234#2" | B-1234#2 |
| 无机尾号，fleet 分组 | "B787-1" | [B787-1] |

### 性能

- ISO 字符串比较替代 Date 解析（内循环零 GC）
- 3000 航班亚毫秒级完成

## 航班颜色规则

| 状态 | 颜色 |
|------|------|
| 配比满配 | 绿色 (#22c55e) |
| 配比未满 | 蓝色 (#3b82f6) |
| 航班取消 | 紫色背景 + 斜线标记 |
| 置位 (DH) | 紫色渐变 (#2d1b69 → #4c1d95) |

## Puck 布局（三列响应式）

航班块按宽度自动切换布局，内部为三列结构：

| 宽度阈值 | 布局 | 内容 |
|---------|------|------|
| ≥80px | Full | 左列: dep_arp + dep_time, 中列: flt_num, 右列: arv_arp + arv_time |
| 30-79px | Partial | 左列: dep_arp, 中列: flt_num |
| 16-29px | Minimal | flt_num 后 4 位 |
| <16px | Dot | 颜色圆点 (3px) |

### 三列结构

Full 布局下，puck 内部分为三列：
```
┌─────────────────────────────────────────────────────────┐
│  HKG         │    F8001    │          TPE              │
│  08:30       │             │          10:15            │
└─────────────────────────────────────────────────────────┘
```

### 字体与颜色

| 元素 | 字体 | 颜色 |
|------|------|------|
| 机场代码 (dep_arp/arv_arp) | 9px bold, sans-serif | #93c5fd (置位: #d8b4fe) |
| 时间 | 9px, monospace | #7dd3fc (置位: #c4b5fd) |
| 航班号 (flt_num) | 10px bold, sans-serif | white |

### 时区转换

时间显示根据 `TimezoneSwitcher` 选择时区自动转换：
- 使用 `formatTime(dtUtc, timezone)` 进行 IANA 时区转换
- 跨日航班在到达时间后显示 `+1` 标记

### Canvas 渲染关键代码

```typescript
// flight-renderer.ts
const drawFlightBlock = (rc, flight, rowIndex) => {
  // 宽度判断
  if (width >= PUCK_WIDTH_FULL) {
    drawFullPuck(ctx, flight, x, y, width, height, timezone, isDeadhead)
  } else if (width >= PUCK_WIDTH_PARTIAL) {
    drawPartialPuck(ctx, flight, x, y, width, height, isDeadhead)
  } ...
}

// 跨日判断
const depLocal = new Date(depDate.toLocaleString('en-US', { timeZone: timezone }))
const arvLocal = new Date(arvDate.toLocaleString('en-US', { timeZone: timezone }))
const isCrossDay = arvLocal.getDate() !== depLocal.getDate()
```

## 冻结行

- 支持 Excel 式行置顶（详见 [frozen-rows.md](frozen-rows.md)）

## 交互

- 点击选中，Ctrl+Click 多选，Shift+Click 范围选
- **双击** Puck → 打开 Flight Detail Modal
- 右键菜单：**Flight Detail** / Select / Create Pairing (N flights) / Pin Selected Rows / Unpin All
- 工具栏 PackagePlus 按钮：从选中航班创建 Pairing

### Canvas 原生右键菜单抑制

Canvas 区域和自定义右键菜单都禁用浏览器原生 contextmenu。实现：

| 层级 | 位置 | 作用 |
|---|---|---|
| App 级 capture handler | `gantt/src/App.tsx` `AuthenticatedApp` useEffect | window 捕获阶段全局拦截 `<canvas>` 和 `[data-gantt-area]` 容器内的事件 |
| 容器标记 | `pane-canvas` / `gantt-canvas` / `pane-header-canvas` 容器 div | `data-gantt-area` 属性让 App 级 handler 命中所有子元素（含 overlay）|
| 自定义菜单自身 | `roster/context-menu.tsx` 根 div | 防止菜单弹出后右键命中菜单本身导致原生菜单浮在上面 |

## Flight Detail Modal

**触发**: 双击 Puck 或右键菜单 → Flight Detail

**实现**: `gantt/src/components/flight/flight-detail-dialog.tsx` + `flight-detail-dialog.css`

**设计稿**: [docs/modules/gantt/flight-detail-modal.html](flight-detail-modal.html)

### 数据来源

| 字段 | API |
|---|---|
| 航班基础信息 | `GET /api/flight/:id` (live-server `flight-service.getById`) |
| 机组分配 + 编组计数 + 满员状态 | `GET /api/flight/:id/crew` (live-server `flight-service.getCrewList`) |

### 布局

- **Header**: 航班号 / 日期 / 编组状态 badge (Full/Partial/Cancelled) / 类型 badge / 关闭按钮
- **Route Banner**: 起飞机场 → 航班号 + 机型 → 到达机场 + Fleet/Reg/Airline 元信息
- **Times Grid**: 双列 STD/ETD/ATD + STA/ETA/ATA，含延误 delta
- **Duration Row**: Block Hours / Flight Time / Flight Date / Status (On Time / Delayed / Cancelled)
- **Composition Cards**: CA/FO/PU/FA 实际/计划数，超员 amber、缺员 red
- **Crew Table**: Seq / Crew ID / Name / Rank / Acting / Label / Source / MBH / MFDP，缺员 rank 在末尾追加 dashed `—` 提示行
- **Footer**: 更新时间 + 机组数量 / 总坑位

### 滚动行为

整个 modal body 只有**一个外层滚动**，crew table 内部不再独立滚动。`thead` 用 `position: sticky; top: 0` 实现表头吸顶，方便长机组列表浏览。

### 主题集成

CSS token 全部用 `--fdd-` 前缀（避免和系统 `:root` 的 `--card`、`--muted`、`--border`、`--primary` 自引用冲突），值从主系统 HSL token 派生：

```css
--fdd-card: hsl(var(--card));
--fdd-panel: hsl(var(--secondary));
--fdd-card-hi: hsl(var(--accent));
--fdd-primary: hsl(var(--primary));
--fdd-primary-dim: hsl(var(--primary) / 0.12);
--fdd-fg: hsl(var(--foreground));
--fdd-fg-sec: hsl(var(--muted-foreground));
```

切换 Ocean Blue / Dark Pro / Emerald Green / Sunset Orange / Slate Gray 任意主题时对话框自动跟随。

**保持固定**（categorical / semantic，不随主题变化）：
- Rank pill: CA 蓝 / FO 紫 / PU 青 / FA 橙（与 Gantt canvas Puck 配色一致）
- Status: green=Full/On Time / amber=Partial/Delayed / red=Cancelled / sky=PAX type
- 暗色模式下 status 颜色亮一档，用 `.dark .flight-detail-dialog-root` 覆盖

### 关键实现细节

- **不用 Radix Dialog/Portal**：观察到 Radix Dialog 在 loading→loaded 状态切换时 portal 节点重建会闪过，改用纯 `position: fixed` div + 点击 overlay/ESC 关闭
- **常驻挂载**：`<FlightDetailDialog />` 在 `app-layout.tsx` 始终渲染，靠 `useUiStore.flightDetailOpen` 控制可见
- **数据加载时不访问 `flight.x` / `crewData.x`**：`open && flight && crewData && !loading && !apiError` 才进 `<LoadedDetail>` 子组件，否则渲染 Loading/Error 占位
- **`<LoadedDetail>` 把 flight + crewData 作为必填 props 传入**：TS narrowing 干净，主组件 JSX 中再也不会因为 null 触发 render error

## 拖拽

| 目标 | 操作 | 状态 |
|------|------|------|
| Pairing Pane | add-flight-to-pairing（添加航段到已有 Pairing） | 已完成 |
| Roster Pane | assign-flight（分配航班到 crew） | TODO |

### 拖拽字段

拖拽时使用 `pairing_segment` 字段而非 flight 原始字段：

| HitTestResult 字段 | 来源 |
|------|------|
| itemId | flight.id |
| segmentId | flight.pairing_segment?.id（如已属于 Pairing） |
| pairingId | flight.pairing_segment?.pairingId |

## 从航班创建 Pairing

三种触发方式：

1. **右键菜单** — 选中航班 → 右键 → "Create Pairing (N flights)"
2. **工具栏按钮** — Ctrl+Click 多选 → Flight Pane 工具栏 📦+ 按钮
3. **快捷键** — Ctrl+Click 多选 → Ctrl+Q

### 流程

```
选中航班 → 触发 → draft.addOp('create-pairing-from-flights', { flightIds })
  → Save 时:
    POST /api/pairing/create-from-flights { flightIds, base, division }
    → 后端: 查 flight 表 → 创建 pairing header + segments
    → 按出发时间排序，全部放入 duty 1
    → 自动计算 TAFB、seg_count
    → label = 航班号用 "-" 连接
```

### 数据映射

| pairing 字段 | 来源 |
|---|---|
| pairing_label | 航班号连接 "F8001-F8002" |
| fleet | 第一个航班的 fleet |
| sch_str/end_dt_utc | 第一个航班出发 ~ 最后一个航班到达 |
| tafb | (最后到达 - 第一个出发) 分钟数 |
| seg_count | 航班数量 |
| source | 'MANUAL' |

## 添加航段到已有 Pairing

拖拽 Flight → Pairing Pane 行：

```
drag Flight #123 → Pairing #16
  → draft.addOp('add-flight-to-pairing', { pairingId: 16, flightId: 123 })
  → Save 时:
    POST /api/pairing/:pairingId/segment { flightId }
    → 追加到最后一个 duty 的下一个 seg_seq
    → 复用已有 duty 的 brief/debrief 上下文
    → 更新 pairing.seg_count
```
