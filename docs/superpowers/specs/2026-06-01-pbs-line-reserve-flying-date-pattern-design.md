# PBS Line Reserve / Flying Date Pattern 条件设计

日期：2026-06-01  
状态：待用户确认  
范围：在 PBS Line 模块新增一个可配置复杂条件，用于表达“某些日期要某类 Reserve，某些日期要 Flying”的整月 line 结构偏好。本文件只定义需求和方案，不包含实现改动。

## 背景

用户场景：

```text
½ the month AM reserve – ½ the month flying
```

进一步确认后，用户希望这个能力不要只支持固定的 `First Half / Second Half`，而是可以像 Reserve 页面 `Short Call Type` 一样选择 call type、Tx 和日期范围，并支持更自由的日期集合：

```text
1,3,5,7,9 要 AM reserve
2,4,6,8,10,12 要 PM reserve
11 要 flying
```

这个需求不适合只放在 Reserve 页面，因为 Reserve 页面只能表达 reserve bid，无法自然表达 flying。也不适合只放在 Pairing 页面，因为 Pairing 页面只能表达 flying/pairing 偏好，无法自然表达 reserve call type。它描述的是最终整个月 awarded line 中每天工作类型的分布，因此应归属到 `Line`，作为 line-level composition / pattern 条件。

## 目标

1. 新增一个 Line 复杂条件：`Reserve / Flying Date Pattern`。
2. 支持用户配置多个 date segment，每个 segment 指定 `Reserve` 或 `Flying`。
3. Reserve segment 支持选择 reserve call type，例如 `PRAM`、`PRPM`、`CRAM`、`CRPM` 等。
4. Flying segment 第一版只表达 `Any Flying`，不在 Line 内细分 AM flying / PM flying / specific pairing。
5. 每个 segment 支持日期范围：
   - Whole Month
   - First Half
   - Second Half
   - Date Range
   - Specific Dates
6. 条件支持 Tx/Tier 分层、编辑、删除、configured favorite，并与 Line 现有复杂条件行为对齐。

## 非目标

- 不在第一版实现 AM Flying / PM Flying。Flying 只表示 `Any Flying`。
- 不把 Pairing 条件完整搬到 Line 里，例如 pairing number、check-in time、red-eye、credit 等仍在 Pairing 页面配置。
- 不把该条件放到 Reserve 页面或 Pairing 页面作为独立功能。
- 不做复杂规则编辑器，不允许无限 segment 和任意布尔组合。
- 不在第一阶段承诺 optimizer 已经完整执行该偏好；第一阶段先完成 PBS bid 表达、保存、校验、展示和收藏语义。

## 条件定义

建议新增 Line property：

```text
Reserve / Flying Date Pattern
```

归属：

```text
bid_type = Line
source_type = app
is_visible_in_portal = 1
```

条件复杂度：

```text
complex / configurable Line condition
```

它不是 `Enabled` 型简单条件。用户添加该条件时必须打开配置弹窗，配置至少一个 segment 和 Tx 后才能保存。前端行为应对齐 Line 现有复杂条件，例如 `Commuter Pattern`、`Most Flying In Least Days`，而不是对齐 `Max Credit Window` 这类直接点击添加的 flag。

## Bid Value 设计

建议新增 bid value 类型：

```json
{
  "type": "reserve-flying-date-pattern",
  "segments": [
    {
      "workType": "reserve",
      "callType": "PRAM",
      "dateScope": { "mode": "specific_dates", "dates": ["2026-05-01", "2026-05-03", "2026-05-05"] }
    },
    {
      "workType": "reserve",
      "callType": "PRPM",
      "dateScope": { "mode": "specific_dates", "dates": ["2026-05-02", "2026-05-04", "2026-05-06"] }
    },
    {
      "workType": "flying",
      "dateScope": { "mode": "specific_dates", "dates": ["2026-05-11"] }
    }
  ],
  "strength": "strong"
}
```

