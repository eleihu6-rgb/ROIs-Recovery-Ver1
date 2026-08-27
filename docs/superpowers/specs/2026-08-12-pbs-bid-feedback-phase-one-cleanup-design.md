# PBS Bid Feedback 第一阶段清理与 Eligibility Unavailable 规格

## 1. 状态与决策

- 状态：待用户最终审阅批准后实施。
- 产品决策：第一阶段保留 Bid Feedback 的 Bid 展示与 Bid 冲突分析；正式 Eligibility 尚未接入 Rule Engine，因此所有 Award Pairing 统一显示 `Eligibility unavailable`。
- 架构决策：完整删除此前为 Feedback Team Rule 错误引入的 Scenario Publish Snapshot 链，不保留停用代码或停用数据库对象。
- 本规格取代以下错误方向文档：
  - `2026-08-11-pbs-bid-feedback-reference-parity-correction-design.md`；
  - `2026-08-11-pbs-bid-feedback-team-rule-source-correction-design.md`；
  - `2026-08-11-pbs-bid-feedback-team-rule-source-correction.md` 实施计划。
- 不改写已发布 Git 历史，不修改已执行的历史 migration；使用新的纠正 migration 删除实际数据库对象。

## 2. 背景与根因

参考项目的 Feedback 是 Scenario 测试页面中的求解前检查。它使用 Python 临时实现 `bid_eligibility.py`，手工判断 Rank、Base、Team Rule 和 Pre-assignment；它不是正式 Rule Engine，也不依赖 Scenario Run、Solver Result 或 Publish。

此前 ROIS 误把参考项目的 Scenario 数据容器理解为产品运行时必须读取的 Scenario 发布结果，于是增加了：

`TEAM_RULES_RESOLUTION.json → Live Publish Snapshot → roster_flight.snapshot_id → PBS Team Rule Snapshot Service`

Crew 提交 Bid 时通常尚未产生 Scenario，这条依赖与实际业务时点冲突。正式产品应由 PBS 将 Crew、Pairings 和必要上下文交给 Rule Engine 的 Eligibility 接口；在该接口完成前，PBS 不应自己复制法规逻辑，也不应通过未来的 Scenario Publish 倒推当前 Bid 的 Eligibility。

## 3. 第一阶段目标

1. 产出可以安全构建、测试和推送的 Bid Feedback 第一阶段版本。
2. 保留当前 Crew 的 Current/Standing Bids、Award/Avoid 聚合、Days Off、Calendar 和 Bid 自身冲突分析。
3. Award Pairing 的 Eligibility 始终为 unavailable，不显示误导性的通过或失败结论。
4. 删除 PBS、Engine、Live 和数据库中的 Feedback Scenario Snapshot 运行链路。
5. 保留 Solver 独立使用 Team Rule 的正确能力。
6. `/api/bid-feedback/current` 返回 200，真实环境每次响应小于 2 秒。

## 4. 非目标

- 第一阶段不实现正式 Rule Engine Eligibility API。
- 不用 Node、SQL 或 Python 重新手写一套完整法规检查器。
- 不检查 Rank、Base、Pre-assignment 或 Team Rule Eligibility。
- 不读取 Scenario、Scenario Parameter、Scenario Run、Scenario Result 或 Scenario Publish 数据来判断 Feedback。
- 不修改 Crew Bid 保存、提交、Award/Avoid 方向或 Solver 输入。
- 不删除 Solver 正常使用的 `TEAM_RULES.json` 生成与消费逻辑。
- 不修改任何数据库账号、角色或权限；禁止 `GRANT`、`REVOKE`、`ALTER ROLE`。
- 不处理工作区中与 Bid Feedback 无关的 dictionary/backfill 等修改。

## 5. 第一阶段产品行为

### 5.1 Bid 数据

Feedback 继续读取当前登录 Crew 的：

- Current Bid；
- 没有 Current Bid 时适用的 Standing Bid；
- Pairing Bids；
- Days Off Bids；
- Line/Reserve Bids 中当前冲突分析需要的数据。

Pairing Bid 继续按 Tier 权重计算净方向：

- 净分大于 0：Award；
- 净分小于 0：Avoid；
- 净分等于 0：Neutral，不进入 Award/Avoid 列表。

### 5.2 Bid 自身冲突

保留现有 Bid Conflict/Advisory 分析。它回答“Crew 是否提交了互相矛盾的诉求”，不回答法规 Eligibility。

冲突示例：

