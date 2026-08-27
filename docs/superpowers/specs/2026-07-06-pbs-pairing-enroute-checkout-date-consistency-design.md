# PBS Pairing Enroute Check-In / Check-Out Date 条件一致性设计

## 背景

当前 PBS Portal 的 Pairing 条件里已经有 enroute 相关的时间条件：

- `Any/Every Enroute Check-In Time`
- `Any Enroute Check-Out Time`

用户希望补充对应的日期 / 星期条件，并且指出 `Check-In` 支持 `Any/Every`，但 `Check-Out` 只有 `Any`，在产品理解上不一致。这个不一致会让用户误以为 Check-Out 的业务能力弱于 Check-In，或者认为系统漏做了 `Every`。

本次目标是把 enroute check-in / check-out 条件做成一致的能力集合。

## 目标

1. 新增两个 Pairing 日期 / 星期条件：
   - `Any/Every Enroute Check-In Date / Day`
   - `Any/Every Enroute Check-Out Date / Day`
2. 将现有 `Any Enroute Check-Out Time` 升级为：
   - `Any/Every Enroute Check-Out Time`
3. 新增条件必须可以：
   - 在 Pairing 主页面的 `ADD PAIRING PROPERTIES` 中展示
   - 在 Search Pairings 条件页中展示和编辑
   - 保存到当前 pairing draft
   - 参与 Search Pairings 结果过滤
   - 参与现有 readable summary 展示
4. 不改变已有 `Any/Every Enroute Check-In Time` 的行为。

## 非目标

- 不新增 `Pairing Check-In Date / Day` 或 `Pairing Check-Out Date / Day`。
- 不修改 `Departure Date / Day`、`Any/Every Duty On Date / Day`、`Any/Every Layover On Date / Day` 的语义。
- 不重新设计 Pairing 条件卡片 UI。
- 不修改求解器算法语义；本次只补 Portal / pbs-server 对 property 的录入、校验、预览过滤和展示能力。

## 现状核查

当前系统已有能力：

- `date-or-dow-list` 和 `date-range` bid 类型已经存在。
- Portal 已有 Date / Day 控件，可以支持具体日期、星期、日期范围。
- pbs-server 已有 `buildDateOrDowPreviewCondition`，可以复用 `Any / Every` 的日期匹配逻辑。
- `Any/Every Enroute Check-In Time` 当前使用 enroute segment 的 `brief_start_utc`。
- `Any Enroute Check-Out Time` 当前使用 enroute segment 的 `debrief_end_utc`。

当前缺口：

- catalog / 数据库里没有 enroute check-in date/day 和 check-out date/day 的可见 property。
- `Any Enroute Check-Out Time` 的 catalog、数据库、校验只允许 `Any`。
- Search Pairings 的后端条件 builder 还没有 enroute date/day 的 SQL 条件。

## 方案对比

### 方案 A：只新增两个 Date / Day 条件，不改 Check-Out Time

优点：
- 改动最小。
- 风险最低。

缺点：
- `Check-In` 仍然是 `Any/Every`，`Check-Out` 仍然只有 `Any`，产品能力不一致。
- 新增的 `Check-Out Date / Day` 如果也只做 `Any`，用户仍会觉得不完整；如果做 `Any/Every`，又会和 `Check-Out Time` 不一致。

结论：不推荐。

### 方案 B：新增两个 Date / Day 条件，并把 Check-Out Time 升级为 Any/Every

优点：
- `Check-In` 和 `Check-Out` 在时间、日期两个维度都一致。
- 用户理解成本最低。
- 可以复用现有 `Any/Every` 日期条件 builder，避免前端硬编码。

缺点：
- 会改变 `Any Enroute Check-Out Time` 的可选 quantifier，需要更新 contract、seed / migration、后端校验和测试。

结论：推荐。

### 方案 C：保留旧名称，同时新增一个新的 Every-only Check-Out 条件

优点：
- 对旧 property 名称完全兼容。

缺点：
- catalog 会更乱，用户会看到多个相似条件。
- 不符合当前我们清理 Portal 条件体验的方向。

结论：不推荐。

## 推荐设计

采用方案 B。

### Property 定义

建议新增 property code：

- `166`：`Any/Every Enroute Check-In Date / Day`
- `167`：`Any/Every Enroute Check-Out Date / Day`

现有 property 调整：

- `126`：从 `Any Enroute Check-Out Time` 改为 `Any/Every Enroute Check-Out Time`
- `126` 的 `supportedQuantifiers` 从 `["any"]` 改为 `["any","every"]`
- `126` 的 `defaultQuantifier` 保持 `any`

新增两个 Date / Day 条件的默认 bid：

```ts
{
  type: "date-or-dow-list",
  dates: [],
  daysOfWeek: [],
}
```

支持 operator：

- `In`
- `Between`

支持 action：

- `award`
- `avoid`

支持 quantifier：

- `any`
- `every`

默认 quantifier：

- `any`

### 业务语义

`Any/Every Enroute Check-In Date / Day`：

- 数据来源：`pairing_segment.brief_start_utc`
- 范围：只看 `duty_seq > 1` 的 enroute duty。
- `Any`：至少一个 enroute check-in 日期 / 星期匹配。
- `Every`：所有 enroute check-in 日期 / 星期都匹配，且至少存在一个 enroute check-in。

