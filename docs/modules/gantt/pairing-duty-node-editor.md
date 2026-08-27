# Pairing Duty Node Editor

进退场时间编辑器，允许排班员调整每个 Duty 的 Pickup/Brief/Debrief/Dropoff 时间，并支持 Double 双签到签出模式。

**视觉设计参考：** `pairing-duty-node-editor.html`

---

## 入口

点击 Pairing 条形，从右键菜单选择 "Edit Duty Nodes"，弹出 `DutyNodeDialog`。

---

## 架构

```
DutyNodeDialog
  └─ per duty:
       ├─ DutyNodeGanttBar   ← 纯渲染，调用 buildGanttBlocks()
       └─ DutyNodeEditBlock  ← 时间字段编辑（x2 in double mode）
```

### `buildGanttBlocks()` — 纯工具函数

位置：`gantt/src/utils/duty-node-utils.ts`

**输入：** `DutyEditState`、`PairingSegment[]`、`restAfterSegSeq: number | null`

**输出：** `GanttBlocksResult`
- `blocks: GanttBlock[]` — 每个时间段（pickup/brief/flight/transit/rest/hotel/debrief/dropoff）
- `axisLabels: GanttAxisLabel[]` — 时间轴标签（edit=蓝/lock=灰/hotel=紫），相邻 < 4% 去重
- `blockLabels: GanttBlockLabel[]` — 双模式下的 "Block 1"/"Block 2" 标注
- `restGapPct: number | null` — ⊕ 按钮的水平中心位置（%）

### `DutyNodeGanttBar` — 渲染组件

位置：`gantt/src/components/pairing/duty-node-gantt-bar.tsx`

三层 DOM 结构：

```
[Block 1 / Block 2 标签，absolute top:-18px]    ← 双模式才有
[主条形 flexbox，height:30px]                    ← 各 block 按 widthPct flex
[时间轴，height:20px, marginTop:3px]             ← axis labels
```

⊕ Add Double 按钮悬浮在 REST gap 中央上方（`top:-22px; left:{restGapPct}%`），仅单模式且有 REST gap 时显示。

---

## 颜色规范

| 类型 | 背景 |
|------|------|
| pickup / dropoff | `linear-gradient(135deg,#92400e,#b45309)` 深琥珀 |
| brief | `linear-gradient(135deg,#1e3a8a,#2563eb)` 蓝 |
| debrief | `linear-gradient(135deg,#164e63,#0891b2)` 青 |
| flight | `linear-gradient(135deg,#1f2937,#374151)` 深灰 |
| transit | `repeating-linear-gradient(45deg,...)` 斜线 |
| rest（单模式） | `repeating-linear-gradient(45deg,...)` 紫色斜线 + 虚线边框 |
| hotel（双模式） | `rgba(110,64,201,0.18)` + 紫色虚线边框 |

---

## Single Mode vs Double Mode

### 单模式（`state.double === null`）

Gantt 条序列：pickup → brief → 航班段（含 transit）→ **REST gap（可见斜线）** → 剩余航班 → debrief → dropoff

REST gap = 相邻两段间隔 ≥ 120 min 的最大间隙（`detectRestGap()`）。

⊕ 按钮显示在 REST gap 中央，点击后激活双模式。

### 双模式（`state.double !== null`）

Gantt 条序列：B1 pickup → B1 brief → B1 航班 → B1 debrief¹ → B1 dropoff¹ → **Hotel（紫色）** → B2 pickup → B2 brief → B2 航班 → B2 debrief² → B2 dropoff²

REST separator 行显示在两个编辑块之间，附带 "Remove" 按钮。

---

## 编辑字段与联动规则

| 字段 | 类型 | 联动 |
|------|------|------|
| Brief Start | 主键 | 修改时 Pickup Start 按原时长自动偏移（⟳） |
| Brief End | 锁定 | = 第一个航班 actStrDtUtc |
| Pickup Start | 独立 | 仅修改自身（✎） |
| Debrief Start | 锁定 | = 最后一个航班 actEndDtUtc |
| Debrief End | 主键 | 修改时 Dropoff End 按原时长自动偏移（⟳） |
| Dropoff End | 独立 | 仅修改自身（✎） |

双模式 Block 2 字段遵循相同规则，基于 `state.double.*`。

---

## 数据持久化

保存调用 `pairingDutyNodeApi.updateDutyNodes(pairingId, duties)`，Payload 格式：

```typescript
{
  dutySeq:        number
  pickupStartUtc: string   // ISO 8601
  briefStartUtc:  string
  debriefEndUtc:  string
  dropoffEndUtc:  string
  double: {
    restAfterSegSeq: number
    pickupStartUtc:  string
    briefStartUtc:   string
    debriefEndUtc:   string
    dropoffEndUtc:   string
  } | null
}
```

---

## 相关文件

| 文件 | 职责 |
|------|------|
| `components/pairing/duty-node-dialog.tsx` | 主弹窗，数据加载与状态管理 |
| `components/pairing/duty-node-gantt-bar.tsx` | Gantt 条渲染 |
| `components/pairing/duty-node-edit-block.tsx` | 单个 Block 的字段编辑表单 |
| `utils/duty-node-utils.ts` | 纯工具函数：`buildGanttBlocks`、`detectRestGap`、`applyBriefStartChange` 等 |
| `services/pairing-duty-node-api.ts` | API 调用 |
| `types/pairing.ts` | `PairingSegment` 类型定义 |
