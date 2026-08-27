# PBS Pairing 125「Credit Per Time Away From Base」设计确认

## 背景

用户继续核对 Pairing 条件 `Credit Per Time Away From Base(propertyCode=125)`，当前页面显示为：

- `MODE`: `Award / Avoid`
- `BID`: operator 下拉 + 一个带 `%` 后缀的输入框

初步检查后发现：当前页面只表现成百分比输入，但旧库定义不是单纯 percent，而是 `percent_or_time`。同时后端当前没有 `125` 专属 SQL，搜索预览无法真正按这个条件筛 pairing。

本设计只针对 `propertyCode=125`，不修改 `138 Maximum TAFB-Credit Ratio`，避免两个语义相近但方向不同的条件互相污染。

## 旧库对照

旧库文件：

- `init-docs/crew_bids_reference-2026-03-16-072929.xlsx`
- `init-docs/crew_bids_reference-2026-03-16-072929.md`

旧库 `bid_properties` 中 `125`：

- 名称：`Credit Per Time Away From Base`
- bid 类型：`percent_or_time`
- 格式：`NN or HHH:MM`
- label：`Credit Rate`
- action：`award` / `avoid`
- quantifier：无
- operator：`>` / `<`
- tooltip 示例：
  - `Award Pairings If Credit Per Time Away From Base > 65%`
  - `Avoid Pairings If Credit Per Time Away From Base < 60%`
- notes：`A = percentage e.g. 70, or time value e.g. 007:00`

旧库 `crew_bids` 中有真实样例：

- `>` `007:00`
- `>` `75%`
- `>` `85%`
- `<` `70%`

`sql/seed/10-pbs-bid-property.sql` 中 legacy seed 也对齐旧库：

- `property_code = 125`
- `operator_options = ["<",">"]`
- `validation_json = {"type":"percent_or_time","label":"Credit / TAFB"}`
- tooltip：`Award/Avoid pairings by credit per TAFB.`

## 当前实现问题

### 前端 contract

当前 `packages/contracts/pbs-pairing-bids.js` 中 `125` 是：

```ts
{
  propertyCode: 125,
  name: "Credit Per Time Away From Base",
  defaultBid: { type: "percent", value: "25.78" },
  supportedActions: ["award", "avoid"],
  supportedOperators: [">", "<"],
}
```

问题：

- `defaultBid` 只支持 `percent`，无法表达旧库里的 `007:00`。
- 页面因此只出现 `%` 输入框。
- 旧库要求 `percent_or_time`，即同一条件可以用百分比或时间值表达。

### 后端 SQL

当前后端没有 `propertyCode=125` 的专属 SQL。

现有 `138 Maximum TAFB-Credit Ratio` 有类似代码，但它不是 125：

- 138 是 AA-style 隐藏属性。
- 138 名称是 `Maximum TAFB-Credit Ratio`。
- 当前公式方向接近 `TAFB / Credit * 100`。
- 125 旧库 seed 明确写的是 `Credit / TAFB`。

因此 125 不能复用 138 的语义，必须补独立实现。

## 语义定义

`Credit Per Time Away From Base` 表达：

> pairing 的 total credit 相对于 time away from base 的比例或等效每日 credit。

数据来源：

- `pairing_segment.act_credited_minutes_seg`
- `pairing_segment.duty_act_credited_minutes`
- `pairing.tafb`

推荐基础公式：

```text
total_credit_minutes = sum(coalesce(act_credited_minutes_seg, duty_act_credited_minutes, 0))
tafb_minutes = p.tafb
```

当输入是百分比时：

```text
credit_per_tafb_percent = total_credit_minutes / tafb_minutes * 100
```

当输入是时间值 `HHH:MM` 时：

```text
credit_per_tafb_minutes_per_24h = total_credit_minutes / tafb_minutes * 1440
```

也就是将 `Credit / TAFB` 换算成“每 24 小时 away from base 对应多少 credit”。旧库样例 `007:00` 可以按 420 分钟比较。

除零处理：

- 使用 `nullif(p.tafb::numeric, 0)` 防止除零。
- 如果 `tafb` 为 null 或 0，条件自然不匹配。