字段含义：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `type` | string | 固定为 `reserve-flying-date-pattern`。 |
| `segments` | array | 用户配置的日期段，第一版建议最多 4 个。 |
| `workType` | enum | `reserve` 或 `flying`。 |
| `callType` | string | 仅 reserve segment 需要；取值来自 reserve call type 配置。 |
| `dateScope` | object | 日期范围，复用 Reserve 页面 date scope 语义。 |
| `strength` | enum | `normal`、`strong`、`must_try`，表示偏好强度。 |

日期范围类型建议复用已有 Reserve date scope：

```ts
type LinePatternDateScope =
  | { mode: "whole_month" }
  | { mode: "first_half" }
  | { mode: "second_half" }
  | { mode: "date_range"; from: string; to: string }
  | { mode: "specific_dates"; dates: string[] };
```

默认值建议：

```json
{
  "type": "reserve-flying-date-pattern",
  "segments": [
    {
      "workType": "reserve",
      "callType": "PRAM",
      "dateScope": { "mode": "first_half" }
    },
    {
      "workType": "flying",
      "dateScope": { "mode": "second_half" }
    }
  ],
  "strength": "strong"
}
```

## 用户配置体验

Line 页面中，用户点击 `Reserve / Flying Date Pattern` 的 `+` 后打开配置弹窗。

弹窗结构：

1. `Segments`
   - 每个 segment 一行或一个紧凑区块。
   - 字段包括 `Work Type`、`Call Type`、`Date Scope`。
   - `Work Type = Reserve` 时显示 `Call Type`。
   - `Work Type = Flying` 时隐藏 `Call Type`，展示为 `Any Flying`。

2. `Date Scope`
   - 下拉选择：
     - Whole Month
     - First Half
     - Second Half
     - Date Range
     - Specific Dates
   - `Date Range` 显示 from/to 日期。
   - `Specific Dates` 支持逐个添加日期，例如 1、3、5、7、9。

3. `Apply to Tx`
   - 使用现有 Line Tx/Tier toggle。
   - 至少选择一个 Tx。

4. `Preference Strength`
   - 三档：Normal / Strong / Must Try。
   - 不暴露具体 optimizer 权重。

5. 操作按钮
   - `ADD SEGMENT`
   - `REMOVE SEGMENT`
   - `SAVE FAVORITE`
   - `ADD BID` / `SAVE BID`

第一版约束：

- 至少 1 个 segment。
- 最多 4 个 segment。
- 每个 segment 必须有有效 date scope。
- Reserve segment 必须有有效 call type。
- Flying segment 不允许配置 call type。
- 同一个条件内不建议允许同一日期在多个 segment 中重叠；如果重叠，应在前端和后端校验时报错，避免用户同时说同一天要 PRAM 又要 flying。

## 示例

### 示例 1：半个月 AM reserve，半个月 flying

```text
Segment 1: Reserve / PRAM / First Half
Segment 2: Flying / Second Half
Tx: T1
Strength: Strong
```

用户理解：

```text
我希望 T1 的最终 line 前半个月尽量是 PRAM reserve，后半个月尽量安排 flying。
```

### 示例 2：奇数日 AM reserve，偶数日 PM reserve，某一天 flying

```text
Segment 1: Reserve / PRAM / Specific Dates: 1,3,5,7,9
Segment 2: Reserve / PRPM / Specific Dates: 2,4,6,8,10,12
Segment 3: Flying / Specific Dates: 11
Tx: T1, T2
Strength: Strong
```

用户理解：

```text
我希望这些日期分别按 AM reserve、PM reserve 和 flying 分布。
```

## 系统语义

第一阶段保存语义：

- 该条件作为 Line bid property 保存。
- 支持 Tx/Tier 分层。
- 支持 configured favorite，收藏已配置好的 segments + strength 快照。
- Existing row summary 应展示可读摘要，例如：

```text
PRAM on 1,3,5,7,9; PRPM on 2,4,6,8,10,12; Flying on 11; strong
```

后续 optimizer / award 可解释为：

1. 对 reserve segment，优先让对应日期 awarded 为指定 reserve call type。
2. 对 flying segment，优先让对应日期 awarded 为任意 flying duty/pairing。
3. `strength` 控制该偏好的排序权重或约束力度。
4. 如果日期范围和其他 bid 冲突，仍按 Tx/Tier 优先级和系统既有冲突策略处理。

## 与现有模块的关系

