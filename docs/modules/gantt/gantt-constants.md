# Gantt Canvas 渲染常量

> 位置：`gantt/src/components/gantt/gantt-constants.ts`

## 尺寸常量

| 常量 | 值 | 说明 |
|------|-----|------|
| `ROW_HEIGHT` | 43px | Roster 默认行高 |
| `PAIRING_ROW_HEIGHT` | 42px | Pairing 行高（双行布局） |
| `PAIRING_HEADER_HEIGHT` | 30px | Pairing Header 高度（与 HEADER_HEIGHT 对齐，2026-05-29 从 40px 改为 30px） |
| `PAIRING_TOP_ROW_HEIGHT` | 16px | Pairing Header 上半行高（日期行） |
| `PAIRING_BOTTOM_ROW_HEIGHT` | 14px | Pairing Header 下半行高（小时刻度） |
| `HEADER_HEIGHT` | 30px | 通用 Header 高度 |
| `SEGMENT_FLIGHT_HEIGHT` | 20px | 航班 Puck 高度 |
| `SEGMENT_BAR_HEIGHT` | 10px | 进退场条形高度（航班高度一半） |
| `LEFT_PANEL_WIDTH` | 260px | 左侧面板宽度 |

## Segment Mode 颜色常量

### 进退场条形颜色

| 常量 | 值 | 用途 |
|------|-----|------|
| `SEGMENT_BRIEF_COLOR` | `#f59e0b` | Brief 条（琥珀色） |
| `SEGMENT_DEBRIEF_COLOR` | `#94a3b8` | Debrief 条（灰蓝色） |
| `SEGMENT_PICKUP_DROP_COLOR` | `#475569` | Pickup/Dropoff 条（灰色） |

### Layover/Rest 条形颜色

| 常量 | 值 | 用途 |
|------|-----|------|
| `SEGMENT_LAYOVER_BG` | `rgba(34, 197, 94, 0.35)` | Layover 条背景 |
| `SEGMENT_LAYOVER_BORDER` | `rgba(34, 197, 94, 0.70)` | Layover 条边框 |
| `SEGMENT_LAYOVER_LABEL_COLOR` | `#15803d` | Layover 文字（深绿） |
| `SEGMENT_REST_BG` | `rgba(100, 116, 139, 0.30)` | Rest 条背景 |
| `SEGMENT_REST_BORDER` | `rgba(100, 116, 139, 0.60)` | Rest 条边框 |
| `SEGMENT_REST_LABEL_COLOR` | `#475569` | Rest 文字（深灰蓝） |

### 航班 Puck 颜色

| 常量 | 值 | 用途 |
|------|-----|------|
| `FLIGHT_COLOR_DH_TOP` | `#2d1b69` | Deadhead 渐变顶部 |
| `FLIGHT_COLOR_DH_BOTTOM` | `#4c1d95` | Deadhead 渐变底部 |
| `FLIGHT_PUCK_AIRPORT_COLOR` | `#93c5fd` | 机场代码文字颜色 |
| `FLIGHT_PUCK_TIME_COLOR` | `#7dd3fc` | 时间文字颜色 |

## Pairing vs Roster 颜色差异

| 元素 | Pairing Pane | Roster Pane |
|------|-------------|-------------|
| Flight (FLT) | `#14532d → #15803d`（绿色） | `#1e40af → #2563eb`（蓝色） |
| Flight (DH) | `#2d1b69 → #4c1d95`（紫色） | 相同 |

## 使用示例

```typescript
import {
  SEGMENT_FLIGHT_HEIGHT,
  SEGMENT_BAR_HEIGHT,
  SEGMENT_LAYOVER_BG,
  SEGMENT_LAYOVER_LABEL_COLOR,
} from '../gantt-constants'

// 条形位置计算
const barY = centerY + SEGMENT_FLIGHT_HEIGHT / 2 - SEGMENT_BAR_HEIGHT

// 文字居中
ctx.fillText('LAYOVER', loX + loWidth / 2, barY + SEGMENT_BAR_HEIGHT / 2)
```

## 相关文档

- [pairing-pane.md](pairing-pane.md) — Pairing Pane 渲染规范
- [roster-pane.md](roster-pane.md) — Roster Pane 渲染规范