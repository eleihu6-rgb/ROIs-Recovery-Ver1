# PBS Pairing Any/Every Duty On Date / Day 控件与搜索 SQL 设计

## 背景

当前 `Any/Every Duty On Date / Day(propertyCode=110)` 在 `Configure Pairing Bid` 弹窗中显示为：

- `In / Between` operator
- `Any / Every` quantifier
- 一个 tag 输入框
- 一个日期输入框

这来自当前 contract 中的 `tag-list-date` 默认 bid。这个形态会让用户看起来需要同时输入星期 tag 和一个日期，语义不符合旧库。

核对旧库 `init-docs/crew_bids_reference-2026-03-16-072929.xlsx` 后确认：

- `id`: `110`
- `remastered_property`: `Any/Every Duty On Date / Day`
- `award_or_avoid`: `["award", "avoid"]`
- `any_or_every`: `["any", "every"]`
- `operator`: `["Between", "In"]`
- `validation_json`: `{"type": "date_or_dow", "label": "Date / Day", "label_from": "From Date", "label_to": "To Date", "multi": true}`
- `notes`: `Date/DOW the duty falls on; operator=Between for date range`

旧数据样例同时包含日期列表和星期列表：

- `param_a = Dec 24,2025`
- `param_a = Monday,Friday`
- `param_a = Aug 8,2025,Aug 10,2025`
- `operator = Between, param_a = Dec 1, 2025, param_b = Dec 2, 2025`

因此该条件应按 `date_or_dow` 建模，而不是 `tag-list-date`。

## 语义定义

`Any/Every Duty On Date / Day` 表示检查 pairing 中每个 duty 落在哪个日期或星期几。

- `Award + Any`: 只要 pairing 中任意一个 duty 的 duty date / day 命中，就 award。
- `Award + Every`: pairing 中至少存在一个 duty，且每个 duty 的 duty date / day 都命中，才 award。
- `Avoid + Any`: 避免存在任意 duty 命中的 pairing。
- `Avoid + Every`: 避免所有 duty 都命中的 pairing。

`In` 的值可以是：

- 一个或多个具体日期，例如 `2026-04-03`
- 一个或多个星期几，例如 `MON`、`TUE`
- 日期和星期几可以同时存在，使用 OR 语义

`Between` 只表示日期范围，不表示星期范围。

## Duty Date 取值

推荐使用 duty 的计划开始日期作为 duty date：

```sql
(coalesce(s.duty_sch_str_dt_utc, s.brief_start_utc, s.sch_str_dt_utc) at time zone 'UTC')::date
```

原因：

- 旧库说明是 “Date/DOW the duty falls on”，更接近 duty 开始落日。
- 当前 live 宽表已有 `duty_sch_str_dt_utc`，同一 duty 的所有 segment 冗余该字段。
- 如果个别数据缺失，可 fallback 到 `brief_start_utc` / `sch_str_dt_utc`。

实现 SQL 时应先按 `pairing_id + duty_seq` 去重，避免一个 duty 多个 segment 被重复计算。

## 推荐方案

### 方案 A：复用 `date-or-dow-list` / `date-range`

将 110 改为和 `Departing On(propertyCode=106)` 同一类 bid：

- `In`: `{ type: "date-or-dow-list", dates: string[], daysOfWeek: DayOfWeek[] }`
- `Between`: `{ type: "date-range", from: string, to: string }`

前端复用已有日期 chips + 星期按钮控件；`Between` 复用日期范围控件。后端 route 对 110 做专属校验，只接受上述两类 bid。搜索 SQL 为 110 单独实现 Any/Every duty 逻辑。

优点：和旧库 `date_or_dow` 对齐；UI 简单清楚；不引入新 bid 类型。

缺点：`date-or-dow-list` 的命名比较通用，后端需要根据 propertyCode 判断具体业务字段。

### 方案 B：新增专属 `duty-date-or-dow-list`

新增一个只给 110 使用的 bid 类型，结构与 `date-or-dow-list` 相同。

优点：类型语义更显式。

缺点：前端、序列化、校验、测试都要增加新分支；当前收益不高，容易重复。

