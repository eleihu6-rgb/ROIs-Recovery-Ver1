# PBS Pairing 130「Total Legs In Last Duty」后端补齐设计

## 背景

用户检查 `Total Legs In Last Duty(propertyCode=130)` 时，前端配置弹窗当前表现为：

- `MODE`：只显示 `Avoid`
- `BID`：operator 只显示 `>`
- 数字输入默认值为 `2`
- 不显示 `Any / Every`

这与旧库定义一致。问题在后端：当前没有看到 `130` 的专用 search / preview SQL，也没有看到 `130` 的专项 payload 校验。也就是说这条条件现在属于“前端看起来对，但后端筛选语义不完整”的类型。

## 旧库对照

旧库文件：`init-docs/crew_bids_reference-2026-03-16-072929.md`

旧库 property `130`：

- 名称：`Total Legs In Last Duty`
- bid 类型：`int`
- action：`avoid`
- quantifier：无
- operator：`>`

Seed 对照：`sql/seed/10-pbs-bid-property.sql`

```text
property_code = 130
property_name = Total Legs In Last Duty
award_or_avoid = ["avoid"]
operator_options = [">"]
validation_json = {"type":"int","label":"Legs","min":1}
```

## 业务语义

`Total Legs In Last Duty` 表达：

> 避免最后一个 duty 中 leg 数量大于指定值的 pairing。

示例：

- `Avoid + > 2`
  - 如果某个 pairing 的最后一个 duty 有 3 个或更多 segment / leg，则该 pairing 被排除。
  - 如果最后一个 duty 有 1 或 2 个 segment / leg，则该条件不命中。

## 当前实现判断

### 前端

当前 contract 定义为：

```ts
{
  propertyCode: 130,
  name: "Total Legs In Last Duty",
  defaultBid: { type: "stepper", value: 2, min: 1, max: 8 },
  supportedActions: ["avoid"],
  supportedOperators: [">"],
}
```

前端控件形态正确，本次不改前端。

### 后端

当前已存在相近逻辑：

- `124 Total Legs In First Duty`
  - 按 `s.duty_seq = 1` 统计 first duty legs。
- `158 Prefer One Landing on Last Duty`
  - 已有找最后一个 duty 的 `max(last_s.duty_seq)` 写法。

但当前没有 `case 130` 专用逻辑。`130` 不能复用 `124`，也不能复用 `158`，因为它需要：

1. 找到当前 pairing 的最后一个 duty。
2. 统计该 duty 下的 segment / leg 数量。
3. 与用户输入的数字做 `>` 比较。
4. 再按 `Avoid` 语义排除命中的 pairing。

## 设计方案

### 后端校验

新增 `130` 专项校验：

允许：

- `bid.type = "stepper"`
- `operator = ">"`
- `action = "avoid"`
- `quantifier = null`

拒绝：

- `text`
- `duration`
- `duration-range`
- `stepper-range`
- `time`
- `time-range`
- `tag-list`
- `flag`
- 非 `>` operator
- `Any / Every`

建议错误文案：

```text
Total Legs In Last Duty requires number bid.
Total Legs In Last Duty supports > only.
```

`action` 已可由 property definition 的 `supportedActions: ["avoid"]` 通用校验覆盖，不需要重复写专门 action 校验。

### Pairing Search SQL

在 `buildPreviewCondition` 中新增 `case 130`。

推荐 SQL 口径：

```sql
(
  select count(*)::numeric
  from <liveSchema>.pairing_segment s
  where s.pairing_id = p.id
    and s.is_deleted = 0
    and s.duty_seq = (
      select max(last_s.duty_seq)
      from <liveSchema>.pairing_segment last_s
      where last_s.pairing_id = p.id
        and last_s.is_deleted = 0
    )
) > $1
```

然后复用现有 `wrapIntent`：

- 因为 `130` 只支持 `Avoid`
- 正向条件是“最后一个 duty legs > N”
- `Avoid` 后实际 SQL 为 `not (<positive clause>)`

最终语义是：排除最后一个 duty legs 大于阈值的 pairing。

### 是否过滤 flight segment

本次建议沿用 `124 Total Legs In First Duty` 的口径：统计 `pairing_segment` 行数，不额外过滤 `flt_id` 或 `seg_assignment`。

理由：

- `124` 已按同一张表统计 first duty 的 segment 数。
- `130` 是 last duty 对称条件，应保持同一口径。
- 本轮不额外引入“leg 必须是 flight segment”的新解释，避免与既有 first duty 逻辑不一致。

如果后续确认 `leg` 必须排除非飞行 segment，应同时规划 `124` 与 `130` 的统一口径调整。

## 不做内容

- 不改前端控件。
- 不改 `124 Total Legs In First Duty`。
- 不改 `157 / 158 Prefer One Landing`。
- 不新增数据库字段。
- 不改旧库 seed。
- 不引入 `Any / Every`。
- 不支持 `= / < / Between`。

## 测试计划

### 后端 route validation

新增或更新 `pbs-server/src/routes/pairing-bids.test.ts`：

- 接受 `130` 的 `stepper + >`
- 拒绝 `130` 的 `text`
- 拒绝 `130` 的 `duration`
- 拒绝 `130` 的 `stepper-range`
- 拒绝 `130` 的 `=`
- 拒绝 `130` 的 `<`

### 后端 SQL builder

新增或更新 `pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts`：

- `130 Avoid > 2` 生成最后一个 duty 的 `max(duty_seq)` 子查询。
- 统计表达式使用 `count(*)::numeric`。
- SQL 包含 `not (...)`，体现 `Avoid` 语义。
- 参数为用户输入值，例如 `[2]`。

### 前端回归

本次不需要改前端，但可保留现有前端行为：

- 弹窗只显示 `Avoid`
- operator 只显示 `>`
- BID 为数字输入
- 不显示 `Any / Every`

如后续实施时发现前端缺少对应测试，可补一条轻量回归，但不改变前端行为。

## 验收标准

- `Total Legs In Last Duty` 不再返回 `Search preview is not supported yet`。
- 后端按最后一个 duty 的 segment 数生成 SQL。
- `Avoid + > N` 能正确排除最后一个 duty legs 大于 N 的 pairing。
- 非法 bid 类型和非法 operator 被后端拒绝。
- 既有 `124 Total Legs In First Duty` 不受影响。
- 后端测试通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个 property 的后端校验、SQL builder 和对应测试，拆分成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: 单 agent 顺序实施。
- Conflict risk: 低到中；会触碰 pairing condition builder 和 pairing-bids route 测试。
- Execution gate: 用户确认本 spec 后再实施。
