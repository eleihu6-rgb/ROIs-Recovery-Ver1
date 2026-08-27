# PBS Pairing 123「Any/Every Layover On Date / Day」设计确认

## 背景

当前页面中 `Any/Every Layover On Date / Day(propertyCode=123)` 的配置弹窗显示为：

- `MODE`: `Award / Avoid`
- `QUANTIFIER`: `Any / Every`
- `BID`: `In`
- 输入框：`Type airport or city code`
- 日期输入框

这个 UI 表现会让用户理解成：

> 在某个机场 / 城市发生 layover，并且指定某个日期。

但旧库对 123 的定义不是机场条件，而是 `date_or_dow` 条件。因此当前控件和旧库语义不一致。

## 旧库对照

旧库文件：`init-docs/crew_bids_reference-2026-03-16-072929.md`

旧库 property `123`：

- 名称：`Any/Every Layover On Date / Day`
- bid 类型：`date_or_dow`
- action：`award` / `avoid`
- quantifier：`any` / `every`
- operator：`Between`

旧库说明中也写到：

```text
123 Any/Every Layover On Date / Day
- Between 表示日期范围
```

因此 123 的核心不是 airport / city，而是 layover 日期或星期几。

## 语义定义

`Any/Every Layover On Date / Day` 表达：

> pairing 中的 layover 是否发生在指定日期、星期几，或指定日期范围内。

### Any

`Any + In Monday`：

> 只要 pairing 中存在任意一个 layover 发生在 Monday，就命中。

`Any + In 2026-04-10`：

> 只要 pairing 中存在任意一个 layover 发生在 2026-04-10，就命中。

### Every

`Every + In Monday, Tuesday`：

> pairing 中所有 layover 都必须发生在 Monday 或 Tuesday，才命中。

### Between

`Any + Between 2026-04-10 and 2026-04-15`：

> 只要 pairing 中存在任意一个 layover 日期落在这个范围内，就命中。

`Every + Between 2026-04-10 and 2026-04-15`：

> pairing 中所有 layover 日期都必须落在这个范围内，才命中。

### Avoid

`Avoid` 沿用现有 Pairing Search 语义：对正向条件外层包 `not (...)`。

例如：

`Avoid + Any + In Sunday`

> 避免存在任意 Sunday layover 的 pairing。

## 当前问题

### 前端

当前 contract 中 123 是：

```ts
{
  propertyCode: 123,
  name: "Any/Every Layover On Date / Day",
  defaultBid: { type: "tag-list-date", values: [], date: "" },
  supportedActions: ["award", "avoid"],
  supportedOperators: ["In", "Between"],
  supportedQuantifiers: ["any", "every"],
  defaultQuantifier: "any",
}
```

这会导致页面渲染为：

- airport / city code 输入
- 单独 date 输入

但旧库要求它是 `date_or_dow`：

- 日期列表
- 星期几列表
- `Between` 日期范围

### 后端

后端当前没有看到 123 的专用 SQL。

如果 123 继续沿用 `tag-list-date`，后端会天然倾向于机场 / 城市逻辑，和旧库语义不一致。

## 推荐方案

推荐将 123 对齐为 `date-or-dow-list` / `date-range`，与 `110 Any/Every Duty On Date / Day` 的控件模型保持一致，但 SQL 判断对象改为 layover。

### 前端 contract

将 123 的默认 bid 从：

```ts
{ type: "tag-list-date", values: [], date: "" }
```

改为：

```ts
{ type: "date-or-dow-list", dates: [], daysOfWeek: [] }
```

保留：

- `supportedActions: ["award", "avoid"]`
- `supportedOperators: ["In", "Between"]`
- `supportedQuantifiers: ["any", "every"]`
- `defaultQuantifier: "any"`

### 前端控件

123 弹窗应显示为日期 / 星期控件：

- `In` 时：
  - 可添加一个或多个日期
  - 可选择一个或多个星期几
  - 不显示 airport / city code 输入框
- `Between` 时：
  - 显示开始日期和结束日期
  - 不显示 airport / city code 输入框

### 后端 payload 校验

123 只允许：

- `bid.type = "date-or-dow-list"`
- `bid.type = "date-range"`

123 拒绝：

- `tag-list`
- `tag-list-date`
- `text`
- `time`
- `time-range`
- `duration`
- `duration-range`
- `stepper`
- `flag`

建议错误文案：

```text
Any/Every Layover On Date / Day requires date-or-dow bid.
```

123 必须要求 `quantifier` 为：

- `any`
- `every`