- 同一 Pairing 同时 Award 和 Avoid；
- Award Pairing 与请求 Days Off 重叠；
- Line/Reserve Bids 相互冲突。

### 5.3 Eligibility

第一阶段所有 Award Pairing 返回统一状态：

```text
status = unknown
checked = []
unavailable = [rule_engine]
reasons = []
```

约束：

- 不执行 Rank、Base、Pre-assignment、Team Rule 查询或判断；
- 不生成 `RANK_MISMATCH`、`BASE_MISMATCH`、`PREASSIGNMENT_OVERLAP` 或 `TEAM_RULE_CONFLICT`；
- unavailable 不能改变原始 Award/Avoid Bid 方向；
- Feedback 不阻止 Crew 保存或提交 Bid；
- `eligibilityLabel` 固定表达正式检查尚未开放，例如：
  `Eligibility checks will be available after Rule Engine integration.`

Avoid Pairing 和 Days Off 不适用 Pairing Eligibility，继续不展示 Eligibility 结论。

### 5.4 UI

Award Pairing：

- 不显示对号；
- 不显示叉号；
- 不显示绿色 PASS；
- 不显示红色 FAIL；
- 不使用浅红失败背景；
- 当前选中行仍使用浅蓝背景；
- 右侧显示中性 `Eligibility unavailable` 和 `N/A`；
- 说明文案明确“等待 Rule Engine Eligibility 集成”，不提 Scenario、Snapshot 或 Team Rule 未检查。

继续保留：

- Award/Avoid/Days Off Tab；
- Pairing/Base/Start/End/Days/Credit 表格；
- Rank/Base/Days/Credit/TAFB/Route 详情字段；
- Calendar；
- Period 过滤；
- Days Off 展示。

UI 必须使用可访问文本表达 unavailable，不能只依赖空图标或颜色。

## 6. API 与契约

保持现有路由：

- `GET /api/bid-feedback/current`；
- `GET /api/bid-feedback/current/conflicts`。

契约调整：

- `eligibility.status` 保留 `eligible | ineligible | unknown`，为未来 Rule Engine 接入保留兼容空间；
- `checked` 继续保留检查项类型，但第一阶段固定为空数组；
- `unavailable` 增加明确值 `rule_engine`，删除第一阶段运行时对 `team_rule` unavailable 的依赖；
- 第一阶段 Award Pairing 的 `eligibility` 不得为 `null`，必须明确返回 unknown；
- Avoid Pairing 的 `eligibility` 继续为 `null`。

清理误导字段的固定决策：

- `rawScore/rawDirection` 保留为 Bid 净方向计算结果；
- 从公开契约和 `/api/bid-feedback/current` 响应中删除 `eligibleScore/exportDirection`；
- 实施前的 GitNexus impact 必须确认消费者；若发现未识别的真实运行时消费者，立即停止并报告用户，不得静默改为保留字段；
- Crew Bid 的真实保存、编译、提交和后续 Award 数据链不使用这两个 Feedback 响应字段，必须保持原行为。

### 6.1 缓存切换

- 提升 Feedback 完整结果缓存 namespace/schema version，确保部署后绝不读取旧版含 `eligible/ineligible` 的缓存；
- 不复用 Snapshot identity；新缓存键只包含 Crew、Period、Draft version 和新的 Phase-one schema version；
- 不要求全库扫描删除 Redis key；版本化 namespace 自然淘汰旧缓存；
- 回归测试必须预置一个旧版本缓存结果（包含绿色 eligible 或红色 ineligible），再调用新版接口，断言旧缓存未被读取且响应统一为 unknown；
- Conflict-only 缓存若响应契约未变化可继续保留，但必须与完整 Feedback 缓存 namespace 分离。

## 7. 完整删除 Scenario Snapshot 链

### 7.1 PBS Server

删除：

- `team-rule-snapshot-service.ts`；
- 对应测试；
- `loadBidFeedbackTeamRuleSnapshot`；
- `evaluateBidFeedbackTeamRules`；
- snapshot identity 缓存键；
- Snapshot conflict/invalid 错误码；
- `pgPool/liveSchema` 仅为 Team Rule Snapshot 提供的 wiring；若它们同时服务已确认的 Feedback 性能路径，只删除 snapshot 用途，不破坏性能路径。

Feedback Pairing Search 不再请求 Eligibility facts，不加载 Crew Rank/Base，不查询 Pre-assignment，不产生相关 eligibility 列。只保留匹配 Bid 条件、返回 Pairing 展示字段所需的查询。

