# Roster Pane（主/副）

## 左侧固定列

- 双行布局（row 1 上行 + row 2 下行）
- 默认列：CrewId, Rank, Base (row 1) + CrewName, Fleet, YBH (row 2)
- 隐藏列可启用：MBH, YAL, MAL, YDO, MDO
- 点击列头排序（升序/降序），面板 + Canvas 行顺序同步
- 列宽拖拽调整，localStorage 持久化
- 齿轮按钮打开列配置弹窗（显隐 + 拖拽排序 + 重置）

## 主副屏特性

- 完全独立：各自筛选、排序、滚动
- 主 Pane：可在不同 Crew 间拖拽任务
- 主→副 Pane：拖拽任务自动从源 Crew 移除
- 副 Pane：不同排序/筛选视角

## 任务块渲染模式

### Segment Mode（pairingId > 0 时）

当 Roster Flight 有 `pairingId` 时，表示该航班来源于 Pairing + PairingSegment，
渲染逻辑与 Pairing Pane 完全一致：

#### 时间线结构

```
Duty 1: Pickup → Brief → [Flight Segments] → Debrief → Dropoff
                                                    ↓
                                              Layover (到 Duty 2)
                                                    ↓
Duty 2: Pickup → Brief → [Flight Segments] → Debrief → Dropoff
                                                    ↓
                                              Rest (签退后休息)
```

#### 尺寸常量

| 元素 | 高度 | 说明 |
|------|------|------|
| Flight Puck | 20px | 航班段主体（蓝色渐变） |
| 所有条形 | 10px | 与 Pairing Pane 一致 |
| Row 高度 | 43px | Roster 默认行高 |

#### 条形位置

所有条形与航班 Puck **底部对齐**，与 Pairing Pane 相同计算逻辑。

#### 时间衔接规则

与 Pairing Pane 完全一致：

| 元素 | 开始时间 | 结束时间 |
|------|---------|---------|
| Brief | `briefStartUtc` | `schStrDtUtc`（航班起飞） |
| Debrief | `schEndDtUtc`（航班落地） | `debriefEndUtc` |
| Layover | 前 Duty `dropoffEndUtc` | 后 Duty `pickupStartUtc` |
| Rest | 最后 Duty `dropoffEndUtc` | `dropoffEndUtc + dutyActRestMin` |

#### 数据来源

后端 `roster-service.getView` LEFT JOIN `pairing_segment` 获取 duty-level 字段：

```typescript
// RosterItem 新增字段（可选）
pickupStartUtc?: string | null
briefStartUtc?: string | null
debriefEndUtc?: string | null
dropoffEndUtc?: string | null
dutyActRestMin?: number | null
```

#### 颜色方案

| 元素 | 颜色 | 与 Pairing 对比 |
|------|------|----------------|
| Flight (FLT) | `#1e40af → #2563eb` | 蓝色（Pairing 为绿色） |
| Flight (DH) | `#2d1b69 → #4c1d95` | 与 Pairing 一致（紫色） |
| 其他条形 | 同 Pairing | 完全一致 |

#### 航段 Puck 文字布局

与 Pairing Pane 完全一致，从 `label` 字段解析航班信息：

| 宽度阈值 | 布局 | 内容 |
|---------|------|------|
| ≥60px | Full | 左: dep_arp + dep_time, 中: flt_num, 右: arv_arp + arv_time |
| 30-59px | Partial | flt_num 居中 |
| 16-29px | Minimal | flt_num 后 4 位 |

Label 格式：`"{fltNum} {depArp}-{arvArp}"`（如 `"F8001 HKG-TPE"`）

#### Layover/Rest 标签

- 文字居中于条形本身（X 轴横向居中，Y 轴纵向居中）
- 文字颜色：Layover `#15803d`（深绿），Rest `#475569`（深灰蓝）

### Individual Mode（pairingId = null 时）

地面任务或独立航班使用传统渲染：

- 渐变填充 + 圆角 + 1px 深色边框
- 文字颜色自动适配背景亮度
- 选中：虚线边框
- Hover：白色半透明叠加
- 违规：右上角铃铛图标
- 锁定：底部蓝/红下划线

## 冻结行

- 支持 Excel 式行置顶（详见 [frozen-rows.md](frozen-rows.md)）
- 点击行选择 → 右键 → Freeze Selected Rows
- 冻结行固定在顶部，pin 图标可解冻

## 交互

### 任务选择

- **点击任务** → 自动选择该 Crew 的整个 Pairing（同 `pairingId` 且同 `crewId` 的所有任务）
  - 注意：不同 Crew 可能被分配同一个 Pairing，选择时需区分 Crew
- Ctrl+Click → 多选独立任务
- 双击 → 打开详情

### 右键菜单：Edit / Swap / Locate Pairing / Delete / Freeze / Unfreeze

- 拖拽到另一个 Crew → move（draft 模式）
- Delete 键删除选中任务
- Hover 在 StatusBar 显示任务信息

### Delete 行为

| 任务类型 | 删除逻辑 | 说明 |
|---------|---------|------|
| 有 pairingId 的任务 | 批量删除同 pairingId + crewId 的所有航段 | 整个 Pairing 从该 Crew 移除，一次渲染更新 |
| 无 pairingId 的任务（地面任务） | 单独删除该任务 | 按 task.id 删除 |

**重要：** 删除 Roster 任务不会删除 Pairing 本身，因为同一 Pairing 可能被多个 Crew 执行。Pairing 删除需在 Pairing Pane 右键菜单操作。

## 跨 Pane 拖拽

| 来源 | 目标 | 操作 |
|------|------|------|
| Roster → Roster | 另一个 Crew | move-task |
| Pairing → Roster | Crew 行 | assign-pairing（拖拽整个 Pairing） |

## Pairing 分配后数据完整性

拖动 Pairing 到 Roster Pane 分配给 Crew 时，后端 `assignPairing` 返回的数据必须包含完整的 duty 级别字段，以正确渲染 Pickup/Brief/Debrief/Dropoff/Rest 节点：

**返回字段（来自 roster_flight + pairing_segment JOIN）：**

```typescript
// roster_flight 基础字段
id, crewId, pairingId, dutySeq, segSeq, schStrDtUtc, schEndDtUtc, ...

// pairing_segment duty 级别字段（合并返回）
pickupStartUtc, pickupEndUtc,
briefStartUtc, briefEndUtc,
debriefStartUtc, debriefEndUtc,
dropoffStartUtc, dropoffEndUtc,
dutySchRestMin, dutyActRestMin
```

**原因：** 前端 `patchItems` 展示返回数据，若缺少 duty 字段则只渲染 Flight puck，无法显示完整的时间线结构。
| Flight → Roster | Crew 行 | assign-flight (TODO) |
| Flight → Pairing | Pairing 行 | add-flight-to-pairing |

## 数据一致性（设计待定）

详见 [data-sync-design.md](data-sync-design.md)。

当前问题：
- Flight 时间变化 → pairing_segment、roster_flight 未同步
- Pairing Segment 变化 → roster_flight 未同步
- 需要多层级级联更新机制