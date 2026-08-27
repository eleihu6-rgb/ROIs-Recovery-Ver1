# PBS Pairing Any Enroute Check-In Time 控件与搜索 SQL 设计

## 背景

当前 `Any Enroute Check-In Time(propertyCode=114)` 弹窗显示为：

- `Mode`: `Award / Avoid`
- `Bid`: operator + time 输入
- operator 当前只有 `<`、`>`、`=`
- 没有 `Between`

核对旧库 `init-docs/crew_bids_reference-2026-03-16-072929.xlsx` 后确认：

- `id`: `114`
- `remastered_property`: `Any Enroute Check-In Time`
- `award_or_avoid`: `["award", "avoid"]`
- `any_or_every`: `["any"]`
- `operator`: `["<", "=", ">", "Between"]`
- `validation_json`: `{"type": "time_of_day", "format": "HH:MM", "label": "Check-In Time", "label_from": "From", "label_to": "To"}`
- tooltip 示例包括：
  - `Award Pairings If Any Enroute Check-In Time = 06:00`
  - `Award Pairings If Any Enroute Check-In Time > 09:00`
  - `Award Pairings If Any Enroute Check-In Time < 14:00`
  - `Avoid Pairings If Any Enroute Check-In Time Between 19:00 And 23:59`

因此当前 UI 缺少 `Between`。

同时当前后端 SQL 对 `=` 的处理也不正确：`propertyCode=114` 在 `pairing-search-time-conditions.ts` 中只识别 `<` / `>`，否则默认用 `>`，导致用户选择 `=` 时实际按 `>` 搜索。

## 语义

`Any Enroute Check-In Time` 表示：

> pairing 中除第一个 duty 外，任意一个 enroute duty 的 check-in time 是否命中条件。

其中：

- `Any` 是固定语义，不需要显示 `Every`。
- `Enroute` 表示 `duty_seq > 1`。
- check-in time 使用 `brief_start_utc` 的 UTC time。

示例：

- `Award + = 06:00`: 偏好存在某个中途 duty 在 06:00 check-in 的 pairing。
- `Avoid + > 14:00`: 避免存在某个中途 duty 在 14:00 后 check-in 的 pairing。
- `Avoid + Between 19:00 and 23:59`: 避免存在某个中途 duty check-in time 落在 19:00 到 23:59 的 pairing。

## 推荐方案

### 方案 A：复用现有 `time` / `time-range`

将 114 的 `supportedOperators` 补全为：

```js
["<", "=", ">", "Between"]
```

前端继续复用 `PairingBidControl` 的 time 控件。选择 `Between` 时，现有逻辑会转换为：

```js
{ type: "time-range", from: "19:00", to: "23:59" }
```

后端 `buildTimePreviewCondition` 对 114 支持：

- `time`: `<`、`=`、`>`
- `time-range`: `Between`

优点：

- 与旧库完全对齐。
- 不新增 bid 类型。
- 复用现有 time 控件和 `buildTimeCompareClause`。

缺点：

- 需要在后端为 enroute time 写一段专用 exists wrapper，因为普通 `buildTimeCompareClause` 只生成表达式比较，114 还需要 `exists + duty_seq > 1`。

推荐采用方案 A。

### 方案 B：保留 UI，只修后端 `=`

只修 `=` 搜索，不支持 `Between`。

优点：改动更小。

缺点：旧库明确支持 `Between`，UI 仍不完整。

不推荐。

## 实现范围

确认后实施时应修改：

- `packages/contracts/pbs-pairing-bids.js`
  - 114 `supportedOperators` 改为 `["<", "=", ">", "Between"]`
  - 保持 `supportedQuantifiers: ["any"]` 和 `defaultQuantifier: "any"`
- `pbs-server/src/services/pairing-search/pairing-search-time-conditions.ts`
  - 114 支持 `time` 与 `time-range`
  - `time` 使用实际 operator，不再把 `=` 变成 `>`
  - `time-range` 使用 `between`
  - SQL 保持 `exists`、`duty_seq > 1`
- 测试
  - 前端控件测试：114 显示 `Between`，切换后变成 `time-range`
  - 后端 SQL 测试：`=`、`>`、`Between`、`Avoid`
  - route 测试如现有 schema 已支持 `time-range`，只补必要覆盖
  - 人工 QA 文档

## 非目标

- 不显示 `Every`，因为旧库只有 `Any`。
- 不修改 `Pairing Check-In Time(propertyCode=103)`。
- 不修改 `Any Enroute Check-Out Time(propertyCode=126)`，除非后续单独确认。
- 不修改时间字段来源，仍使用 `brief_start_utc`。

## 验收标准

- 114 弹窗 operator 显示 `<`、`=`、`>`、`Between`。
- 选择 `Between` 后显示 from/to time 输入。
- `=` 在后端生成等值 SQL，不再被当成 `>`。
- `Between` 在后端生成 time range SQL。
- `Avoid` 对正向条件取反。
- SQL 保持只检查 `duty_seq > 1` 的 enroute duty。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个 property 的 contract、time SQL 和测试，范围小，单 agent 串行更稳。
- Suggested split: 不建议拆分。
- Write boundaries: 前后端共享同一个 `supportedOperators` 和 bid shape，拆分收益低。
- Conflict risk: Medium，当前 PBS Pairing 相关文件已有连续改动。
- Execution gate: 仅在用户确认本 spec 后进入实施。

## 待确认

以上是我对 `Any Enroute Check-In Time(propertyCode=114)` 的理解和建议方案。请确认后我再实施。