### 7.2 Live Server

删除：

- `scenario-publish-snapshot-service.ts`；
- Scenario Publish 中下载 Feedback manifest、创建 snapshot、传递 snapshot ID 的逻辑；
- `roster_flight.scenario_publish_snapshot_id` model 字段；
- Snapshot 专属测试与断言。

必须保留：

- Scenario 正常 Run/Publish；
- `roster_flight.request_source='SCENARIO'`；
- `roster_flight.request_id=scenario.id`；
- 与 Feedback snapshot 无关的发布行为。

### 7.3 Engine Server

删除：

- `TEAM_RULES_RESOLUTION.json` 生成；
- 对外下载 allowlist 中的该文件；
- 只为 Feedback Publish gate 服务的 resolution manifest 测试和说明。

必须保留：

- `resolve_team_rules_for_solver`；
- Solver 所需 `TEAM_RULES.json`；
- Scenario Run 时 Team Rule 正常进入 Solver 的能力。

自动化必须证明：删除 Feedback manifest 后，Solver `TEAM_RULES.json` 仍按原逻辑生成。

### 7.4 数据库 Schema

从权威 schema 删除：

- `scenario_roster_publish_snapshot` 表；
- `roster_flight.scenario_publish_snapshot_id` 字段和 FK；
- Snapshot 专属 index；
- `pbs_bid_feedback_team_rule_source` View。

新增幂等纠正 migration，所有对象使用运行时目标 schema 限定，按依赖顺序执行：

1. `DROP VIEW IF EXISTS <schema>.pbs_bid_feedback_team_rule_source`；
2. `DROP INDEX IF EXISTS <schema>.<snapshot-only-index>`；
3. 查询/验证 `roster_flight.scenario_publish_snapshot_id` 上的 FK 依赖，使用确定的约束名或 `DROP COLUMN IF EXISTS ... CASCADE` 的受控等价方式删除，不允许因环境约束名漂移而半执行；
4. `ALTER TABLE <schema>.roster_flight DROP COLUMN IF EXISTS scenario_publish_snapshot_id`；
5. `DROP TABLE IF EXISTS <schema>.scenario_roster_publish_snapshot`。

要求：

- 不修改已经执行过的 `2026-08-10-scenario-publish-team-rule-snapshot.sql`；该文件属于迁移历史，必须保留；
- migration 不修改账号权限；
- migration 在事务内执行；
- 提供 preflight、fixture、verify 和回滚说明；
- 不在本地开发阶段直接执行 DEV/SIT/UAT 写操作；部署时由正常 migration 流程执行。

### 7.5 部署与回滚顺序

数据库对象删除与旧版 PBS/Live 不兼容，禁止普通滚动部署中“先跑 migration、旧实例仍在线”。SIT/UAT 使用受控两阶段切换：

1. 部署前执行只读 preflight，记录对象、依赖、snapshot 行数和当前版本；
2. 对 snapshot 表及相关对象定义创建受控备份/恢复点；
3. 先部署并确认新版 Engine/Live/PBS 代码已经不再读写 Snapshot；此时旧数据库对象暂时存在但无人使用；
4. 确认所有旧实例已经退出后，再通过正常 migration 工具执行纠正 migration；
5. 执行 verify、HTTP smoke、Scenario Publish smoke 和 PBS Playwright，确认后结束发布；
6. 禁止新旧实例混跑后立即删对象，也禁止只删对象但不部署新代码。

失败策略：

- migration 事务失败：自动回滚数据库事务，新代码仍不依赖旧对象，可继续运行并调查；
- migration 成功但应用 smoke 失败：优先前滚修复新代码；若必须回退旧二进制，须先按历史 schema 定义和备份恢复 View、字段、表及必要数据，再启动旧实例；
- SIT 完整演练并记录后，UAT 使用相同顺序，不在 UAT 临时改变部署方法。

## 8. 文档清理

删除本轮尚未提交且方向错误的 Spec/Plan：

- `2026-08-11-pbs-bid-feedback-reference-parity-correction-design.md`；
- `2026-08-11-pbs-bid-feedback-team-rule-source-correction-design.md`；
- `2026-08-11-pbs-bid-feedback-team-rule-source-correction.md`。

对已经进入 Git 历史的 Team Rule Snapshot 设计文档，不伪造历史；在本规格和相关长期文档中标记为 superseded。代码、schema 和实际数据库对象必须按本规格删除。

