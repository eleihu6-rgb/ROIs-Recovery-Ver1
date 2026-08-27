# PBS Pairing 117「Any Leg Is Redeye」设计确认

## 背景

用户在 Pairing 条件配置中检查到 `Any Leg Is Redeye`，当前配置窗口只显示：

- `TIERS`
- `MODE`: `Award / Avoid`
- `BID`: `Enabled`

用户要求核对该条件是否正确。经旧库和当前代码核对后，结论是：前端控件形态基本正确，但后端 Pairing Search / Preview SQL 尚未实现 `propertyCode=117` 的实际筛选语义。

本设计只覆盖 Pairing property `117`，不扩展到其他夜航、疲劳、规则引擎或 Gantt 标签逻辑。

## 旧库对照

旧库文件：`init-docs/crew_bids_reference-2026-03-16-072929.xlsx` / 同名 `.md`

旧库 property `117`：

- 名称：`Any Leg Is Redeye`
- bid 类型：空，等价于 flag / enabled 类条件
- action：`award` / `avoid`
- quantifier：仅 `any`
- operator：空
- 示例语义：任意 leg 是 Redeye 时命中

因此当前页面中：

- `MODE` 显示 `Award / Avoid` 是正确的。
- 不显示 `Every` 是正确的，因为旧库只有 `Any`。
- 不显示 operator 是正确的，因为旧库没有额外 operator。
- `BID` 只显示 `Enabled` 是合理的，因为该条件不需要额外输入值。

## 当前实现问题

当前 contract / seed 中已定义 117：

- `packages/contracts/pbs-pairing-bids.js`
  - `propertyCode: 117`
  - `name: "Any Leg Is Redeye"`
  - `defaultBid: { type: "flag" }`
  - `supportedActions: ["award", "avoid"]`
  - `supportedQuantifiers: ["any"]`
- `sql/seed/10-pbs-bid-property.sql`
  - `validation_json: {"type":"flag"}`
  - tooltip：`Award/Avoid pairings with any redeye leg.`

但当前 `pbs-server/src/services/pairing-search/pairing-search-condition-builder.ts` 没有 `case 117`。

实际影响：

- 用户可以看到并配置该 property。
- 保存 flag bid 的 UI 形态没有明显问题。
- 但在 Search Pairings / preview 中使用该条件时，后端无法生成 SQL，可能返回：
  - `Search preview is not supported yet for Any Leg Is Redeye.`

## 数据库核对

当前可直接用于 Pairing leg 判断的表：

- `pairing_segment`
  - 一行表示一个 pairing leg / segment。
  - 有 `pairing_id`, `is_deleted`, `sch_str_dt_utc`, `sch_end_dt_utc`, `dep_arp`, `arv_arp`, `seg_assignment` 等字段。
  - 没有物理字段 `is_red_eye`。
- `airport`
  - 有 `airport`, `zone_id`, `utc_standard_offset`。
  - `zone_id` 是 IANA 时区，可用于把 UTC 时间转换成出发/到达机场本地时间。
- `flight`
  - 有航班计划/实际时间，但没有 `is_red_eye` 物理字段。
- `calc_result.calc_data`
  - schema 注释示例中出现过 `is_red_eye`，但当前 PBS Pairing Search 没有稳定依赖它。
  - 该数据可能不存在、未计算或过期，不适合作为本次 117 的第一实现来源。

结论：

- 本次不新增数据库字段，不依赖 `calc_result.calc_data`。
- 使用 `pairing_segment` 的计划起止时间和机场时区直接计算 Redeye。

## 业务语义

`Any Leg Is Redeye` 表达：

> 筛选出任意有效 leg 是 red-eye / overnight flight 的 Pairing。

本次确认的 Redeye 判定口径：

> 对单个有效 `pairing_segment`，按出发机场本地时区换算计划起飞时间，按到达机场本地时区换算计划到达时间；如果到达本地日期晚于出发本地日期，则该 leg 视为 Redeye。

示例：

- 本地 22:30 出发，本地次日 05:10 到达：命中 Redeye。
- 本地 08:00 出发，本地 11:00 到达：不命中 Redeye。
- UTC 跨日但本地日期未跨日：不命中 Redeye。
- 本地日期跨日但 UTC 未跨日：命中 Redeye。

## 设计方案

推荐方案：保持前端 flag 控件不变，补齐后端 117 SQL。

### 前端控制

- 117 的 bid 值继续保存为 `{ type: "flag" }`。
- 配置窗口继续显示 `Enabled`。
- 不新增输入框、下拉框、时间控件或 operator。
- `MODE` 继续只允许 `Award / Avoid`。
- `TIERS` 继续沿用 Pairing property 通用 tier 选择。

### 后端 SQL

在 `buildPreviewCondition` 中新增 `case 117`。

匹配对象：

- `p`: pairing 主表别名。
- `s`: `<liveSchema>.pairing_segment`。
- `dep_airport`: `<liveSchema>.airport` 或当前 live schema 可见的 airport 表。
- `arr_airport`: `<liveSchema>.airport` 或当前 live schema 可见的 airport 表。

有效 leg：

