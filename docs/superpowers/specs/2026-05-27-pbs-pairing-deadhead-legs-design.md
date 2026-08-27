# PBS Pairing 122「Deadhead Legs」设计确认

## 背景

当前 `Deadhead Legs(propertyCode=122)` 的前端弹窗看起来基本符合旧库：

- `MODE`: `Award / Avoid`
- `BID`: 数字输入
- operator: `= / < / > / Between`
- 不需要 `Any / Every`

但后端目前没有看到 122 的专用 search SQL，也没有针对 122 的专项 payload 校验。现有 deadhead 相关 SQL 只覆盖了“是否存在 deadhead”的 flag 类条件，不等价于 `Deadhead Legs` 的数量比较。

## 旧库对照

旧库文件：`init-docs/crew_bids_reference-2026-03-16-072929.md`

旧库 property `122`：

- 名称：`Deadhead Legs`
- bid 类型：`int`
- action：`award` / `avoid`
- quantifier：无
- operator：`Between, =, <, >`

seed 对照：`sql/seed/10-pbs-bid-property.sql`

```text
property_code = 122
validation_json = {"type":"int","label":"Deadhead Legs","min":0}
operator_options = ["<","=",">","Between"]
```

## 语义定义

`Deadhead Legs` 表达：

> pairing 中 deadhead leg 的数量

实现口径：

```sql
count(pairing_segment where seg_assignment = 'DHD')
```

然后用用户选择的 operator 与数字比较：

- `= N`
- `< N`
- `> N`
- `Between A and B`

`avoid` 继续沿用现有规则：对正向条件外层包 `not (...)`。

## 当前问题

### 前端

前端 contract 当前是：

```ts
{
  propertyCode: 122,
  name: "Deadhead Legs",
  defaultBid: { type: "stepper", value: 1, min: 0, max: 8 },
  supportedActions: ["award", "avoid"],
  supportedOperators: ["=", "<", ">", "Between"],
}
```

整体形态合理。

需要确认的小点：

- 旧库 `min=0`，所以允许输入 `0` 是合理的。
- 默认值是否用 `0` 或 `1` 属于产品默认选择；本次建议不强行改 UI 默认值，除非后续你要求。

### 后端

问题：

- `buildPreviewCondition` / `buildCorePreviewCondition` 没有 122 专用逻辑。
- 122 应该统计 `seg_assignment='DHD'` 的 segment 数量，而不是只判断是否存在 deadhead。
- route validation 没有针对 122 限定 `stepper / stepper-range`。

## 设计方案

### 前端

保持当前控件：

- `stepper`
- `stepper-range` 对应 `Between`
- operator 保持 `= / < / > / Between`
- 不显示 `Any / Every`

本次不改默认值，除非你确认要把默认值从 `1` 改为 `0`。

### 后端校验

新增 122 专项校验：

允许：

- `bid.type = "stepper"`
- `bid.type = "stepper-range"`

拒绝：

- `text`
- `duration`
- `duration-range`
- `time`
- `time-range`
- `tag-list`
- `flag`

建议错误文案：

```text
Deadhead Legs requires number bid.
```

### Pairing Search SQL

在 core condition 中新增 122：

```sql
(
  select count(*)::numeric
  from <liveSchema>.pairing_segment s
  where s.pairing_id = p.id
    and s.is_deleted = 0
    and s.seg_assignment = 'DHD'
)
```

再复用 `buildCompareClause` 处理：

- `stepper`：`= / < / >`
- `stepper-range`：`between`

## 不做内容

- 不改 `Any Leg Is Redeye(propertyCode=117)`。
- 不改 `Deadhead Day(propertyCode=128)`。
- 不改 `Avoid Deadheads` 等 flag 类 deadhead 条件。
- 不新增数据库字段。
- 不引入 Any/Every。

## 测试计划

后端 route validation：

- 接受 122 `stepper` + `=`
- 接受 122 `stepper` + `<`
- 接受 122 `stepper` + `>`
- 接受 122 `stepper-range`
- 拒绝 122 `text`
- 拒绝 122 `duration`

后端 SQL：

- 122 生成 `count(*)` deadhead segment 数量比较 SQL
- `Between` 正确生成 `between $1 and $2`
- `avoid` 正确包裹 `not (...)`

前端回归：

- 打开 `Deadhead Legs` 弹窗，显示数字控件
- operator 显示 `= / < / > / Between`
- 不显示 `Any / Every`
- 默认只选中一个 tier

验证命令：

```bash
npm --prefix pbs-server test -- pairing-search-condition-builder pairing-bids
npm --prefix pbs-server run build
npm --prefix pbs-portal test -- pairing-page pairing-bid-control pairing-bid-control-logic pairing-property-catalog
npm --prefix pbs-portal run build
npm --prefix pbs-portal run lint
git diff --check
```

## 验收标准

- `Deadhead Legs` 可以按 deadhead leg 数量筛选 pairing。
- `Award / Avoid` 语义正确。
- `= / < / > / Between` 都能生成对应 SQL。
- 错误 bid 类型会被后端拒绝。
- 前端弹窗不出现 `Any / Every`。
- 回归测试和构建通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个 property 的后端校验、SQL builder 和少量前端测试，拆分成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: 单 agent 顺序实施。
- Conflict risk: 低到中；会碰 pairing condition builder 和 pairing-bids route 测试。
- Execution gate: 用户确认本文档后再实施。
