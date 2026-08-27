# PBS Carry-Out Pairing Property 设计

日期：2026-04-30
作者：Codex
状态：已确认，实施中

## 背景

上一版实现把 Days Off 左侧日历延伸到下个月，并用 `C/O Off` 表达不想飞跨月 pairing。实际 UI 验证后发现：

- 左侧日历和 Tier heatmap 被额外日期撑得很乱。
- `C/O Off` 容易被误解成下个月正式休息日。
- 用户真实意图更像是过滤 pairing pool，而不是添加一个具体 day off。

因此本轮改为撤回日历 carry-out 方案，改用 Pairing property 表达“不要飞跨月多少天”的规则。

## 目标

1. 撤回上一版 Days Off 日历 carry-out 延伸实现，让左侧 `BIDDING CALENDAR` 只展示当前 bid month。
2. 不再在日历上显示 `C/O Off`，不再让下月延伸日期参与 Days Off 保存。
3. 新增 Pairing property，用现有 property 体系表达跨月 pairing 过滤。
4. 保持现有代码风格：property catalog、数据库可见性、mapper、preview/search condition 统一走现有优雅路径，不在前端硬编码插入口。
5. 保持查询性能：用 pairing 主表日期字段计算跨月天数，避免额外 N+1、避免逐日 UI 占位。

## 不做范围

- 本次不实现 AA 文档那种“点下月某一天作为 placeholder”的 UI。
- 本次不改 `DO` 语义；`DO` 仍是未来 roster/award 实际排班结果。
- 本次不做完整 award engine 闭环，只先让 Search Pairings / pairing preview 条件能正确过滤。
- 本次不新增第三方依赖。

## 撤回范围

需要撤回上一版 carry-out 日历实现：

- `PbsCalendarDaysOffTier.carryOutDates`
- `PbsBiddingCalendarEventTone = "teal"`
- 前端 `buildCalendarCells` 额外延伸一周
- `ScheduleCalendarCell.kind = "carry-out-extension"`
- `ScheduleEventCalendar` 为多一行动态压缩高度的 carry-out 相关逻辑
- `DashboardSchedulePanel` 对 `carryOutDates` 的保存逻辑
- `bidding-calendar-service` 中 `C/O Off` 映射
- 后端 `CARRY_OUT_PLACEHOLDER` 校验、读写、request type 分流
- 新增 migration `2026-04-30-pbs-calendar-day-off-carry-out.sql`
- 上一版 carry-out spec / dev-context 如保留，需标记为废弃或从工作树删除，避免误导后续开发

数据库当前已被本地执行过一次 `request_type varchar(30)` 扩展。实施时需要用保护式 SQL 处理：

- 如果不存在 `CARRY_OUT_PLACEHOLDER` 数据，则把 `request_type` 改回 `varchar(20)`。
- 如果存在相关数据，则先提示并停止，不静默删除业务数据。

## 新 Property 设计

推荐新增 Pairing property：

```text
Property: Carry-Out Days
Action: avoid
Operator: >
Default value: 0
```

含义：

- `Avoid Carry-Out Days > 0`：只要 pairing 跨出当前 bid month 到下个月，就不要。
- `Avoid Carry-Out Days > 1`：允许跨出 1 天，超过 1 天才不要。
- `Avoid Carry-Out Days > N`：允许跨出 N 天。

这个表达比日历 placeholder 更清楚：

- 用户想控制的是 pairing，而不是 day off。
- UI 只出现一个规则，不污染左侧日历。
- 后续可以自然进入 `View Pairing Set` / pairing pool 过滤。

## Property Code

建议新增旧库可见 Pairing property code：

```text
163 Carry-Out Days
```

理由：

- 当前 pairing contract 已使用 `101-162`。
- `129` 在旧 seed 第一段曾表示 `Carry-In / Carry-Out`，但后续 legacy 映射已把 `129` 统一为 `Any/Every Sit Length`，不能复用，避免再次引入语义冲突。
- `163` 是新的扩展 property，命名和行为都明确。