- `s.pairing_id = p.id`
- `s.is_deleted = 0`
- `s.sch_str_dt_utc` 和 `s.sch_end_dt_utc` 有值。
- `s.dep_arp` / `s.arv_arp` 能匹配 airport 时区。

Redeye 条件：

```sql
(s.sch_end_dt_utc at time zone arr_airport.zone_id)::date
  > (s.sch_str_dt_utc at time zone dep_airport.zone_id)::date
```

`Award` 语义：

- `exists` 至少一个有效 leg 满足 Redeye 条件。

`Avoid` 语义：

- 复用现有 `wrapIntent`，即 `not (exists (... Redeye ...))`。

### 时区缺失处理

如果 leg 的出发或到达机场无法匹配 `airport.zone_id`：

- 该 leg 不参与 Redeye 命中。
- 不因为单条脏数据让整个 preview 报错。

理由：

- 117 是筛选偏好条件，不是数据质量校验。
- Search / Preview 应尽量返回可用结果，数据质量问题应由独立数据校验处理。

## 可选方案与取舍

### 方案 A：推荐，基于 `pairing_segment + airport.zone_id` 计算本地跨夜

优点：

- 不需要 schema/migration。
- 与 Pairing leg 语义直接一致。
- 能正确处理 UTC 跨日和本地跨日不一致的情况。
- 不依赖规则引擎计算结果是否已生成。

缺点：

- 每次搜索需要 join airport 两次。
- 如果机场主数据缺少时区，该 leg 无法命中。

### 方案 B：使用 `calc_result.calc_data` 中的 `is_red_eye`

优点：

- 如果 calc_data 完整，语义可复用规则引擎结果。

缺点：

- 当前 PBS Search 没有稳定依赖 calc_result。
- calc_result 可能缺失、过期或不同步。
- 需要额外定义 pairing 与 calc_result 的取数策略。

### 方案 C：新增 `pairing_segment.is_red_eye` 或 `flight.is_red_eye`

优点：

- 查询性能最好，SQL 最简单。

缺点：

- 需要 schema、migration、回填和导入链路更新。
- 当前只是补齐一个旧库 flag 条件，改动过重。

推荐采用方案 A。

## 接受标准

- 117 配置窗口继续只显示 `Award / Avoid` 和 `Enabled`，不新增输入控件。
- `Award + Enabled` 能筛出任意有效 leg 本地到达日期晚于本地出发日期的 Pairing。
- `Avoid + Enabled` 能排除存在任意 Redeye leg 的 Pairing。
- 117 不显示 `Every`，不显示 operator。
- 117 的 Search Pairings / preview 不再返回 unsupported。
- airport 时区缺失的 leg 不命中 Redeye，但不导致整个请求失败。
- 不影响 116 Any Flight Number、114 Any Enroute Check-In Time、103 Pairing Check-In Time 等已有条件。

## 测试要求

自动化测试：

- `pbs-server`
  - `pairing-search-condition-builder.test.ts`
    - 覆盖 117 `Award` SQL：生成 `exists`，join airport，并比较本地到达日期和本地出发日期。
    - 覆盖 117 `Avoid` SQL：外层为 `not (...)`。
    - 覆盖 117 只接受 `flag` bid；非 flag bid 应返回不支持或校验失败。
  - `routes/pairing-bids.test.ts`
    - 覆盖 117 正常保存 flag bid。
    - 覆盖 117 拒绝非 flag bid。
    - 覆盖 117 拒绝非 `any` quantifier。
- `pbs-portal`
  - 现有 `PairingBidControl` flag 展示测试继续通过。
  - 如当前测试未覆盖 117，补一个 117 配置窗口测试，确认不显示 operator / Every，显示 `Enabled`。

回归验证：

- `npm --prefix pbs-server test -- pairing-search-condition-builder pairing-bids`
- `npm --prefix pbs-server run build`
- `npm --prefix pbs-portal test -- pairing-bid-control pairing-page`
- `npm --prefix pbs-portal run build`
- `npm --prefix pbs-portal run lint`
- `git diff --check`

人工 QA 文档：

- 新增或更新 `docs/test-cases/pbs/pairing/2026-05-26-pairing-any-leg-is-redeye.md`
- 覆盖：
  - 117 配置窗口控件形态。
  - Award Redeye。
  - Avoid Redeye。
  - 与其他 Pairing 条件组合时 preview 正常。
  - 没有 Redeye leg 的 pairing 不命中 Award。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次改动集中在单个 property 的 SQL、校验、前端回归测试和 QA 文档，拆分并行成本高于收益。
- Suggested split: 不建议拆分。由一个实现者顺序完成后端 SQL、校验、测试、必要的前端测试补充和 QA 文档。
- Write boundaries: 若必须并行，只建议一个只读 reviewer 检查 SQL 语义和测试覆盖，不建议多个 agent 同时写 pairing search 文件。
- Conflict risk: Medium。`pairing-search-condition-builder.ts` 和 `routes/pairing-bids.ts` 是近期高频改动文件，实施时需要避开无关重构。
- Execution gate: 用户确认本设计文档后再开始实现。

