# Pairing Pane

## 左侧固定列

### 双行布局（Two-line Layout）

每行 42px 高度，分为上下两行：
- **上行 (22px)**：PairingId, Type (DOM/INT), Fleet, BLH
- **下行 (18px)**：Composition（满配/未配状态）

| 字段 | 说明 | 示例 |
|------|------|------|
| pairingId | pairing_label 或 P-{id} | "F8001-2" 或 "P-123" |
| type | assignment 前三位 | "DOM" / "INT" |
| fleet | 机队代码 | "B787" |
| blh | blockMinutes 格式化 | "2h30m" |
| composition | 配员状态 | "FCN(2)FFO(2)" 或 "FCN(1:0)" 红色 |

### 配员显示规则

- **满配**: `FCN(2)FFO(2)` — 只显示 plan 数
- **未满配**: `FCN(1:0)FFO(1:0)` — 显示 plan:fill，红色文字

## Segment Mode 渲染

### 时间线结构

```
Duty 1: Pickup → Brief → [Flight Segments] → Debrief → Dropoff
                                                    ↓
                                              Layover (到 Duty 2)
                                                    ↓
Duty 2: Pickup → Brief → [Flight Segments] → Debrief → Dropoff
                                                    ↓
                                              Rest (签退后休息)
```

### 尺寸常量

| 元素 | 高度 | 说明 |
|------|------|------|
| Flight Puck | 20px | 航班段主体 |
| 所有条形 | 10px | Pickup/Brief/Layover/Debrief/Dropoff/Rest，高度 = 航班一半 |
| Row 高度 | 42px | 双行布局 |

### 条形位置

所有条形（Pickup/Brief/Layover/Debrief/Dropoff/Rest）与航班 Puck **底部对齐**：
```
barY = centerY + SEGMENT_FLIGHT_HEIGHT/2 - SEGMENT_BAR_HEIGHT
     = centerY + 10 - 10 = centerY
```

### 时间衔接规则

| 元素 | 开始时间 | 结束时间 | 说明 |
|------|---------|---------|------|
| **Pickup** | `pickupStartUtc` | `pickupEndUtc` | 签到时段 |
| **Brief** | `briefStartUtc` | `schStrDtUtc`（航班起飞） | 结束于航班开始 |
| **Flight** | `schStrDtUtc` | `schEndDtUtc` | 航班实际时段 |
| **Debrief** | `schEndDtUtc`（航班落地） | `debriefEndUtc` | 开始于航班结束 |
| **Dropoff** | `dropoffStartUtc` | `dropoffEndUtc` | 签退时段 |
| **Layover** | 前 Duty `dropoffEndUtc` | 后 Duty `pickupStartUtc` | Duty 间休息 |
| **Rest** | 最后 Duty `dropoffEndUtc` | `dropoffEndUtc + dutyActRestMin` | 签退后休息 |

### 颜色方案

| 元素 | 颜色 | 说明 |
|------|------|------|
| Flight (FLT) | `#14532d → #15803d` | 绿色渐变 |
| Flight (DH) | `#2d1b69 → #4c1d95` | 紫色渐变（置位） |
| Brief | `#f59e0b` | 琥珀色 |
| Debrief | `#94a3b8` | 灰蓝色 |
| Pickup/Dropoff | `#475569` | 灰色（半透明 0.7） |
| Layover | `rgba(34, 197, 94, 0.35)` | 绿色半透明 |
| Rest | `rgba(100, 116, 139, 0.30)` | 灰色半透明 |

### 标签显示

- Layover/Rest 文字居中于条形本身（X 轴 `barX + barWidth/2`，Y 轴 `barY + barHeight/2`）
- 显示条件：宽度 > 40px 显示 "LAYOVER"，宽度 > 30px 显示 "REST"
- 文字颜色：Layover `#15803d`（深绿），Rest `#475569`（深灰蓝）

### 航段 Puck 三列布局

| 宽度阈值 | 布局 | 内容 |
|---------|------|------|
| ≥60px | Full | 左: dep_arp + time, 中: flt_num, 右: arv_arp + time |
| 30-59px | Partial | flt_num 居中 |
| 16-29px | Minimal | flt_num 后 4 位 |

### 置位 (Deadhead) 样式

- 背景渐变: 紫色 `#2d1b69 → #4c1d95`
- 文字颜色: `#d8b4fe`
- 边框: `rgba(168, 85, 247, 0.35)`

## 时区支持

- `PairingRenderContext` 包含 `timezone: string` 字段
- 时间显示根据 `TimezoneSwitcher` 选择时区自动转换
- 使用 `formatTime(dtUtc, timezone)` 进行 IANA 时区转换

### 进退场字段设计（pairing_segment 表）

| 字段组 | 用途 | 赋值规则 |
|--------|------|---------|
| pickup/brief_start/end_utc | 首次签到 | Duty 内第一段 Segment |
| debrief/dropoff_start/end_utc | 首次签退 | Duty 内最后段 Segment |
| dutySchRestMin / dutyActRestMin | Rest 时长 | Duty 级别字段 |
| double_* | 第二次进退场 | 带休息 Duty 或大过站场景 |

业务场景：
1. **正常 Duty**: 一组 pickup/brief + debrief/dropoff
2. **带休息 Duty**: 先签退去酒店，再签回继续工作 → 使用 double_* 字段
3. **大过站**: 在 Segment 层级单独签到签出 → 使用 double_* 字段

## 冻结行

- 支持 Excel 式行置顶（详见 [frozen-rows.md](frozen-rows.md)）

## 交互

### 行选择

- 点击左侧面板行 → 选择整个 Pairing
- Ctrl+Click → 多选行
- Shift+Click → 范围选

### 航段选择

- **点击航段 puck** → 选择单个航段（虚线边框高亮）
- 用于删除单个航段操作
- 选中后右键菜单包含 "Delete Segment"

### 悬停信息

Hover 在航段 puck 上，状态栏显示：
```
Pairing #123  |  Seg #2  |  F8001 HKG-TPE  |  08:30 ~ 10:15
```

### 拖拽行为

| 操作 | 说明 |
|------|------|
| 拖拽航段 → Roster | 拖拽**整个 Pairing**（使用 pairingId，非 segmentId） |
| 拖拽航段 → Flight Pane | 不支持（Pairing 不可拆分） |

### 右键菜单

| 场景 | 菜单选项 |
|------|---------|
| 航段 puck | Select / Delete Segment / Freeze / Unfreeze |
| 背景（非 puck） | Freeze / Unfreeze |

### 点击测试

- 行高 42px（非默认 32px）
- Header 高度 40px（PAIRING_HEADER_HEIGHT）
- 航段 puck 垂直范围: `flightY ~ flightY + 20`
- Frozen rows: 无 scrollY 偏移

## Pairing → Roster 分配

从 `pairing` + `pairing_segment` 源表直接创建，不依赖已有 roster 数据。

字段映射：

| roster_flight | 数据来源 |
|---|---|
| crew_id | 拖拽目标 crew |
| pairing_id | pairing.id |
| base | pairing.base |
| label | `"{flt_num} {dep_arp}-{arv_arp}"` |
| assignment_group | pairing.assignment_group |
| assignment | segment.seg_assignment |
| division | pairing.division |
| flt_id, flt_dt | segment |
| duty_seq, seg_seq | segment |
| sch_str/end_dt_utc | segment |
| sch_credited_minutes | segment.sch_credited_minutes_seg |

分配后自动触发法规检查。