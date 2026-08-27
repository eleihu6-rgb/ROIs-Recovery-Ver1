# PBS Pairing 119「Any/Every Layover Duration」设计确认

## 背景

用户在 `Configure Pairing Bid` 弹窗中检查到 `Any/Every Layover Duration`，当前页面显示为：

- `MODE`: `Award / Avoid`
- `QUANTIFIER`: `Any / Every`
- `BID`: 空白普通输入框

这与旧库定义不一致。`Any/Every Layover Duration` 是 duration 类条件，不是自由文本条件；同时旧库要求它有 operator：`<`、`>`。

本设计只覆盖 Pairing property `119`，不扩展到 `118 Any/Every Duty Duration`、`153 Minimum Layover Time`、`154 Maximum Layover Time` 或其他 layover 类 property。

## 旧库对照

旧库文件：`init-docs/crew_bids_reference-2026-03-16-072929.xlsx` / 同名 `.md`

旧库 property `119`：

- 名称：`Any/Every Layover Duration`
- bid 类型：`duration`
- action：`award` / `avoid`
- quantifier：`any` / `every`
- operator：`<` / `>`
- 不支持 `=`
- 不支持 `Between`

`sql/seed/10-pbs-bid-property.sql` 中 legacy seed 也对齐旧库：

- `property_code = 119`
- `validation_json = {"type":"duration","format":"HH:MM","label":"Layover Duration"}`
- `operator_options = ["<",">"]`
- `any_or_every = ["any","every"]`

因此当前页面中：

- 显示 `Award / Avoid` 是正确的。
- 显示 `Any / Every` 是正确的。
- `BID` 显示普通空白文本框是错误的。
- 缺少 operator 是错误的。
- 不应显示 `=`。
- 不应显示 `Between`。

## 当前实现问题

当前 `packages/contracts/pbs-pairing-bids.js` 中 119 的配置为：

```ts
{
  propertyCode: 119,
  name: "Any/Every Layover Duration",
  defaultBid: { type: "text", value: "15:00" },
  supportedActions: ["award", "avoid"],
  supportedOperators: ["<", ">"],
  supportedQuantifiers: ["any", "every"],
  defaultQuantifier: "any",
}
```

问题：

- contract 的 `supportedOperators` 正确，但 `defaultBid` 错误地使用了 `text`，导致前端渲染普通输入框。
- `pbs-server/src/routes/pairing-bids.ts` 当前没有对 119 做 duration 专项校验。
- `pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts` 当前没有 `case 119`。
- Search Pairings / Current Rules preview 对 119 无法正确生成 SQL。

## 数据库核对

当前 live schema 中 `pairing_segment` 是 duty / segment 合并宽表。与 layover duration 直接相关的现有实现和字段：

- `pairing_segment.duty_layover_nits`
  - 当前 layover city 逻辑用它判断该 duty 是否存在过夜 layover。
- `pairing_segment.duty_sch_rest_min`
  - 当前 `153 Minimum Layover Time` / `154 Maximum Layover Time` 已使用它作为 layover time 判断字段。
- `pairing_segment.duty_act_rest_min`
  - 实际休息时长，可作为计划字段缺失时的回退。
- `pairing_segment.duty_seq`
  - pairing 内 duty 序号。
- `pairing_segment.is_deleted`
  - 软删除标记。

推荐本次使用：

```sql
coalesce(s.duty_sch_rest_min, s.duty_act_rest_min)
```

并且只统计：

```sql
s.duty_layover_nits > 0
```

理由：

- 119 的语义是 layover duration，不是 duty duration。
- 现有 153 / 154 已经把 `duty_sch_rest_min` 作为 layover time 的实际比较字段，本次保持同一数据口径。
- PBS bid / preview 面向计划 pairing，应优先用计划 rest / layover duration。
- 如果导入数据缺少计划 rest duration，可回退到实际 rest duration，避免整条 layover 因字段缺失无法参与判断。
- 不新增数据库字段，不依赖规则引擎计算结果。

## 业务语义

`Any/Every Layover Duration` 表达：

> 根据 pairing 内每个 layover 的 layover/rest duration，筛选满足时长条件的 Pairing。

示例：

- `Award + Any + > 15:00`
  - Pairing 中任意一个 layover duration 大于 15 小时，即命中。
- `Avoid + Any + > 15:00`
  - 避免存在任意 layover duration 大于 15 小时的 pairing。
- `Award + Every + < 22:00`
  - Pairing 中每一个 layover duration 都小于 22 小时，即命中。
- `Avoid + Every + < 22:00`
  - 避免所有 layover duration 都小于 22 小时的 pairing。

`Every` 需要避免“没有 layover 的 pairing vacuously true”：

- 必须存在至少一个 layover。
- 且不存在不满足条件的 layover。

## 设计方案

推荐方案：复用现有 `duration` bid 类型，补齐 119 的前端默认值、后端校验和 SQL。

### 前端控制

119 的 bid 值改为：

```ts
{ type: "duration", value: "15:00", operator: ">" }
```

弹窗表现：