更新 PBS Bid Feedback 测试用例文档，明确第一阶段与未来 Rule Engine 阶段的边界。

## 9. 错误与性能

- Snapshot/View/Scenario 数据缺失不再能导致 `/api/bid-feedback/current` 500、409 或 422；运行时不再访问它们。
- Bid Feedback 数据加载失败使用现有持久错误状态和 Retry，不向用户显示原始异常。
- 每次请求不做 Eligibility SQL 和 Snapshot SQL，预期比当前路径更轻。
- SIT/UAT 对 `/api/bid-feedback/current` 至少采集 20 次真实请求，每次小于 2 秒，并记录 p50/p95/max。

## 10. 自动化与验收

### 10.1 后端

- Current Bid 和 Standing Bid 聚合不回归；
- Award/Avoid/Neutral 净方向不回归；
- Bid Conflict/Advisory 不回归；
- 所有 Award Pairing 返回 unknown + `rule_engine` unavailable；
- checked/reasons 均为空；
- Avoid Pairing eligibility 为 null；
- 不执行 Snapshot、Scenario、Rank/Base/Pre-assignment Eligibility 查询；
- Snapshot 缺失不影响接口；
- 构造 Rank 不匹配、Base 不匹配、Pre-assignment 重叠和原 Team Rule 会阻止的四类 Pairing，断言它们仍全部保留在 Award 列表，状态均为 unknown、checked/reasons 为空；
- 测试 spy/SQL contract 证明没有 Rank/Base/Pre-assignment/Team Rule Eligibility 查询或判断被调用，避免上游静默过滤；
- 预置旧版 eligible/ineligible 缓存，断言新版接口不读取旧 namespace；
- PBS Server 全量测试与 TypeScript build 通过。

### 10.2 Engine/Live/数据库

- Engine 聚焦 pytest 证明 `TEAM_RULES.json` 保留、`TEAM_RULES_RESOLUTION.json` 删除；
- Live Scenario Publish 测试通过且不创建 Snapshot；
- migration fixture/verify 通过；
- 远端 PostgreSQL 只读 preflight 记录对象状态；
- 部署后 verify 确认表、字段、View、index 已消失；
- 不改变数据库账号权限。

### 10.3 前端与 Playwright

真实 UI 必须验证：

- Award 列表正常加载；
- 所有 Award Pairing 没有对号、叉号、浅红背景；
- 选中行浅蓝；
- 右侧显示 `Eligibility unavailable / N/A`；
- 页面没有 PASS/FAIL；
- Avoid/Days Off/Calendar 正常；
- API 500 时显示可恢复错误状态，不能白屏。

运行 `npm run check:ui`，Hard violations 必须为 0。

## 11. 完成门槛

只有以下全部满足才可交给用户推送：

1. 工作区不存在半完成 Snapshot 或 Eligibility 代码；
2. Snapshot 运行链在 PBS、Live、Engine、schema 中删除；
3. 历史 migration 保留，新纠正 migration 可验证；
4. Feedback 第一阶段统一 unavailable，不出现误导性 PASS/FAIL；
5. Bid 展示、冲突、Days Off、Calendar 不回归；
6. PBS/Live/Engine 聚焦测试、相关全量测试、TypeScript build、UI gate 和 Playwright 通过；
7. 实施前记录 `git status`、staged diff、unstaged diff 和 untracked 文件 baseline；完成后分别审查“本任务增量”和“既有工作区修改”，证明无关文件与 hunk 未被改变；`git diff --check` 通过，GitNexus `detect_changes(compare main)` 的本任务影响流程符合预期；
8. 未经用户当轮明确授权，不 commit、不 push。

## 12. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: Snapshot 删除跨 PBS、Live、Engine 和 schema，但有严格顺序且与当前脏工作区重叠；多个实现代理会增加覆盖用户修改和契约漂移风险。
- Suggested split: 一个实施子代理负责精确修改；主代理只做 impact 审批、diff 审查、测试复跑和 Playwright 验收。
- Write boundaries: 实施子代理仅修改本规格列出的 Feedback/Snapshot 文件；主代理不直接写业务代码。
- Conflict risk: Medium；PBS Feedback、契约、UI、E2E 和 schema 已有用户修改，必须先建立 baseline 并逐 hunk 保留。“可推送”只表示本任务增量完整、无半成品，不代表擅自整理或删除工作区其他任务。
- Execution gate: 用户审阅并明确批准本 Spec 后才能实施。