### 方案 C：继续使用 `tag-list-date` 并改 label

保留当前数据结构，只改善占位文案或提示。

优点：改动小。

缺点：仍然表达不出旧库 `date_or_dow`；用户会继续误解为“星期值 + 单独日期”的组合；后端语义也不清楚。

推荐采用方案 A。

## 实现范围

确认后实施时应修改：

- `packages/contracts/pbs-pairing-bids.js`
  - 110 默认 bid 从 `tag-list-date` 改为 `date-or-dow-list`
  - 保留 `supportedOperators: ["In", "Between"]`
  - 保留 `supportedQuantifiers: ["any", "every"]`
- `pbs-portal`
  - 让 110 的 `In` 使用日期 chips + 星期按钮
  - 让 110 的 `Between` 使用日期范围
  - 保存前沿用现有 date / date-range 完整性校验
- `pbs-server`
  - route 校验 110 只接受 `date-or-dow-list` / `date-range`
  - search SQL 增加 110
  - 拒绝旧 `tag-list-date`，不兼容旧结构
- 测试
  - 前端控件测试
  - route 接收新结构、拒绝旧结构测试
  - search SQL 测试覆盖 `Any`、`Every`、`Between`、`Avoid`
  - 人工 QA 文档

## SQL 设计草案

先构建 duty 去重子查询：

```sql
select duty_dates.duty_seq, duty_dates.duty_date
from (
  select distinct on (s.pairing_id, s.duty_seq)
    s.duty_seq,
    (coalesce(s.duty_sch_str_dt_utc, s.brief_start_utc, s.sch_str_dt_utc) at time zone 'UTC')::date as duty_date
  from <live_schema>.pairing_segment s
  where s.pairing_id = p.id
    and s.is_deleted = 0
  order by s.pairing_id, s.duty_seq, s.seg_seq
) duty_dates
```

`In` 条件：

```sql
duty_dates.duty_date = any($dates::date[])
or extract(isodow from duty_dates.duty_date) = any($dow::int[])
```

`Between` 条件：

```sql
duty_dates.duty_date between $from::date and $to::date
```

`Any`：

```sql
exists (
  <duty_dates_query>
  where <match_condition>
)
```

`Every`：

```sql
(
  exists (<duty_dates_query>)
  and not exists (
    <duty_dates_query>
    where not (<match_condition>)
  )
)
```

`Avoid` 沿用当前 `wrapIntent`，即对正向条件取 `not (...)`。

## 非目标

- 不全局删除 `tag-list-date`，其他合法属性仍可使用。
- 不迁移历史旧数据。本项目仍在开发中，110 的旧 `tag-list-date` 直接拒绝。
- 不修改 `Departing On(propertyCode=106)`。
- 不修改 `Any/Every Layover On Date / Day(propertyCode=152)`，除非后续单独按旧库确认。

## 验收标准

- 110 弹窗选择 `In` 时，不再显示普通 tag 输入 + 单独日期输入。
- 110 弹窗选择 `In` 时，可以添加多个日期，也可以点选多个星期几。
- 110 弹窗选择 `Between` 时，只显示 from/to 日期范围。
- 保存 110 时必须选择 mode，必须有 quantifier，且 bid 值完整。
- 后端拒绝 110 的旧 `tag-list-date` payload。
- Search Pairings / Current Rules 能按 duty date / DOW 正确过滤。
- `Any` / `Every` 均按 duty 维度去重，不按 segment 重复计算。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次改动集中在一个 property 的 contract、控件映射、route 校验、SQL 和测试，文件虽跨前后端，但逻辑链路强耦合，单 agent 连贯处理更稳。
- Suggested split: 不建议拆分。
- Write boundaries: 若拆分，前端和后端会同时依赖同一个 bid contract，集成风险高。
- Conflict risk: Medium，当前 PBS Pairing 相关文件已有多处未提交改动，拆分容易冲突。
- Execution gate: 仅在用户确认本 spec 后进入实施。

## 待确认

以上是我对 `Any/Every Duty On Date / Day(propertyCode=110)` 的理解和建议方案。请确认后我再实施。