- `MODE`: `Award / Avoid`
- `QUANTIFIER`: `Any / Every`
- operator：`<`、`>`
- 单值 `BID`：duration 输入框，placeholder 为 `HH:MM`
- 不显示 `=`
- 不显示 `Between`

保存完整性：

- 空值不能保存为有效 bid。
- 非法 duration 不能保存为有效 bid。
- 分钟必须为 `00-59`。
- 小时允许 1-3 位，支持 `8:00`、`08:00`、`112:30`。

### 后端校验

119 只允许：

- `bid.type = "duration"`

119 不允许：

- `text`
- `duration-range`
- `time`
- `time-range`
- `stepper`
- `tag-list`

operator 规则：

- 单值 `duration` 只允许 `<` 或 `>`。
- 不允许 `=`
- 不允许 `Between`
- `quantifier` 必须是 `any` 或 `every`。

错误文案建议：

- 非 duration：`Any/Every Layover Duration requires duration bid.`
- 非 `<` / `>` operator：`Any/Every Layover Duration supports < or > only.`
- 非 Any/Every：`Any/Every Layover Duration requires Any or Every.`

### Pairing Search SQL

在 `buildPreviewCondition` 中新增 `case 119`。

先按 duty 聚合，避免同一 duty 的多个 segment 重复影响 `Every` 判断：

```sql
select layover_durations.duty_seq, layover_durations.layover_minutes
from (
  select distinct on (s.pairing_id, s.duty_seq)
    s.duty_seq,
    coalesce(s.duty_sch_rest_min, s.duty_act_rest_min)::numeric as layover_minutes
  from <liveSchema>.pairing_segment s
  where s.pairing_id = p.id
    and s.is_deleted = 0
    and s.duty_layover_nits > 0
  order by s.pairing_id, s.duty_seq, s.seg_seq
) layover_durations
where layover_durations.layover_minutes is not null
```

比较表达式：

- `duration`: 把 `HH:MM` 转成分钟后比较 `<` 或 `>`。

`Any` 语义：

```sql
exists (
  <layover_durations_query>
  and <duration_compare>
)
```

`Every` 语义：

```sql
(
  exists (<layover_durations_query>)
  and not exists (
    <layover_durations_query>
    and not (<duration_compare>)
  )
)
```

`Avoid` 语义：

- 复用当前 `wrapIntent`，对 positive clause 包一层 `not (...)`。

## 不做内容

- 不修改 118 的已完成逻辑。
- 不修改 153 / 154 的现有语义。
- 不新增 `duration-range` / `Between` 支持，因为旧库 119 没有 `Between`。
- 不兼容旧 `{ type: "text" }` payload。开发中未上线，旧结构应直接拒绝，避免数据库语义歧义。

## 测试计划

### 单元测试 / 回归测试

后端：

- `pairing-bids` route validation：
  - 接受 119 `duration` + `<`。
  - 接受 119 `duration` + `>`。
  - 拒绝 119 `text`。
  - 拒绝 119 `duration-range`。
  - 拒绝 119 `=`。
  - 拒绝 119 `Between`。
  - 拒绝 119 缺少 `any/every`。
- `pairing-search-condition-builder`：
  - `Any + > 15:00` 转换为 900 分钟并使用 `exists`。
  - `Every + < 22:00` 使用 `exists + not exists`。
  - SQL 使用 `duty_layover_nits > 0`。
  - SQL 使用 `coalesce(duty_sch_rest_min, duty_act_rest_min)`。

前端：

- catalog 测试确认 119 是 `duration`，默认 operator 为 `>`。
- 页面测试确认配置弹窗显示 duration 控件。
- 页面测试确认 operator 只有 `<`、`>`，没有 `=` / `Between`。

构建 / 质量：

- `npm --prefix pbs-server test -- pairing-search-condition-builder pairing-bids`
- `npm --prefix pbs-server run build`
- `npm --prefix pbs-portal test -- pairing-property-catalog pairing-bid-control pairing-bid-control-logic pairing-page`
- `npm --prefix pbs-portal run build`
- `npm --prefix pbs-portal run lint`
- `git diff --check`

## 验收标准

- `Any/Every Layover Duration` 配置窗口不再显示普通空白文本框。
- `BID` 使用 duration 控件，placeholder 为 `HH:MM`。
- operator 只显示 `<`、`>`。
- 保存时只产生 `duration` bid，不产生旧 `text` bid。
- 后端拒绝旧 `text` payload。
- Search Pairings / Current Rules preview 可按 layover duration 正确生成 SQL。
- Any / Every / Award / Avoid 语义与本文一致。
- 回归测试和构建通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次改动范围小，主要集中在同一条 property 的 contract、route validation、SQL builder 和相邻测试；并行拆分会增加协调成本。
- Suggested split: 不建议拆分。
- Write boundaries: 单 agent 顺序修改即可。
- Conflict risk: 中等偏低；会触碰刚刚修改过的 pairing contract 和 pairing tests，单 agent 更安全。
- Execution gate: 用户确认本文档后再实施。