### Reserve 页面

Reserve 页面已经支持 `Short Call Type` + date scope，用于表达 reserve bid。新 Line 条件可以复用它的日期选择思路和 call type options，但不应直接写入 Reserve draft。

原因：

- Reserve draft 只表达 reserve。
- 新条件还包含 flying。
- 新条件是整条 line 的组成偏好。

### Pairing 页面

Pairing 页面继续负责更细的 flying 偏好：

- specific-date pairing
- pairing number
- check-in time
- red-eye
- credit
- pairing length

Line 新条件中的 Flying 第一版只表示 `Any Flying`。如果用户想要“11 号飞 AM pairing”，应在 Pairing 页面继续配置 report/check-in time 或 specific pairing，而不是把 Pairing 搜索能力搬进 Line 弹窗。

### Line 页面

Line 页面负责整月 line 级条件。新条件与以下现有能力同类：

- `Commuter Pattern`
- `Most Flying In Least Days`
- `Work Block Size`

它们都不是单个 pairing 过滤，而是最终 line 结构偏好。

## 方案对比

### 方案 A：新增 Line 条件，segment 支持 Reserve / Any Flying（推荐）

优点：

- 语义最准确，归属 Line。
- 能覆盖用户提出的奇数日、偶数日、自定义日期需求。
- 不把 Pairing 页面复杂能力搬进 Line。
- 可以复用 Reserve date scope 设计，用户理解成本低。

缺点：

- 第一阶段只是 bid 表达，不等于 optimizer 已完整执行。
- 需要新增 contract、前端 dialog、后端 validation 和 summary。

### 方案 B：只让用户组合 Reserve + Pairing 两边现有条件

优点：

- 不新增条件。
- 复用现有页面。

缺点：

- 用户要跨多个页面配置，理解成本高。
- 无法形成一个完整的 line pattern 条件。
- “半个月 reserve + 半个月 flying”语义分散，后续 optimizer 也难识别。

### 方案 C：在 Line 内做完整 Flying 细分

例如支持：

- AM Flying
- PM Flying
- Specific Pairing
- Pairing credit / red-eye / check-in time

优点：

- 功能最强。

缺点：

- 会把 Pairing 页面复制到 Line 里。
- 产品边界变乱，配置复杂度过高。
- 第一版很容易做得过宽。

结论：推荐方案 A。

## 数据和接口设计

### Contract

在 Line bid value 类型中新增：

```ts
type PbsLineReserveFlyingDatePatternBid = {
  type: "reserve-flying-date-pattern";
  segments: Array<
    | {
        workType: "reserve";
        callType: string;
        dateScope: PbsLinePatternDateScope;
      }
    | {
        workType: "flying";
        dateScope: PbsLinePatternDateScope;
      }
  >;
  strength: "normal" | "strong" | "must_try";
};
```

新增 property code 建议接在 Line legacy app 条件后，避免与已有 `401-409`、`411-426` 冲突。具体 code 以当前数据库可用区间为准。

### 后端校验

`validateLineDraftProperties` 需要新增校验：

- property code 对应 bid type 必须是 `reserve-flying-date-pattern`。
- `segments.length` 在 `1-4`。
- `strength` 必须是允许值。
- Reserve segment 的 `callType` 必须在 reserve call type options 中。
- Flying segment 不允许带 `callType`。
- `date_range` 必须 from/to 都是 ISO date，且 to >= from。
- `specific_dates` 必须是非空、ISO date、去重后无重复。
- 同一个 bid 内展开后的日期不能重叠。

### 前端映射

需要让 Line draft mapper 识别新 bid type：

- current draft -> page data
- page data -> save request
- add property
- patch property
- favorite property
- configured favorite restore

### Summary

Line existing property summary 增加格式化：

```text
PRAM on First Half; Flying on Second Half; strong
```

或：

```text
PRAM on 2026-05-01, 2026-05-03; Flying on 2026-05-11; strong
```

## 前端组件设计

新增组件建议：

```text
pbs-portal/src/features/line/components/line-reserve-flying-pattern-control.tsx
```

职责：

- 只负责编辑 `reserve-flying-date-pattern` bid。
- 不负责弹窗外壳、Tx toggle、保存按钮。
- 输入为 bid + disabled + onChange。

