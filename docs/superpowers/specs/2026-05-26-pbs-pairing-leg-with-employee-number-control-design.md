# PBS Pairing 115「Any/Every Leg With Employee Number」设计确认

## 背景

用户在 Pairing 条件配置中检查到 `Any/Every Leg With Employee Number`，需要确认它的真实语义、当前实现是否正确，以及是否可以把员工号输入改成下拉搜索。

本设计只覆盖 Pairing property `115`，不全局修改其他 `crew_id` / Employee Number 类条件。

## 旧库对照

旧库文件：`init-docs/crew_bids_reference-2026-03-16-072929.xlsx` / 同名 `.md`

旧库 property `115`：

- 名称：`Any/Every Leg With Employee Number`
- bid 类型：`crew_id`
- action：仅 `award`
- quantifier：`any` / `every`
- operator：`In`
- 参数：`param_a = employee ID`
- 示例：
  - `Award Pairings If Any Leg With Employee Number 1032`
  - `Award Pairings If Every Leg With Employee Number 2539`
  - 历史数据中 `param_a` 可为逗号分隔多个值，例如 `1316,1330,1585,570,857`

## 当前数据库核对

当前项目库中：

- `f8.crew` 存在，约 798 条 crew 数据。
- `crew.crew_id` 有值，例如 `5510`, `5513`, `5515`。
- `crew.employee_no` 字段存在，但当前数据中为空，不能作为本条件的实际值来源。
- `f8.roster_flight` 有 `crew_id`, `pairing_id`, `flt_id`, `duty_seq`, `seg_seq`，可以表达某个 crew 是否出现在某个 pairing leg 上。
- `f8.roster_publish` 当前为空，不适合作为开发阶段这个条件的主要搜索来源。
- `pairing_segment` 只存 pairing / duty / leg 结构，不存 `crew_id`，因此 115 的后端 SQL 不能只查 `pairing_segment`。

结论：旧库 UI 文案中的 “Employee Number” 在本项目实现中应映射为 `crew.crew_id` / `roster_flight.crew_id`，不使用空的 `crew.employee_no`。

## 业务语义

`Any/Every Leg With Employee Number` 表达：

> 筛选出包含指定 crew 的 Pairing。检查粒度是 pairing 内的 leg。

具体解释：

- `Award + Any + [5510]`：只要 Pairing 内任意一个 leg 上有 crew `5510`，该 Pairing 符合。
- `Award + Every + [5510]`：Pairing 内每一个有效 leg 都必须有 crew `5510`，该 Pairing 才符合。
- `Award + Any + [5510, 5513]`：只要任意一个 leg 上有 `5510` 或 `5513`，该 Pairing 符合。
- `Award + Every + [5510, 5513]`：每一个有效 leg 上都至少有列表中的一个 crew，才符合。

有效 leg 应排除 `pairing_segment.is_deleted = 1` 的航段。

## 当前实现问题

当前 contract 中 `115` 已经大体符合旧库方向：

- `supportedActions: ["award"]`
- `supportedQuantifiers: ["any", "every"]`
- `defaultBid.type: "tag-list"`

但当前实现仍有缺口：

- UI 是普通 tag 输入，不是 crew 下拉搜索；用户需要知道并手输 crew id。
- 后端未发现 `propertyCode 115` 的 pairing search SQL 分支，因此条件保存后很可能不会真正按 leg crew 过滤。
- 因为 `employee_no` 为空，如果错误用 `employee_no` 查询，会导致实际数据无法命中。

## 设计方案

推荐方案：新增 crew 多选搜索控件，并将 115 后端过滤落到 `roster_flight.crew_id`。

### 前端控制

- 115 的 bid 值继续保存为列表结构，值为 `crew_id` 字符串数组。
- UI 从普通 tag 输入升级为 crew 多选搜索。
- 下拉展示建议格式：
  - `5510 - Peter Adams`
  - `5513 - Carolyn Alves`
- 实际保存值只保存 `crew_id`：
  - `["5510", "5513"]`
- 输入框文案可以继续使用 `Employee Number`，但实现说明中明确它对应旧库 `crew_id`。
- 保留手动输入/粘贴多个 crew id 的能力可以作为降级方案，但保存前需要按 crew id 去重和去空。

### 后端接口

新增或复用一个 PBS Server 只读 crew 搜索接口：

- 用途：给 PBS Portal 的 crew 多选控件提供候选项。
- 查询来源：`f8.crew`。
- 搜索字段：`crew_id`, `first_name`, `last_name`。
- 返回字段：
  - `crewId`
  - `displayName`
  - `firstName`
  - `lastName`
- 不返回敏感字段，不使用 `employee_no` 作为值。
- 结果数量应限制，例如默认最多 20 条，避免下拉搜索全量返回。

接口位置需遵循现有 PBS Server 分层：

- route 只负责参数校验和统一响应。
- 查询逻辑放在 service 中。
- 数据访问使用现有数据库连接模式，不在前端直连 live 数据库。

### Pairing Search SQL

