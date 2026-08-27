# PBS Pairing 118「Any/Every Duty Duration」设计确认

## 背景

用户在 `Configure Pairing Bid` 弹窗中检查到 `Any/Every Duty Duration`，当前页面显示为：

- `MODE`: `Award / Avoid`
- `QUANTIFIER`: `Any / Every`
- `BID`: 空白普通输入框

该表现不符合旧库定义。`Any/Every Duty Duration` 是 duration 类条件，不是自由文本条件；同时旧库要求它有 operator：`>`、`<`、`Between`。

本设计只覆盖 Pairing property `118`，不扩展到 `Any/Every Layover Duration(119)`、`Any Duty On Time(120)` 或其他 duty / layover 类 property。

## 旧库对照

旧库文件：`init-docs/crew_bids_reference-2026-03-16-072929.xlsx` / 同名 `.md`

旧库 property `118`：

- 名称：`Any/Every Duty Duration`
- bid 类型：`duration`
- action：`award` / `avoid`
- quantifier：`any` / `every`
- operator：`>` / `<` / `Between`
- 不支持 `=`

`sql/seed/10-pbs-bid-property.sql` 中 legacy seed 也对齐旧库：

- `property_code = 118`
- `validation_json = {"type":"duration","format":"HH:MM","label":"Duty Duration"}`
- `operator_options = ["<",">","Between"]`
- `any_or_every = ["any","every"]`

因此当前页面中：

- 显示 `Award / Avoid` 是正确的。
- 显示 `Any / Every` 是正确的。
- `BID` 显示普通空白文本框是错误的。
- 缺少 operator 是错误的。
- 不应显示 `=` operator。

## 当前实现问题

当前 `packages/contracts/pbs-pairing-bids.js` 中 118 的配置为：

```ts
{
  propertyCode: 118,
  name: "Any/Every Duty Duration",
  defaultBid: { type: "text", value: "11:30" },
  supportedActions: ["award", "avoid"],
  supportedOperators: ["<", ">", "Between"],
  supportedQuantifiers: ["any", "every"],
  defaultQuantifier: "any",
}
```

问题：

- contract 的 `supportedOperators` 正确，但 `defaultBid` 错误地使用了 `text`，导致前端渲染普通输入框。
- `pbs-server/src/routes/pairing-bids.ts` 目前只对 105、109、113 做 duration 专项校验，没有校验 118。
- `pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts` 当前没有 `case 118`。
- Search Pairings / Current Rules preview 对 118 很可能无法正确生成 SQL，或者仍然把它当普通 text 处理失败。

## 数据库核对

当前 live schema 中 `pairing_segment` 是 duty / segment 合并宽表。同一 duty 的所有 segment 行冗余保存 duty 字段。

与 Duty Duration 直接相关的字段：

- `pairing_segment.duty_sch_duty_min`
  - 计划 duty 总时长，单位分钟。
- `pairing_segment.duty_act_duty_min`
  - 实际 duty 总时长，单位分钟。
- `pairing_segment.duty_seq`
  - pairing 内 duty 序号。
- `pairing_segment.is_deleted`
  - 软删除标记。

推荐本次使用：

```sql
coalesce(s.duty_sch_duty_min, s.duty_act_duty_min)
```

理由：

- PBS bid / preview 面向可选 pairing，核心应使用计划 pairing 属性。
- `duty_sch_duty_min` 是当前 schema 中最贴近 “Duty Duration” 的计划字段。
- 如果历史或导入数据缺少计划 duty duration，可回退到实际 duty duration，避免整条 duty 因字段缺失无法参与判断。
- 不新增数据库字段，不依赖规则引擎计算结果。

## 业务语义

`Any/Every Duty Duration` 表达：

> 根据 pairing 内每个 duty 的 duty duration，筛选满足时长条件的 Pairing。

示例：

