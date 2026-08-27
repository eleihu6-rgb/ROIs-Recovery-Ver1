# PBS Pairing TAFB 控件与搜索 SQL 设计

## 背景

当前 `TAFB(propertyCode=113)` 在 `Configure Pairing Bid` 弹窗中显示为空白普通文本框，没有 operator，也没有 duration 格式约束。

核对旧库 `init-docs/crew_bids_reference-2026-03-16-072929.xlsx` 后确认：

- `id`: `113`
- `remastered_property`: `TAFB`
- `award_or_avoid`: `["award", "avoid"]`
- `any_or_every`: 空
- `operator`: `["<", ">", "Between"]`
- `validation_json`: `{"type": "duration", "format": "HHH:MM", "label": "TAFB", "label_from": "Min TAFB", "label_to": "Max TAFB"}`
- tooltip 示例包括：
  - `Award Pairings If TAFB > 012:00`
  - `Award Pairings If TAFB Between 070:00 And 090:00`
  - `Avoid Pairings If TAFB > 015:00`
  - `Avoid Pairings If Any Duty Legs > 2 legs If TAFB < 012:00`

旧数据样例包含：

- `> 020:00`
- `> 013:00`
- `< 010:35`
- `Between 070:00 And 090:00`

因此当前普通文本框不符合旧库定义。

## 语义

`TAFB` 表示 `Time Away From Base`，即 pairing 离基地总时长。

当前 live schema 已有字段：

```sql
pairing.tafb smallint not null -- 离基地时间 TAFB（分钟）
```

所以搜索 SQL 应直接使用 `p.tafb`，并将用户输入的 `HHH:MM` duration 转为分钟比较。

示例：

- `Award + > 020:00`: 偏好 TAFB 超过 20 小时的 pairing。
- `Avoid + > 015:00`: 避免 TAFB 超过 15 小时的 pairing。
- `Award + Between 070:00 and 090:00`: 偏好 TAFB 在 70 到 90 小时之间的 pairing。

## 推荐方案

### 方案 A：复用现有 `duration` / `duration-range`

将 113 从 `text` 改为：

- 单值：`{ type: "duration", value: "012:00", operator: ">" }`
- 范围：`{ type: "duration-range", from: "070:00", to: "090:00" }`

前端复用现有 duration 控件，后端复用 `buildDurationCompareClause`，SQL 表达式使用 `p.tafb::numeric`。

优点：

- 和旧库 `duration HHH:MM` 对齐。
- 和 `Pairing Total Credit`、`Average Daily Credit` 的控件体验一致。
- 不新增 bid 类型。

缺点：

- 现有 duration 控件 placeholder 是 `HH:MM`，但已支持三位小时。若要更贴近旧库，可后续把 113 的 label/placeholder 调成 `HHH:MM`。

### 方案 B：新增专属 `tafb-duration`

新增只给 TAFB 使用的 bid 类型。

优点：类型语义最明确。

缺点：前端、后端、序列化、测试都要增加新分支；收益不高。

推荐采用方案 A。

## 实现范围

确认后实施时应修改：

- `packages/contracts/pbs-pairing-bids.js`
  - `propertyCode=113` 默认 bid 从 `text` 改为 `duration`
  - `supportedOperators` 保持旧库定义：`["<", ">", "Between"]`
  - 不加入 `=`
- `pbs-portal`
  - 113 弹窗显示 operator + duration 控件
  - `Between` 显示两个 duration 输入
  - 空值 / 非法分钟值不能保存
- `pbs-server`
  - route 校验 113 只接受 `duration` / `duration-range`
  - search SQL 增加 113，使用 `p.tafb::numeric`
  - 拒绝旧 `text`，不兼容旧结构
- 测试
  - 前端控件测试
  - route 接收新结构、拒绝旧结构测试
  - search SQL 测试覆盖 `<`、`>`、`Between`、`Avoid`
  - 人工 QA 文档

## 非目标

- 不修改 `Maximum TAFB-Credit Ratio(propertyCode=138)`。
- 不修改数据库 schema。
- 不兼容 113 的旧自由文本 bid。
- 不全局删除 `text` bid 类型。

## 验收标准

- TAFB 弹窗不再显示普通空白文本框。
- TAFB 弹窗显示 `< / > / Between`，不显示 `=`。
- 输入 `020:00`、`070:00`、`090:00` 可保存。
- 输入非法值，例如 `010:75` 或空值，不能保存或后端拒绝。
- 后端拒绝 113 的旧 `text` payload。
- Search Pairings / Current Rules 能按 `p.tafb` 分钟正确过滤。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个 property，虽然跨 contract、portal、server、测试，但链路短且依赖同一个 bid shape，单 agent 串行更稳。
- Suggested split: 不建议拆分。
- Write boundaries: 若拆分，前后端会同时依赖 `propertyCode=113` 的 contract，容易产生中间态不一致。
- Conflict risk: Medium，当前 PBS Pairing 相关文件已有多处连续改动。
- Execution gate: 仅在用户确认本 spec 后进入实施。

## 待确认

以上是我对 `TAFB(propertyCode=113)` 的理解和建议方案。请确认后我再实施。
