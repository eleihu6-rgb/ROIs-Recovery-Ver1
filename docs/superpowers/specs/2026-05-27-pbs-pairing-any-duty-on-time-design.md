# PBS Pairing 120「Any Duty On Time」设计确认

## 背景

用户确认 `Any Duty On Time` 需要对齐旧库和现有前端控件。

当前页面截图里的控件形态是：

- `MODE`: `Award / Avoid`
- `QUANTIFIER`: `Any`
- `BID`: 时间输入 + operator 下拉

这类控件形态本身是对的，但后端还没有把 120 的语义完整落到 SQL 和校验里。

本设计只覆盖 Pairing property `120`，不扩展到 114、118、119、136、141 或其他时间类 property。

## 旧库对照

旧库文件：`init-docs/crew_bids_reference-2026-03-16-072929.xlsx` / 同名 `.md`

旧库 property `120`：

- 名称：`Any Duty On Time`
- bid 类型：`time_of_day`
- action：`award` / `avoid`
- quantifier：`any`
- operator：`>` / `=` / `<` / `Between`

`sql/seed/10-pbs-bid-property.sql` 中 legacy seed 也对齐旧库：

- `property_code = 120`
- `validation_json = {"type":"time_of_day","format":"HH:MM","label":"Duty Time"}`
- `operator_options = [">","=","<","Between"]`
- `any_or_every = ["any"]`

因此当前页面中：

- 显示 `Award / Avoid` 是正确的。
- 显示 `Any` 是正确的。
- 显示时间输入 + operator 下拉是正确的。
- 允许 `=` 是正确的。
- 允许 `Between` 是正确的。
- 这个条件不应该做成 `Every`。

## 当前实现问题

当前 `packages/contracts/pbs-pairing-bids.js` 中 120 的配置已经是 time bid，但后端还没有对应的专项实现：

- `pbs-server/src/routes/pairing-bids.ts` 没有 120 的专项校验。
- `pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts` 没有 `case 120`。
- 页面上虽然有时间控件，但 preview / search 语义可能没真正对齐旧库字段。

## 数据库核对

现有 schema 中与 Duty On Time 最相关的时间字段：

- `pairing_segment.duty_sch_str_dt_utc`
  - duty 的计划开始时间，优先级最高。
- `pairing_segment.brief_start_utc`
  - duty 的简报开始时间，适合作为回退。
- `pairing_segment.sch_str_dt_utc`
  - 当前宽表里已经存在的计划开始时间，适合作为最后回退。
- `pairing_segment.is_deleted`
  - 软删除标记。

推荐本次使用：

```sql
coalesce(s.duty_sch_str_dt_utc, s.brief_start_utc, s.sch_str_dt_utc)
```

理由：

- 120 的旧库标签是 `Duty Time`，更接近 duty 的 on-time / start-time，而不是 enroute check-in 或 release time。
- `duty_sch_str_dt_utc` 是最明确的 duty 计划开始时间。
- 如果某些历史数据缺少该字段，可回退到 `brief_start_utc` 和 `sch_str_dt_utc`，避免整条 duty 无法参与判断。
- 不新增数据库字段，不依赖规则引擎计算结果。

## 业务语义

`Any Duty On Time` 表达：

> 在 pairing 内，至少存在一个 duty，其 on-time 落在指定时间条件中。

示例：

- `Award + = 12:00`
  - pairing 中存在任一 duty 的 on-time 等于 12:00。
- `Award + > 12:00`
  - pairing 中存在任一 duty 的 on-time 晚于 12:00。
- `Avoid + Between 08:00 and 10:00`
  - 避免任何 duty on-time 落在 08:00 到 10:00 之间的 pairing。

## 设计方案

推荐方案：复用现有 `time` / `time-range` bid 类型，补齐 120 的后端校验和 SQL。

### 前端控制

120 的 bid 维持为：

- 单值：`{ type: "time", value: "12:00", operator: "=" }`
- 范围：`{ type: "time-range", from: "08:00", to: "10:00" }`

弹窗表现：

- `MODE`: `Award / Avoid`
- `QUANTIFIER`: `Any`
- operator：`=`, `<`, `>`, `Between`
- 单值 `BID`：time 输入框
- `Between`：两个 time 输入框

保存完整性：

- 空值不能保存为有效 bid。
- 非法时间不能保存为有效 bid。
- `quantifier` 必须是 `any`。

### 后端校验

120 只允许：

- `bid.type = "time"`
- `bid.type = "time-range"`

120 不允许：

- `text`
- `duration`
- `duration-range`
- `stepper`
- `tag-list`
- `flag`

operator 规则：

- 单值 `time` 允许 `=`, `<`, `>`, `Between`。
- `time-range` 仅用于 `Between`。
- `quantifier` 只允许 `any`。

错误文案建议：

- 非 time：`Any Duty On Time requires time bid.`
- 非 Any：`Any Duty On Time requires Any.`

### Pairing Search SQL

在 `buildPreviewCondition` 中新增 `case 120`。

比较来源：

```sql
coalesce(s.duty_sch_str_dt_utc, s.brief_start_utc, s.sch_str_dt_utc)
```

比较方式：

- 单值 `time`: 对时间点进行 `=`, `<`, `>` 比较。
- `Between`: 进行时间区间比较。

`Any` 语义：

```sql
exists (
  select 1
  from <liveSchema>.pairing_segment s
  where s.pairing_id = p.id
    and s.is_deleted = 0
    and <time_compare>
)
```

`Avoid` 语义：

- 复用当前 `wrapIntent`，对 positive clause 包一层 `not (...)`。

## 不做内容

- 不改 118 / 119 的逻辑。
- 不改 114 / 136 / 141 的已有语义。
- 不新增 `every` 支持。
- 不将 120 兼容成旧 `text` payload。

## 测试计划

### 单元测试 / 回归测试

后端：

- `pairing-bids` route validation：
  - 接受 120 `time` + `=`
  - 接受 120 `time` + `<`
  - 接受 120 `time` + `>`
  - 接受 120 `time-range` + `Between`
  - 拒绝 120 `text`
  - 拒绝 120 缺少 `any`
- `pairing-search-condition-builder`：
  - `Any Duty On Time = 12:00` 使用 duty on-time 字段
  - `Any Duty On Time Between 08:00 and 10:00` 正确生成时间区间 SQL
  - `Avoid` 能正确包裹 `not (...)`

前端：

- catalog 测试确认 120 是 `time` bid，支持 `= / < / > / Between`。
- 页面测试确认配置弹窗显示时间控件，而不是文本控件。

构建 / 质量：

- `npm --prefix pbs-server test -- pairing-search-condition-builder pairing-bids`
- `npm --prefix pbs-server run build`
- `npm --prefix pbs-portal test -- pairing-property-catalog pairing-bid-control pairing-bid-control-logic pairing-page`
- `npm --prefix pbs-portal run build`
- `npm --prefix pbs-portal run lint`
- `git diff --check`

## 验收标准

- `Any Duty On Time` 保持时间输入 + operator 下拉，不回退成文本输入。
- operator 支持 `=`, `<`, `>`, `Between`。
- `quantifier` 只允许 `Any`。
- 后端能按 duty on-time 正确生成 SQL。
- 旧 `text` payload 不再被接受。
- 回归测试和构建通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次工作集中在同一条 property 的 contract、route validation、SQL builder 和相邻测试，拆分收益不高。
- Suggested split: 不建议拆分。
- Write boundaries: 单 agent 顺序实施。
- Conflict risk: 中等；会和刚刚调整过的 pairing contract/tests 相邻，单 agent 更稳。
- Execution gate: 用户确认本文档后再实施。