`Any/Every Enroute Check-Out Date / Day`：

- 数据来源：`pairing_segment.debrief_end_utc`
- 范围：只看 `duty_seq > 1` 的 enroute duty。
- `Any`：至少一个 enroute check-out 日期 / 星期匹配。
- `Every`：所有 enroute check-out 日期 / 星期都匹配，且至少存在一个 enroute check-out。

时间口径沿用当前 pairing search 代码的既有口径：

- 使用 `(timestamp at time zone 'UTC')::date`
- 本次不单独引入机场本地时区换算，避免和现有 `Any/Every Enroute Check-In Time` / `Any Enroute Check-Out Time` 出现不同口径。

## 影响范围

### Contract

更新 `packages/contracts/pbs-pairing-bids.js`：

- 增加 `166 / 167`
- 更新 `126` 名称和 quantifier
- 如果 property usage map 需要显式登记，新增对应 usage

### 数据库

新增 migration：

- 插入或更新 `pbs_bid_property` 中 `166 / 167`
- 更新 `126` 的 `property_name`、`quantifier_options`、`validation_json`

同步更新 seed：

- `sql/seed/10-pbs-bid-property.sql`

脚本必须幂等，适合 SIT / UAT 重复执行。

### pbs-server

更新 pairing property validation：

- `126` 允许 `any / every`
- 新增 `166 / 167` 的 `date-or-dow-list` / `date-range` 校验
- 新增 `166 / 167` 日期范围校验

更新 pairing search condition builder：

- 对 `166` 使用 enroute `brief_start_utc` 的日期表达式
- 对 `167` 使用 enroute `debrief_end_utc` 的日期表达式
- 复用 `buildDateOrDowPreviewCondition`
- `166 / 167` 都支持 `Any / Every`

### pbs-portal

原则上不新增硬编码 UI：

- Pairing 主页面和 Search Pairings 都继续从后端可见 catalog 派生。
- Date / Day 控件复用现有实现。
- readable summary 复用现有 `date-or-dow-list` / `date-range` 格式化。

如 contract 测试或 catalog mapper 需要显式断言，补对应测试。

## 测试设计

### 自动化测试

pbs-server：

- `pairing-property-validation`：
  - `166 / 167` 接受 `date-or-dow-list`
  - `166 / 167` 接受 `date-range`
  - `166 / 167` 拒绝非日期 bid
  - `167` 接受 `every`
  - `126` 接受 `every`
- `pairing-search-condition-builder`：
  - `166 Any` 生成 exists 条件
  - `166 Every` 生成 exists + not exists 条件
  - `167 Any` 生成 exists 条件
  - `167 Every` 生成 exists + not exists 条件
- 路由测试：
  - 保存 `Any/Every Enroute Check-Out Time` with `every`
  - 保存 `Any/Every Enroute Check-In Date / Day`
  - 保存 `Any/Every Enroute Check-Out Date / Day`

pbs-portal：

- catalog 测试：
  - `126` 名称为 `Any/Every Enroute Check-Out Time`
  - `126` 支持 `["any","every"]`
  - `166 / 167` 存在且是 `date-or-dow-list`
- control 测试：
  - `166 / 167` 使用 Date / Day 控件
  - 支持切换 `Any / Every`

### QA 手工测试

新增 QA 文档：

- `docs/test-cases/pbs/pairing/2026-07-06-enroute-check-date-day-conditions.md`

覆盖：

1. Pairing 页面新增两个 Date / Day 条件可见。
2. `Any/Every Enroute Check-Out Time` 可切换 `Every`。
3. 新增 date/day 条件可以保存到 T1。
4. Search Pairings 中使用新增条件可以返回匹配结果。
5. 编辑已保存条件时，日期、星期、范围、Any/Every 状态能正确回显。

## 验收标准

- `ADD PAIRING PROPERTIES` 中能看到：
  - `Any/Every Enroute Check-In Date / Day`
  - `Any/Every Enroute Check-Out Date / Day`
  - `Any/Every Enroute Check-Out Time`
- `Any/Every Enroute Check-Out Time` 可以选择 `Every`，保存后不被后端拒绝。
- 新增两个 Date / Day 条件可以选择具体日期、星期、日期范围。
- Search Pairings 预览过滤不报 `Search preview is not supported yet`。
- Existing properties 和 Search Criteria 里 readable summary 正常显示，不出现原始 JSON。
- 自动化测试和 QA 文档同步更新。

## 风险与边界

- 这是 property catalog / DB / 后端校验 / 搜索 SQL 的契约改动，必须保持 property code 唯一。
- SIT / UAT 必须执行 migration，否则前端部署后 catalog 可能看不到新增 property，或者保存时报错。
- 当前 search 日期口径沿用 UTC。如果未来要按机场本地日期解释 enroute check-in / check-out，需要单独设计，不混入本次。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动跨 contract、DB、server、portal、tests，但核心是一个小契约闭环；拆分会增加 property code 和校验语义不一致风险。
- Suggested split: 不拆分，由一个实现链路串联完成。
- Write boundaries: contract → SQL migration/seed → pbs-server validation/search → pbs-portal tests → QA doc。
- Conflict risk: Medium，主要集中在 shared contract 和 pairing search builder。
- Execution gate: 本 spec 经用户确认后再开始实现。