115 的搜索条件应基于：

- pairing 主表：当前 pairing search 已有的 `pairing p`
- leg 表：`f8.pairing_segment s`
- crew assignment 表：`f8.roster_flight rf`

匹配关系：

- `rf.pairing_id = s.pairing_id`
- `rf.flt_id = s.flt_id`
- `rf.duty_seq = s.duty_seq`
- `rf.seg_seq = s.seg_seq`
- `rf.is_deleted = 0`
- `s.is_deleted = 0`
- `rf.crew_id in (<selected crew ids>)`

`Any` 语义：

- 存在至少一个有效 leg，且该 leg 有任一选中的 `crew_id`。

`Every` 语义：

- Pairing 至少存在一个有效 leg。
- 不存在任何一个有效 leg 没有匹配到选中 `crew_id`。

### 校验

- 115 只允许 `award`。
- 115 只允许 `any` / `every`。
- 115 只接受非空 crew id 列表。
- 不新增旧 `time` / `time-range` 等无关兼容逻辑。
- 不把 `employee_no` 作为持久化值。

## 可选方案与取舍

### 方案 A：推荐，crew 下拉搜索 + SQL 完整实现

优点：

- 符合旧库 `crew_id` 类型。
- 用户不用记员工号，体验更接近真实业务。
- 后端语义完整，保存后能真正过滤。

缺点：

- 需要新增一个只读搜索接口和对应测试。

### 方案 B：保留 tag 手输，只补后端 SQL

优点：

- 改动较小。

缺点：

- 用户仍要手输 crew id，容易输错。
- 和旧库 `crew_id` 控件体验不匹配。
- 后续其他 crew 类条件还要重复补控件。

### 方案 C：等待 `employee_no` 数据补齐后再做

优点：

- 表面上更贴近 “Employee Number” 文案。

缺点：

- 当前数据 `employee_no` 为空，开发无法验证。
- 旧库本身写的是 `crew_id`，等待 `employee_no` 反而会偏离现有可用数据。

推荐采用方案 A。

## 接受标准

- 115 页面上可以搜索并多选 crew。
- 下拉展示 `crew_id + 姓名`，保存值为 `crew_id`。
- `Award + Any` 能筛出至少一个 leg 上有指定 crew 的 Pairing。
- `Award + Every` 能筛出每个有效 leg 都有指定 crew 的 Pairing。
- 空 crew 列表不能保存为有效 bid。
- 115 不支持 Avoid，不支持其他 operator。
- 不影响其他 Pairing property。

## 测试要求

自动化测试：

- `pbs-portal`：
  - crew 搜索多选控件渲染、选择、删除、保存值测试。
  - 115 仍只显示 `Award` 和 `Any/Every`。
- `pbs-server`：
  - crew search route/service 测试。
  - 115 route validation 测试：拒绝空列表、拒绝非 award。
  - pairing search SQL 测试：覆盖 `Any` 和 `Every`。
- 合同/序列化：
  - 确认 115 的 bid value 保存/恢复为 `crew_id` 列表。

回归验证：

- `npm --prefix pbs-portal test -- pairing-bid-control pairing-bid-control-logic pairing-page`
- `npm --prefix pbs-server test -- --test-reporter=spec pbs-server/src/services/pairing-search/pairing-search-condition-builder.test.ts pbs-server/src/routes/pairing-bids.test.ts`
- `npm --prefix pbs-portal run build`
- `npm --prefix pbs-server run build`
- `git diff --check`

人工 QA 文档：

- 新增 `docs/test-cases/pbs/pairing/2026-05-26-pairing-leg-with-employee-number-control.md`
- 覆盖 crew 搜索、多选、Any、Every、空值校验和回归范围。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次改动虽然涉及前端、后端和测试，但范围集中在一个 property，核心风险在同一业务契约和 SQL 语义上。拆分给多个 agent 容易在 contract、控件值结构和后端校验之间产生不一致。
- Suggested split: 不建议拆分；由一个实现者顺序完成 contract、后端接口/SQL、前端控件、测试和 QA 文档。
- Write boundaries: 若后续必须并行，可拆为只读验证 agent 和主实现 agent；不建议多个 agent 同时写 pairing contract / route / search builder。
- Conflict risk: Medium。`packages/contracts/pbs-pairing-bids.js`、`pairing-bid-control.tsx`、`pairing-search-condition-builder.ts` 是多个 PBS pairing 条件共同编辑热点。
- Execution gate: 需要用户确认本 spec 后才进入实现。

## 待确认事项

请确认以下设计是否正确：

1. 115 的 “Employee Number” 在本项目中按旧库 `crew_id` 实现，不使用当前为空的 `employee_no`。
2. UI 改为 crew 多选搜索，展示 `crew_id + 姓名`，保存 `crew_id` 列表。
3. 后端 115 SQL 使用 `roster_flight.crew_id` 判断每个 pairing leg 上是否存在指定 crew。

Above is my understanding of the requirement/spec. Please confirm, and I will implement after your approval.