- `Award + Any + > 11:30`
  - Pairing 中任意一个 duty duration 大于 11 小时 30 分，即命中。
- `Avoid + Any + > 11:30`
  - 避免存在任意 duty duration 大于 11 小时 30 分的 pairing。
- `Award + Every + < 10:00`
  - Pairing 中每一个 duty duration 都小于 10 小时，即命中。
- `Award + Any + Between 08:00 and 12:00`
  - Pairing 中任意一个 duty duration 落在 8 到 12 小时之间，即命中。
- `Award + Every + Between 08:00 and 12:00`
  - Pairing 中每一个 duty duration 都落在 8 到 12 小时之间，即命中。

## 设计方案

推荐方案：复用现有 `duration` / `duration-range` bid 类型，补齐 118 的前端默认值、后端校验和 SQL。

### 前端控制

118 的 bid 值改为：

```ts
{ type: "duration", value: "11:30", operator: ">" }
```

当 operator 为 `Between` 时：

```ts
{ type: "duration-range", from: "08:00", to: "12:00" }
```

弹窗表现：

- `MODE`: `Award / Avoid`
- `QUANTIFIER`: `Any / Every`
- operator：`<`、`>`、`Between`
- 单值 `BID`：duration 输入框，placeholder 为 `HH:MM`
- `Between`：两个 duration 输入框，`from` / `to`

保存完整性：

- 空值不能保存为有效 bid。
- 非法 duration 不能保存为有效 bid。
- 分钟必须为 `00-59`。
- 小时允许 1-3 位，支持 `8:00`、`08:00`、`112:30`。

### 后端校验

118 只允许：

- `bid.type = "duration"`
- `bid.type = "duration-range"`

118 不允许：

- `text`
- `time`
- `time-range`
- `stepper`
- `tag-list`

operator 规则：

- 单值 `duration` 只允许 `<` 或 `>`。
- 不允许 `=`。
- `Between` 应转换为 `duration-range`，后端接收 `duration-range`。
- `quantifier` 必须是 `any` 或 `every`。

错误文案建议：

- 非 duration：`Any/Every Duty Duration requires duration bid.`
- `=` operator：`Any/Every Duty Duration supports <, >, or Between only.`
- 非 Any/Every：`Any/Every Duty Duration requires Any or Every.`

### Pairing Search SQL

在 `buildPreviewCondition` 中新增 `case 118`。

先按 duty 聚合，避免同一 duty 的多个 segment 重复影响 `Every` 判断：

```sql
select duty_durations.duty_seq, duty_durations.duty_minutes
from (
  select distinct on (s.pairing_id, s.duty_seq)
    s.duty_seq,
    coalesce(s.duty_sch_duty_min, s.duty_act_duty_min)::numeric as duty_minutes
  from <liveSchema>.pairing_segment s
  where s.pairing_id = p.id
    and s.is_deleted = 0
  order by s.pairing_id, s.duty_seq, s.seg_seq
) duty_durations
where duty_durations.duty_minutes is not null
```

比较表达式：

- `duration`: 把 `HH:MM` 转成分钟后比较 `<` 或 `>`。
- `duration-range`: 把 `from` / `to` 转成分钟后比较 `between`。

`Any` 语义：

```sql
exists (
  <duty_durations_query>
  where <duration_compare>
)
```

`Every` 语义：

```sql
(
  exists (<duty_durations_query>)
  and not exists (
    <duty_durations_query>
    where not (<duration_compare>)
  )
)
```

`Avoid` 语义：

- 复用现有 `wrapIntent`，即对正向条件外层包 `not (...)`。

## 可选方案与取舍

### 方案 A：推荐，使用 `duration` / `duration-range` + `duty_sch_duty_min`

优点：

- 与旧库 `duration` 定义一致。
- 与当前已实现的 Total Credit / Average Daily Credit / TAFB duration 控件一致。
- 不新增 bid 类型。
- 不修改数据库 schema。
- 使用计划 duty duration，更贴合 PBS bidding / preview。