## Contract 设计

在 `packages/contracts/pbs-pairing-bids.js/.d.ts` 增加：

```ts
{
  propertyCode: 163,
  name: "Carry-Out Days",
  defaultBid: { type: "stepper", value: 0, min: 0, max: 14, operator: ">" },
  supportedActions: ["avoid"],
  supportedOperators: [">", "=", "<", "Between"],
}
```

Usage 建议为 `single`：

- 同一 Tier 中一个 `Carry-Out Days` 规则足够表达阈值。
- 避免同层重复配置造成规则冲突。

## 数据库 / Seed / Migration

新增 migration：

- 插入或更新 `pbs_bid_property`：
  - `property_code = 163`
  - `bid_type = 'Pairing'`
  - `property_name = 'Carry-Out Days'`
  - `award_or_avoid = '["avoid"]'`
  - `operator_options = '["<","=",">","Between"]'`
  - `validation_json = '{"type":"int","label":"Days","min":0,"max":14}'`
  - `source_type = 'legacy'`
  - `is_visible_in_portal = 1`
  - `display_order = 163`
  - `is_active = 1`

同步更新 `sql/seed/10-pbs-bid-property.sql`，保持新环境初始化一致。

## 后端查询语义

在 pairing search condition 中新增 property code `163`。

跨月天数计算：

```sql
greatest(
  0,
  ((coalesce(p.sch_end_dt_utc, p.sch_str_dt_utc) at time zone 'UTC')::date
    - 当前 bid period 月末日期)
)
```

规则：

- 当前 bid period 由 preview/search 请求上下文的 `periodCode` 解析。
- pairing 未跨月时 carry-out days = `0`。
- pairing 跨到下个月时，按结束日期超过当前月最后一天的天数计算。
- 用现有 `buildCompareClause` 处理 `> / = / < / Between`。
- 因为 property 默认 action 是 `avoid`，外层现有 `wrapIntent` 会把正向条件包成 `not (...)`，达到排除效果。

示例：

- period = `Apr 2026`
- pairing `2026-04-30 -> 2026-05-03`
- carry-out days = `3`
- `Avoid Carry-Out Days > 0` 会排除它
- `Avoid Carry-Out Days > 3` 不会排除它

## 前端行为

Pairing 页面不用新增特殊 UI：

- property catalog 返回 `Carry-Out Days` 后，自动出现在 available properties。
- 控件复用现有 stepper/operator/action 体系。
- 默认 action 为 `avoid`，默认 operator `>`，默认 value `0`。
- 用户可以改成 `> 1`、`Between 2-4` 等。

需要确认前端现有控件是否完整支持 `stepper.operator` 和 `stepper-range`：

- 如果已支持，只补 mapper/test。
- 如果 UI 只显示 value、不显示 operator，则按现有控件风格补最小必要支持。

## 测试计划

后端：

- `Carry-Out Days > 0` 生成基于月末的 SQL 条件。
- `avoid` 默认 action 会排除跨月 pairing。
- `Between` / `=` 等 operator 走现有 compare helper。
- property catalog 包含 `163` 且可见。
- duplicate/single-use 校验覆盖 `163`。

前端：

- Pairing available properties 能显示 `Carry-Out Days`。
- 添加该 property 后 draft 保存结构符合现有格式。
- Search Pairings preview 能携带该 property。
- 撤回 carry-out 日历后，左侧日历不再显示下月 extension / `C/O Off`。

回归：

- `npm run verify:pbs`

## 验收标准

- 左侧日历恢复简洁，只显示当前 bid month。
- 不再出现 `C/O Off`。
- Pairing property 中有 `Carry-Out Days`，可以表达“不要跨月超过 N 天”。
- 不在前端硬编码 property；统一通过后端 property catalog 和数据库可见性控制。
- Pairing search / preview 能用该规则过滤跨月 pairing。
- 验证通过 `npm run verify:pbs`。
