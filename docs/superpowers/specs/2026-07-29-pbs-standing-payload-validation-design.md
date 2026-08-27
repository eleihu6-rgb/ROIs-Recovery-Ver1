# PBS Standing Bid 独立 Payload 校验设计

## 背景

Standing Bid 页面已经按业务规则去除具体年月日，但保存接口仍直接复用 Current Bid 的
`pairingBidValueSchema`。因此部分合法 Standing payload 在进入 service 和数据库事务前就被
Zod 拒绝，并统一返回 `400 Invalid Standing Bid payload.`。

已确认这不是 migration 问题：

- `f8_pbs.pbs_bid_property_context` 已存在，351 条上下文配置、37 条可见配置；
- `f8_sit_pbs.pbs_bid_property_context` 已存在，351 条上下文配置、37 条可见配置；
- `f8_uat_pbs.pbs_bid_property_context` 已存在，351 条上下文配置、37 条可见配置；
- 员工 19 的现有 `Prefer Off` 原值更新成功，Standing 数据库写入链路可用。

当前至少存在两个确定的合同缺口：

1. `204 Long Stretch Off / Compressed Flying` 在 Standing 中合法使用空 `from` / `to`，
   代表不绑定具体日期；Current schema 却要求两个字段都是非空字符串。
2. `427 Reserve Avoidance` 使用
   `{ type: "reserve-avoidance", mode: "if_possible" | "no_matter_what" }`，但 Standing
   路由使用的 schema 没有纳入该类型。

## 目标

1. Standing 保存接口使用明确的 Standing payload schema。
2. 接受无具体年月日的合法 Standing 条件。
3. 继续拒绝任何真正绑定具体年月日的 Standing 条件。
4. `Reserve Avoidance` 在 Standing 中可以正常新增、编辑和保存。
5. 数据库上下文可见性继续完全由 `pbs_bid_property_context` 控制。
6. Current Bid、Days Off、Pairing、Roster、Reserve 现有保存行为不发生变化。

## 非目标

- 不修改数据库 schema、seed 或 migration。
- 不修改任何条件的显示/隐藏配置。
- 不改变 Standing 与 Current 的数据隔离。
- 不增加前端假日期或兼容性占位值。
- 不借本次修复重构无关的 route、service 或表单代码。

## 方案比较

### 方案 A：Standing 专用 schema（采用）

新增或组合 `standingBidValueSchema`：

- 复用现有公共 bid value schemas；
- 为 Standing 的可复用 `stepper-date-range` 提供无具体日期变体；
- 纳入 `reserve-avoidance`；
- 由 Standing service 继续执行“不得包含具体日期”的业务校验。

优点：

- Current 与 Standing 的合同边界清晰；
- 不放宽其他模块；
- schema 负责结构，service 负责 Standing 业务语义；
- 后续新增 Standing 条件时可以集中做合同覆盖测试。

### 方案 B：放宽共享 Current schema（拒绝）

直接允许所有 `stepper-date-range` 使用空日期。

问题：可能让 Current Bid 接受本应填写日期的无效 payload，扩大回归范围。

### 方案 C：前端填充假日期（拒绝）

页面提交固定日期或占位日期以通过 Current schema。

问题：污染数据含义，违反 Standing 不绑定具体年月日的业务规则。

## 设计

### 1. Schema 边界

Standing route 不再直接把完整的 `pairingBidValueSchema` 当作唯一校验入口，而改用专用
`standingBidValueSchema`。

专用 schema 必须：

- 接受所有 Standing 当前可见条件经表单完成配置后的合法结构；
- 接受 `204` 的无日期 reusable 结构；
- 接受 `427 reserve-avoidance` 的两个合法 mode；
- 不因为专用 schema 而允许 Current route 接受空日期。

单独导出 `reserveAvoidanceBidSchema`，但本次只把它组合进
`standingBidValueSchema`。不得直接把它加入被 Days Off、Pairing 和 Line 间接共用的
`ruleBidValueSchema`，避免无意扩大其他 route 的合同范围。

Current Line 427 是否也存在 route schema 缺口，作为独立问题记录；本次不修改 Current route。
若后续修复，应新增明确的 `lineBidValueSchema` 并单独补 Current Line 回归，而不是放宽
`ruleBidValueSchema`。

### 2. 业务校验

Zod route schema 只确认请求结构可解析。Standing service 继续作为业务规则最终防线：

- `date`、`date-range`、`stepper-date`、`stepper-range-date`、
  `time-date`、`time-range-date`、`tag-list-date` 等明确日期结构继续拒绝；
- `date-or-dow-list.dates` 必须为空；
- `stepper-date-range.from` / `to` 必须同时为空；
- 嵌套 date scope 只能使用 `whole_month`、`first_half`、`second_half`；
- 不在 route 中按数据库可见 property code 硬编码显示/隐藏。

### 3. 数据流

```text
Standing 表单
  -> PbsSaveStandingDraftRequest
  -> standingBidValueSchema（结构校验）
  -> Standing service（可复用、无具体日期业务校验）
  -> 数据库事务
```

Current Bid 仍走原有 Current schema 和 service，不经过 Standing 专用放宽规则。

### 4. 错误处理

- 合法 Standing payload 不再错误返回通用 400。
- 真实包含具体年月日的 Standing payload 仍返回明确的业务错误。
- 本次不扩大用户错误文案范围；route schema 的可观测性问题可在后续单独处理。

## 测试与验收

### 后端 route / service

1. `204` 无日期 Standing payload 通过 route 并进入 service。
2. `204` 仅 `from` 或仅 `to` 为空时被拒绝。
3. `204` 的 `from` / `to` 都是具体日期时可完成结构解析，但被 Standing service 拒绝。
4. `427` 的 `if_possible` 与 `no_matter_what` 均通过 route。
5. 其他显式日期类型仍被拒绝。
6. Current route 的现有日期要求不变。
7. 覆盖测试分别从 Standing service 得到 `StandingLineholder` 与 `StandingReserve` 的实际
   catalog 集合，为每个返回 property 按 `bid.type` 构造“表单已完成”的合法值，再通过真实
   PUT route schema。
8. 覆盖测试不得维护另一份可见 property code 清单；可见集合必须来自 service catalog，
   从而证明数据库新增可见条件但 route 无法保存时测试会失败。

### 前端与 E2E

1. Playwright 通过真实 Standing 页面新增并保存 Long Stretch Off。
2. Playwright 通过真实 Standing 页面新增并保存 Reserve Avoidance。
3. 保存后 Existing 行正常显示摘要、Tier、Edit 和 Delete。
4. 不依赖 mock-only 结果宣称完成。

### 验证命令

- `npm --prefix pbs-server test -- <focused standing route/service tests>`
- `npm --prefix pbs-server run build`
- `npm --prefix pbs-portal test -- <focused standing tests>`
- `npm run check:ui`（如前端测试或 UI 文件有改动）
- Standing Playwright focused spec
- `git diff --check`
- GitNexus `detect-changes`

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 修复集中在同一条 route schema、service 合同和同一组 E2E，严格顺序依赖且文件边界
  紧密；并行修改容易产生 schema/test 冲突。
- Suggested split: 主 agent 完成 schema、route/service 回归与 Playwright。
- Write boundaries: 不分拆写入范围。
- Conflict risk: 并行修改共享 route schema 的冲突风险高。
- Execution gate: 设计文档通过审查并由用户确认后实施。