缺点：

- 如果导入数据没有 `duty_sch_duty_min`，需要回退到 `duty_act_duty_min`。

### 方案 B：继续使用 `text`，只在前端加 placeholder 和校验

优点：

- 改动最小。

缺点：

- 数据结构仍然把 duration 表达成普通文本。
- 后端难以明确识别 duration 语义。
- 后续汇总、preview、校验仍容易歧义。

不推荐。

### 方案 C：新增专属 `duty-duration` bid 类型

优点：

- 类型语义最细。

缺点：

- 需要新增前后端类型分支、序列化分支和测试分支。
- 当前已有通用 duration 类型，新增专属类型收益不高。

不推荐。

## 非目标

- 不修改 `Any/Every Layover Duration(propertyCode=119)`。
- 不修改 AA 文档中同名或相近隐藏 property。
- 不新增数据库字段。
- 不迁移历史数据。
- 不兼容 118 的旧 `text` bid。
- 不全局删除 `text` bid 类型。

## 接受标准

- 118 弹窗不再显示普通空白文本框。
- 118 弹窗显示 `< / > / Between`，不显示 `=`。
- 118 弹窗继续显示 `Any / Every`。
- `> 11:30`、`< 10:00`、`Between 08:00 and 12:00` 可以保存。
- 空值、`08:75`、`abc` 等非法 duration 不能保存或被后端拒绝。
- 后端拒绝 118 的旧 `{ type: "text" }` payload。
- Search Pairings / Current Rules preview 能按 duty duration 分钟正确过滤。
- `Avoid` 能正确排除命中 duty duration 条件的 pairing。

## 测试要求

自动化测试：

- `pbs-portal`
  - 118 配置窗口显示 operator + duration 控件。
  - operator 从 `>` / `<` 切到 `Between` 后变成 `duration-range`。
  - 118 不显示 `=`。
  - 非法 duration 不能作为 complete bid。
- `pbs-server`
  - route validation 接受 118 的 `duration` / `duration-range`。
  - route validation 拒绝 118 的 `text`。
  - route validation 拒绝 118 的 `=`。
  - route validation 拒绝 118 缺失或非法 quantifier。
  - pairing search SQL 覆盖：
    - `Any + >`
    - `Every + <`
    - `Any + Between`
    - `Avoid`
  - SQL 参数把 `11:30` 转为 `690`，`08:00` 转为 `480`，`12:00` 转为 `720`。

回归验证：

- `npm --prefix pbs-portal test -- pairing-bid-control pairing-bid-control-logic pairing-page`
- `npm --prefix pbs-server test -- pairing-search-condition-builder pairing-bids`
- `npm --prefix pbs-portal run build`
- `npm --prefix pbs-server run build`
- `npm --prefix pbs-portal run lint`
- `git diff --check`

人工 QA 文档：

- 新增 `docs/test-cases/pbs/pairing/2026-05-26-pairing-duty-duration-control.md`
- 覆盖：
  - 控件形态。
  - `Any` / `Every`。
  - `<` / `>` / `Between`。
  - `Award` / `Avoid`。
  - 非法 duration。
  - 与其他 Pairing 条件组合 preview。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次改动集中在单个 property，但依赖 contract 默认 bid、前端控件、后端校验、SQL builder 和测试一致，拆分并行容易造成 bid shape 不一致。
- Suggested split: 不建议拆分。
- Write boundaries: 由一个实现者顺序完成 contract、server validation、server SQL、portal regression test、QA 文档。
- Conflict risk: Medium。PBS Pairing 相关文件近期连续改动，尤其是 `pbs-pairing-bids.js`、`pairing-bids.ts`、`pairing-search-condition-builder.ts` 和 `pairing-bid-control.test.tsx`。
- Execution gate: 用户确认本设计文档后再开始实现。