## 方案比较

### 方案 A：只保留百分比输入

做法：

- 继续使用 `{ type: "percent" }`。
- 后端补 `Credit / TAFB * 100` SQL。

优点：

- 改动最小。
- 页面和当前截图接近。

缺点：

- 不符合旧库 `percent_or_time`。
- 无法迁移或重建 `007:00` 这种真实旧库 bid。
- 后续用户看到旧库样例会再次产生歧义。

结论：不推荐。

### 方案 B：新增 `percent-or-duration` bid 类型

做法：

- contract 新增 bid 类型，例如：

```ts
{ type: "percent-or-duration", unit: "percent" | "duration", value: string, operator: ">" | "<" }
```

- 前端渲染 unit selector + value input。
- 后端根据 unit 分别套用百分比公式或时间公式。

优点：

- 最贴近旧库 `percent_or_time`。
- 数据结构没有歧义。
- 页面可以明确让用户选择 `%` 或 `HHH:MM`。

缺点：

- 需要扩展 contract、clone、summary、control、route schema、SQL builder、测试。

结论：推荐。

### 方案 C：用两个现有 bid 类型表达

做法：

- 百分比用 `{ type: "percent" }`。
- 时间用 `{ type: "duration" }`。
- 125 根据 bid.type 判断公式。

优点：

- 少新增一种 bid type。
- 复用已有 PercentInput / DurationInput。

缺点：

- 同一个 property 的 bid 类型可变，前端 unit 切换时需要在 `percent` 和 `duration` 之间转换。
- summary / conflict signature / payload 仍能工作，但语义散在多个已有类型里。
- route schema 需要允许 125 同时接受 `percent` 和 `duration`，维护时不如独立类型直观。

结论：可行但不如方案 B 清晰。

## 推荐方案

采用方案 B：新增 `percent-or-duration` bid 类型，专门用于 `Credit Per Time Away From Base` 这类旧库 `percent_or_time` 条件。

## 前端设计

### Contract

新增 bid value：

```ts
{
  type: "percent-or-duration",
  unit: "percent" | "duration",
  value: string,
  operator?: ">" | "<"
}
```

`propertyCode=125` 默认值：

```ts
{
  type: "percent-or-duration",
  unit: "percent",
  value: "75",
  operator: ">"
}
```

说明：

- 默认值从当前 `25.78` 调整为旧库样例更常见的 `75`，减少业务误导。
- 存储百分比时不带 `%`，展示时由 UI 添加后缀。
- 时间值使用 `HHH:MM` / `H:MM` 均可接受，但保存前规范化不强制补零；后端按现有 duration parser 支持 `\d{1,3}:\d{2}`。

### 控件表现

弹窗 `BID` 区域显示：

- operator 下拉：只显示 `>` / `<`
- unit 选择：`%` / `HH:MM`
- value 输入：
  - unit = `%`：数字输入或文本输入，后缀 `%`
  - unit = `HH:MM`：duration 输入，允许 `007:00`、`7:00`、`30:00`

不显示：

- `=`
- `Between`
- `Any / Every`

### Summary

展示示例：

- `> 75%`
- `< 70%`
- `> 007:00`

## 后端设计

### Route 校验

`propertyCode=125` 只允许：

- `bid.type = "percent-or-duration"`
- `bid.operator = ">" | "<"`
- `bid.unit = "percent" | "duration"`

percent 校验：

- value 必须能解析为有限数字。
- 可接受 `"75"`，如果前端误传 `"75%"`，后端可去掉 `%` 后解析，增强健壮性。

duration 校验：

- value 必须满足 `H:MM` / `HHH:MM`，分钟 `< 60`。

错误文案建议：

- 非 `percent-or-duration`：`Credit Per Time Away From Base requires percent or duration bid.`
- 非 `<` / `>`：`Credit Per Time Away From Base supports < or > only.`
- 非法百分比：`Credit Per Time Away From Base percent value is invalid.`
- 非法时间：沿用 duration parser 的 `Unsupported duration value: <value>` 或 route 层返回明确文案。

### Pairing Search SQL

新增 `buildPreviewCondition` / core condition 对 `propertyCode=125` 的处理。