建议错误文案：

```text
Any/Every Layover On Date / Day requires Any or Every.
```

### Pairing Search SQL

layover 的基础集合使用 `pairing_segment` 中已存在的 layover 标记：

```sql
from <liveSchema>.pairing_segment s
where s.pairing_id = p.id
  and s.is_deleted = 0
  and s.duty_layover_nits > 0
```

推荐 layover 日期口径：

```sql
(coalesce(s.duty_sch_end_dt_utc, s.sch_end_dt_utc) at time zone 'UTC')::date
```

理由：

- 当前已有 layover airport/date 逻辑使用 `duty_sch_end_dt_utc` 作为 layover 相关日期口径。
- layover 通常发生在 duty 结束后的休息段，使用 duty end 日期更贴近 “layover on date/day”。
- `sch_end_dt_utc` 作为兜底，避免部分数据缺少 `duty_sch_end_dt_utc` 时无法判断。

#### date-or-dow-list

日期和星期几之间用 OR：

```sql
layover_date = any($dates::date[])
or extract(isodow from layover_date) = any($days::int[])
```

如果 dates 和 daysOfWeek 都为空，后端返回 400。

#### date-range

```sql
layover_date between $from::date and $to::date
```

若 `to < from`，后端返回 400。

#### Any

```sql
exists (
  select 1
  from <liveSchema>.pairing_segment s
  where s.pairing_id = p.id
    and s.is_deleted = 0
    and s.duty_layover_nits > 0
    and <layover date match>
)
```

#### Every

```sql
(
  exists (
    select 1
    from <liveSchema>.pairing_segment s
    where s.pairing_id = p.id
      and s.is_deleted = 0
      and s.duty_layover_nits > 0
  )
  and not exists (
    select 1
    from <liveSchema>.pairing_segment s
    where s.pairing_id = p.id
      and s.is_deleted = 0
      and s.duty_layover_nits > 0
      and not (<layover date match>)
  )
)
```

## 不做内容

- 不保留 123 的 airport / city code 输入。
- 不把 123 做成 airport + date 的组合条件。
- 不改 `104 Any/Every Layover In Airport`。
- 不改 `152 Layover at City on Date` 等 airport/date 类条件。
- 不新增数据库字段。
- 不迁移历史草稿中的旧 `tag-list-date` payload；当前仍在开发中，按新 contract 直接收敛。

## 测试计划

### 后端 route validation

- 接受 123 `date-or-dow-list` + `any`
- 接受 123 `date-or-dow-list` + `every`
- 接受 123 `date-range` + `any`
- 接受 123 `date-range` + `every`
- 拒绝 123 `tag-list-date`
- 拒绝 123 `tag-list`
- 拒绝缺少 `quantifier`
- 拒绝非法 date range

### 后端 SQL builder

- `Any + date-or-dow-list` 使用 layover segment 日期判断。
- `Every + date-or-dow-list` 使用 `not exists mismatched layover`。
- `Any + date-range` 生成 `between` 条件。
- `Avoid` 正确包裹 `not (...)`。
- 空日期/星期列表返回清晰 400。

### 前端

- 123 弹窗不显示 `Type airport or city code`。
- 123 `In` 显示日期 / 星期几选择控件。
- 123 `Between` 显示开始日期 / 结束日期。
- 123 默认只选中一个 tier。
- 保存后能正确回显日期、星期几或日期范围。

### QA 人工测试

新增 QA 测试单：

```text
docs/test-cases/pbs/pairing/2026-05-27-layover-on-date-or-day.md
```

覆盖：

- `In` + 日期
- `In` + 星期几
- `Between` 日期范围
- `Any / Every`
- `Award / Avoid`
- 不显示 airport / city code

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

- 123 的 UI 不再出现 airport / city 输入框。
- 123 按旧库 `date_or_dow` 语义保存和回显。
- 123 能在 Search Pairings 中按 layover 日期 / 星期几筛选。
- `Any / Every` 语义正确。
- `Award / Avoid` 语义正确。
- 后端拒绝旧的 `tag-list-date` payload，避免后续数据结构歧义。
- 自动化测试、构建、lint 和 QA 测试单齐全。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在单个 property 的 contract、前端控件派生、后端校验、SQL builder 和测试，拆分会增加同步成本。
- Suggested split: 不拆分。
- Write boundaries: 单 agent 顺序实施。
- Conflict risk: 中；会碰 Pairing bid contract、配置弹窗测试、route validation 和 SQL builder。
- Execution gate: 用户确认本文档后再实施。