现有 `LineBidDialog` 负责：

- 判断 bid type。
- 如果是 `credit-density-preference`，使用现有 `CreditDensityPreferenceControl`。
- 如果是 `reserve-flying-date-pattern`，使用新 control。
- 其他类型继续走 `PairingBidControl`。

这样可以避免 `LineBidDialog` 继续变大，也方便后续单测。

## 收藏和添加行为

该条件必须对齐 Line 复杂条件行为：

- 从 All tab 添加时，点击 `+` 打开配置弹窗。
- 未完成配置不能保存。
- 保存后出现在 existing properties。
- Existing row 支持编辑。
- 编辑时回显完整 segments、Tx 和 strength。
- 支持 configured favorite，收藏的是配置快照，不是空模板。
- 从 favorited tab 添加时，使用已收藏配置，并允许用户确认或调整 Tx。
- 重复添加完全相同 bid + Tx 时沿用现有 Line tier merge / duplicate 规则。

## 测试建议

### pbs-server

- `line-validation.test.ts`
  - 接受有效 reserve + flying segments。
  - 拒绝空 segments。
  - 拒绝超过 4 个 segments。
  - 拒绝 reserve segment 缺少或使用非法 call type。
  - 拒绝 flying segment 带 call type。
  - 拒绝非法日期范围。
  - 拒绝重复或重叠日期。

- `rule-bid-value.test.ts`
  - bid value clone / serialize / parse roundtrip。
  - summary format 正确。

### pbs-portal

- `line-page.test.tsx`
  - 添加该条件时打开配置弹窗。
  - 能添加 PRAM first half + flying second half。
  - 能添加 specific dates，例如 1,3,5 和 11。
  - invalid segment 禁用保存或显示错误。
  - Existing row 编辑能回显。
  - configured favorite 保存和恢复配置快照。

- `line-reserve-flying-pattern-control.test.tsx`
  - work type 切换控制 call type 显示。
  - date scope 切换控制日期输入。
  - add/remove segment 行为正确。

## 验收标准

1. Line 可用条件中出现 `Reserve / Flying Date Pattern`。
2. 该条件点击添加时打开复杂配置弹窗，不是直接 Enabled。
3. 用户可以配置 `Reserve / PRAM / First Half` + `Flying / Second Half`。
4. 用户可以配置 specific dates，例如 PRAM on 1,3,5,7,9，PRPM on 2,4,6,8,10,12，Flying on 11。
5. 保存后 Existing row 显示可读 summary。
6. Existing row 可以编辑并回显原配置。
7. configured favorite 保存的是完整配置快照。
8. 后端拒绝无效 date scope、非法 call type、重复日期和空 segments。
9. 不影响 Reserve、Pairing、Days Off 现有条件。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 该任务涉及 contract、后端 validation、前端 Line 弹窗/组件、测试四块，边界清晰，可以并行探索或实现。
- Suggested split:
  - Agent A：contracts + pbs-server validation / rule-bid-value 测试。
  - Agent B：pbs-portal Line control / dialog / page wiring。
  - Agent C：测试补齐与回归检查，或先做只读 review。
- Write boundaries:
  - Agent A 只写 `packages/contracts/`、`pbs-server/src/services/line/`、`pbs-server/src/services/lineholder/`。
  - Agent B 只写 `pbs-portal/src/features/line/` 和必要 shared type 引用。
  - Agent C 原则上只写测试文件，或只读 review。
- Conflict risk: Medium。`packages/contracts/pbs-line-bids.*` 和 shared bid value 类型会被前后端共同依赖，需要主 agent 先确定 contract，再分配实现。
- Execution gate: 必须等用户确认本 spec 后再实施；实施前先声明 agent 角色和写入边界。

## 开放问题

1. property code 需要以数据库当前可用区间为准最终确定。
2. `Whole Month` 是否允许与其他 segment 共存。建议第一版允许选择，但同一个 bid 内日期展开后不得重叠，因此 Whole Month 通常只能单独存在。
3. `strength` 是否第一版就接入 optimizer。建议第一版只保存和展示，optimizer 后续接入。

