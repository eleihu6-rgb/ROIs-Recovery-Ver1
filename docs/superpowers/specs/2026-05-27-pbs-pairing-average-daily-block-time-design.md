# PBS Pairing 121「Average Daily Block Time」设计确认

## 背景

用户确认 `Average Daily Block Time(propertyCode=121)` 现在的页面形态是错的：

- 当前显示为普通空白文本框
- 旧库要求它是 `credit` 类条件
- 只支持 `<` 和 `>`
- 不需要 `Any/Every`

这意味着 121 不是自由文本条件，应该和现有 `Average Daily Credit` / `Pairing Total Credit` 一样，使用带 operator 的时间/credit 输入控件。

## 旧库对照

旧库文件：`init-docs/crew_bids_reference-2026-03-16-072929.xlsx` / 同名 `.md`

旧库 property `121`：

- 名称：`Average Daily Block Time`
- bid 类型：`credit`
- action：`award` / `avoid`
- quantifier：无
- operator：`<` / `>`

`sql/seed/10-pbs-bid-property.sql` 中 legacy seed 也对齐旧库：

- `property_code = 121`
- `validation_json = {"type":"credit","format":"HH:MM","label":"Average Daily Block Time"}`
- `operator_options = ["<",">"]`

因此当前页面中：

- 显示 `Award / Avoid` 是正确的。
- 需要显示带 operator 的 credit duration 控件。
- 不能是普通文本框。
- 不应出现 `=`。
- 不应出现 `Between`。
- 不应出现 `Any / Every`。

## 当前实现问题

当前 `packages/contracts/pbs-pairing-bids.js` 中 121 的配置仍是：

```ts
{
  propertyCode: 121,
  name: "Average Daily Block Time",
  defaultBid: { type: "text", value: "06:00" },
  supportedActions: ["award", "avoid"],
  supportedOperators: ["<", ">"],
}
```

问题：

- `defaultBid` 错误使用了 `text`，导致前端渲染普通输入框。
- 后端 route 没有针对 121 的明确校验。
- 后端 search SQL 没有针对 121 的明确公式。

## 语义定义

`Average Daily Block Time` 表达：

> pairing 的总 block time ÷ pairing 天数

可写成：

```text
Average Daily Block Time = Total Block Time / Pairing Length
```

其中：

- `Total Block Time`：pairing 内所有 flight segment 的 block time 汇总。
- `Pairing Length`：使用 `p.duration_days`，并以 `greatest(coalesce(p.duration_days, 1), 1)` 避免除零。

## 数据来源

当前 schema 中与 block time 直接相关的字段：

- `flight.blk_min`
  - flight 的 block time，单位分钟。
- `pairing_segment.flt_id`
  - 关联 `flight.id`。
- `pairing_segment.pairing_id`
  - 归属 pairing。
- `pairing_segment.seg_assignment`
  - 用于区分正常飞行段和地面/调机等非 block 段。

推荐本次的分子口径：

```sql
sum(coalesce(f.blk_min, 0))
```

并通过 `pairing_segment.flt_id = flight.id` 聚合 pairing 内的 flight block time。

理由：

- 旧库叫的是 `block time`，而不是 `flight time` 或 `credit`。
- `flight.blk_min` 是 schema 里最明确的 block time 字段。
- 通过 `pairing_segment.flt_id` 可以把 pairing 的 flight 段准确关联到 flight 表。
- 不新增数据库字段，不依赖额外计算表。

## 设计方案

推荐方案：复用现有 `duration` bid 类型，把 121 从 `text` 改成 `duration`，并补齐后端校验与 SQL。

### 前端控制

121 的 bid 改为：

```ts
{ type: "duration", value: "06:00", operator: ">" }
```

弹窗表现：

- `MODE`: `Award / Avoid`
- `BID`: duration 输入框
- operator：`<`、`>`
- 不显示 `=`
- 不显示 `Between`

保存完整性：

- 空值不能保存为有效 bid。
- 非法 duration 不能保存为有效 bid。
- `Between` 不应出现。

### 后端校验

121 只允许：

- `bid.type = "duration"`

121 不允许：

- `text`
- `duration-range`
- `time`
- `time-range`
- `stepper`
- `tag-list`
- `flag`

operator 规则：

- 只允许 `<` 或 `>`
- 不允许 `=`
- 不允许 `Between`

错误文案建议：

- 非 duration：`Average Daily Block Time requires duration bid.`
- 非 `<` / `>` operator：`Average Daily Block Time supports < or > only.`

### Pairing Search SQL

在 `buildPreviewCondition` 中新增 `case 121`。

公式建议：

```sql
(
  select coalesce(sum(f.blk_min), 0)::numeric / greatest(coalesce(p.duration_days, 1), 1)
  from <liveSchema>.pairing_segment s
  join <liveSchema>.flight f
    on f.id = s.flt_id
  where s.pairing_id = p.id
    and s.is_deleted = 0
    and s.flt_id is not null
)
```

比较方式：

- 将输入的 `HH:MM` 转成分钟，再与上面的平均每日 block time（分钟）比较。

`avoid` 语义：

- 继续沿用现有 `not (...)` 包裹方式。

## 不做内容

- 不改 `Pairing Total Credit(propertyCode=105)`。
- 不改 `Average Daily Credit(propertyCode=109)`。
- 不引入 `Any/Every`。
- 不兼容旧 `text` payload。

## 测试计划

### 单元测试 / 回归测试

后端：

- `pairing-bids` route validation：
  - 接受 121 `duration` + `>`
  - 接受 121 `duration` + `<`
  - 拒绝 121 `text`
  - 拒绝 121 `duration-range`
  - 拒绝 121 `=`
  - 拒绝 121 `Between`
- `pairing-search-condition-builder`：
  - 121 按 `sum(f.blk_min) / pairing_days` 生成 SQL
  - `avoid` 正确包裹 `not (...)`

前端：

- catalog 测试确认 121 是 `duration` bid，支持 `<` / `>`。
- 页面测试确认配置弹窗显示 duration 控件，而不是文本框。

构建 / 质量：

- `npm --prefix pbs-server test -- pairing-search-condition-builder pairing-bids`
- `npm --prefix pbs-server run build`
- `npm --prefix pbs-portal test -- pairing-property-catalog pairing-bid-control pairing-bid-control-logic pairing-page`
- `npm --prefix pbs-portal run build`
- `npm --prefix pbs-portal run lint`
- `git diff --check`

## 验收标准

- `Average Daily Block Time` 不再显示普通文本框。
- 只使用 duration 控件。
- operator 只显示 `<` / `>`。
- 后端能按 `总 block time / pairing 天数` 正确生成 SQL。
- 旧 `text` payload 不再被接受。
- 回归测试和构建通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次改动集中在同一条 property 的 contract、route validation、SQL builder 和相邻测试，拆分收益不高。
- Suggested split: 不建议拆分。
- Write boundaries: 单 agent 顺序实施。
- Conflict risk: 中等；会触碰刚刚改过的 pairing 时间类逻辑，单 agent 更稳。
- Execution gate: 用户确认本文档后再实施。
