# PBS Pairing 124「Total Legs In First Duty」后端补齐设计确认

## 背景

当前 `Total Legs In First Duty(propertyCode=124)` 的前端弹窗表现基本符合旧库：

- `MODE`: `Award / Avoid`
- `BID`: 数字输入
- operator: `>` / `<`
- 不显示 `Any / Every`
- 不显示 `=` / `Between`

但后端目前没有看到 124 的专用 search SQL，也没有针对 124 的专项 payload 校验。这样会导致页面虽然能配置条件，但 Search Pairings / preview 里不能按第一段 duty 的 leg 数量正确筛选。

## 旧库对照

旧库文件：`init-docs/crew_bids_reference-2026-03-16-072929.md`

旧库 property `124`：

- 名称：`Total Legs In First Duty`
- bid 类型：`int`
- action：`award` / `avoid`
- quantifier：无
- operator：`>` / `<`

seed 对照：`sql/seed/10-pbs-bid-property.sql`

```text
property_code = 124
validation_json = {"type":"int","label":"Legs","min":1}
operator_options = ["<",">"]
```

## 语义定义

`Total Legs In First Duty` 表达：

> pairing 第一段 duty 中包含的 leg 数量。

实现口径：

```sql
count(pairing_segment where duty_seq = 1)
```

然后用用户选择的 operator 与数字比较：

- `> N`
- `< N`

`avoid` 继续沿用现有规则：对正向条件外层包 `not (...)`。

## 当前问题

### 前端

当前 contract 中 124 是：

```ts
{
  propertyCode: 124,
  name: "Total Legs In First Duty",
  defaultBid: { type: "stepper", value: 2, min: 1, max: 8 },
  supportedActions: ["award", "avoid"],
  supportedOperators: [">", "<"],
}
```

前端控件形态合理，本次不需要改 UI。

### 后端

问题：

- `buildPreviewCondition` / `buildCorePreviewCondition` 没有 124 专用逻辑。
- route validation 没有针对 124 限定 `stepper`。
- 没有针对 124 限定只允许 `>` / `<`。

## 设计方案

### 后端校验

新增 124 专项校验。

允许：

- `bid.type = "stepper"`
- `bid.operator = ">"` 或 `"<"`

拒绝：

- `stepper-range`
- `text`
- `duration`
- `duration-range`
- `time`
- `time-range`
- `tag-list`
- `flag`
- `operator = "="`
- `operator = "Between"`

建议错误文案：

```text
Total Legs In First Duty requires number bid.
```

```text
Total Legs In First Duty supports < or > only.
```

### Pairing Search SQL

在 pairing search condition builder 中新增 124。

推荐 SQL：

```sql
(
  select count(*)::numeric
  from <liveSchema>.pairing_segment s
  where s.pairing_id = p.id
    and s.is_deleted = 0
    and s.duty_seq = 1
)
```

再复用数字比较逻辑，生成：

```sql
... > $1
```

或：

```sql
... < $1
```

`avoid` 外层继续由现有 `wrapIntent` 包 `not (...)`。

## 不做内容

- 不改前端控件布局。
- 不新增 `Any / Every`。
- 不支持 `=`。
- 不支持 `Between`。
- 不改 `107 Any/Every Duty Legs`。
- 不改 `108 Total Legs In Pairing`。
- 不改 `130 Total Legs In Last Duty`。
- 不新增数据库字段。
- 不兼容旧的错误 bid 类型；当前仍在开发期，错误结构直接拒绝。

## 测试计划

### 后端 route validation

- 接受 124 `stepper` + `>`
- 接受 124 `stepper` + `<`
- 拒绝 124 `stepper` + `=`
- 拒绝 124 `stepper-range`
- 拒绝 124 `text`
- 拒绝 124 `duration`

### 后端 SQL builder

- 124 生成 `count(*)` + `duty_seq = 1` 的第一段 duty leg 数量 SQL。
- `>` 正确生成大于比较。
- `<` 正确生成小于比较。
- `avoid` 正确包裹 `not (...)`。
- 错误 bid 类型返回 unsupported 或 route validation 拒绝。

### 前端回归

本次不改前端实现，但仍需要跑 Pairing 相关回归，确认 contract 和弹窗未被破坏：

- 124 弹窗仍只显示 `>` / `<`
- 不显示 `Any / Every`
- 数字输入仍可保存
- 默认只选中一个 tier

## 验证命令

```bash
npm --prefix pbs-server test -- pairing-search-condition-builder pairing-bids
npm --prefix pbs-server run build
npm --prefix pbs-portal test -- pairing-page pairing-bid-control pairing-bid-control-logic pairing-property-catalog
npm --prefix pbs-portal run build
npm --prefix pbs-portal run lint
git diff --check
```

## 验收标准

- `Total Legs In First Duty` 可以按第一段 duty 的 leg 数量筛选 pairing。
- `Award / Avoid` 语义正确。
- 只支持 `<` 和 `>`。
- 后端拒绝错误 bid 类型和不支持的 operator。
- 自动化测试、构建、lint 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在单个 property 的后端校验、SQL builder 和少量测试，拆分成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: 单 agent 顺序实施。
- Conflict risk: 低；主要涉及 pairing route validation 和 search condition builder。
- Execution gate: 用户确认本文档后再实施。