分子：

```sql
(
  select sum(coalesce(s.act_credited_minutes_seg::numeric, s.duty_act_credited_minutes::numeric, 0))
  from <liveSchema>.pairing_segment s
  where s.pairing_id = p.id
    and s.is_deleted = 0
)
```

百分比表达式：

```sql
(
  <credit_minutes_expression>
  / nullif(p.tafb::numeric, 0)
  * 100
)
```

时间表达式：

```sql
(
  <credit_minutes_expression>
  / nullif(p.tafb::numeric, 0)
  * 1440
)
```

比较：

- unit = `percent`：将 value 解析为 number，与百分比表达式比较。
- unit = `duration`：将 value 转为 minutes，与时间表达式比较。

`avoid`：

- 继续沿用现有 `wrapIntent`，即 `not (...)`。

## 不做内容

- 不修改 `138 Maximum TAFB-Credit Ratio`。
- 不把 125 合并到 138。
- 不新增数据库字段。
- 不支持 `=`。
- 不支持 `Between`。
- 不支持 `Any / Every`。
- 不迁移历史 bid 数据；当前项目仍在开发期，本次只对齐新结构和新保存。

## 测试计划

### 后端 route 测试

新增/覆盖：

- 接受 125 `percent-or-duration` + `unit="percent"` + `operator=">"`。
- 接受 125 `percent-or-duration` + `unit="duration"` + `operator="<"`。
- 拒绝 125 `percent` 旧 payload。
- 拒绝 125 `duration` 旧 payload。
- 拒绝 125 `operator="="`。
- 拒绝 125 `operator="Between"` / range。
- 拒绝非法 percent value。
- 拒绝非法 duration value。

### 后端 SQL builder 测试

新增/覆盖：

- 125 percent 生成 `credit / nullif(p.tafb::numeric, 0) * 100`。
- 125 duration 生成 `credit / nullif(p.tafb::numeric, 0) * 1440`。
- percent value 参数化为 number。
- duration value 参数化为 minutes。
- `avoid` 正确包裹 `not (...)`。

### 前端测试

新增/覆盖：

- catalog：125 default bid 是 `percent-or-duration`，支持 `<` / `>`。
- bid control logic：operator 切换不产生 `=` / `Between`。
- bid control：unit 在 `%` 与 `HH:MM` 间切换时保留/转换合理默认值。
- summary：展示 `> 75%`、`> 007:00`。
- 页面回归：配置弹窗能保存 percent 和 duration 两种 125 bid。

### 构建 / 回归命令

```bash
npm --prefix pbs-server test -- pairing-search-condition-builder pairing-bids
npm --prefix pbs-server run build
npm --prefix pbs-portal test -- pairing-property-catalog pairing-bid-control pairing-bid-control-logic pairing-page
npm --prefix pbs-portal run build
npm --prefix pbs-portal run lint
git diff --check
```

## 验收标准

- 用户配置 `Credit Per Time Away From Base` 时，可以选择 `%` 或 `HH:MM`。
- `%` 输入保存后使用 `Credit / TAFB * 100` 比较。
- `HH:MM` 输入保存后使用 `Credit / TAFB * 1440` 比较。
- operator 只允许 `<` / `>`。
- Mode 必须选择 `Award` 或 `Avoid`。
- 后端拒绝旧的 `percent` / `duration` 直传结构，避免新旧结构歧义。
- 搜索预览和 current rules 汇总不会再因为 125 缺 SQL 而跳过或报 unsupported。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次改动横跨 contract、前端控件、后端校验、SQL builder 和测试，但核心都围绕一个 bid type 与一个 property。并行拆分会增加 contract 合并和测试口径冲突。
- Suggested split: 不建议拆分；由一个 agent 顺序完成更稳。
- Write boundaries: 单 agent 负责 `packages/contracts`、`pbs-portal/src/features/pairing`、`pbs-server/src/routes`、`pbs-server/src/services/pairing-search`、相关测试。
- Conflict risk: 中等，主要风险是共享 bid union 类型影响多个控件分支。
- Execution gate: 用户确认本 spec 后再实施。

