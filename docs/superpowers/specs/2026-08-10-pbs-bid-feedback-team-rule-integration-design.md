# PBS Bid Feedback Team Rule 集成设计

## 1. 背景

参考产品的 Bid Feedback 会针对 Award Pairing 检查 Rank、Base、Team Rule 和
Pre-assignment。当前项目已经完成 Rank/Base 候选池和 Pre-assignment 检查，但把
Team Rule 固定标记为 `unavailable`，因此即使 Live Scenario 已配置 Team Rules，Portal
仍只能显示 `Team Rule was not checked.`。

当前系统并不是没有 Scenario。真实业务链路已经存在：

1. Live 创建并运行 Scenario；
2. Team Rules 存储在 `live.scenario_parameter` 的 `code='team_rules'` 行；
3. Scenario 执行 `Publish Roster` 导回 Live 时，现有代码写入：
   - `live.roster_flight.request_source = 'SCENARIO'`；
   - `live.roster_flight.request_id = scenario.id`；
4. 该链路可以反查来源 Scenario，但还不能区分同一 Scenario 的具体 run/version，也没有保存
   算法当次实际使用的 resolved `TEAM_RULES.json`；
5. 本设计补齐不可变发布快照，PBS 按该快照执行 Eligibility，禁止读取后来被修改的当前参数。

本设计修正 `2026-08-10-pbs-bid-feedback-design.md` 和
`2026-08-10-pbs-bid-feedback-scope-correction-design.md` 中“本项目没有稳定 Scenario
身份、Team Rule 始终不可用”的旧结论。旧设计的其他 Bid Feedback 规则保持不变。

## 2. 目标

- 从 Live 已有 Scenario 发布来源读取该次运行实际使用的 Team Rule 快照，不在 PBS Period
  重复配置。
- 在 `pbs-server` 中使用 TypeScript 实现与参考产品一致的 Team Rule Eligibility。
- 明确区分“已检查且通过”“已检查且不通过”和“没有来源 Scenario、无法检查”。
- 保持 Live 为 Scenario/Team Rule 唯一数据所有者，PBS 只读消费。
- 单次 Feedback 请求批量读取并计算，不产生 N+1，接口目标仍为 2 秒内响应。

## 3. 非目标

- 不直接导入、执行或调用参考项目的 Python 代码。
- 不在 `roster_period`、PBS Period 或 PBS Bid 中复制 `team_rules`。
- 不修改 Team Rule 编辑器、Solver 消费的 `TEAM_RULES.json` 格式或算法 CSV；仅补充一个
  engine-server 运行解析状态清单，消除“空规则”和“解析失败”无法区分的问题。
- 不改变 Scenario → Live 既有 `request_source/request_id` 语义；只增加精确 run/snapshot
  provenance。
- 不用“最新 Scenario”“更新时间最近的 Scenario”或日期相似度猜测来源。
- 不实现 mis-award 或最终 Award 预测。

## 4. 数据所有权、发布快照与跨模块读取契约

### 4.1 配置来源与发布事实

- Scenario 身份：`live.roster_flight.request_source='SCENARIO'` 时，
  `request_id` 为来源 `live.scenario.id`。
- 编辑配置：`live.scenario_parameter` 仍是 Scenario Team Rule 的配置来源。
- 运行事实：Engine 为该次 Scenario run 生成的 resolved `TEAM_RULES.json` 是 Solver 实际
  使用的规则，已完成 Team、Crew 和 Pairing scope 交集，属于本功能的权威 Eligibility
  输入。
- 发布事实：Scenario 执行 `Publish Roster` 时，Live 必须将当前结果对应的
  `scenario_id + task_id + version + roster_period_id + resolved team rules` 保存为不可变快照。

禁止 Feedback 直接读取可变的当前 `scenario_parameter`：Scenario 参数或模板以后可以修改，
但不能反向改变已经发布 run 的 Feedback 结果。

### 4.2 不可变发布快照

新增 Live 表，建议命名：

`scenario_roster_publish_snapshot`

至少保存：

- `id`
- `scenario_id`
- `scenario_task_id`
- `scenario_version`
- `roster_period_id`
- `scenario_start`
- `scenario_end`
- `resolved_team_rules`：该次 run 的 `TEAM_RULES.json.rules`；文件不存在代表空数组
- `team_rules_hash`
- 标准审计字段

`resolved_team_rules` 是运行/发布审计快照，不是第二份可编辑配置。它只在 Scenario
`Publish Roster` 时创建，之后不可更新；Team Rule 配置发生变化时，必须重新运行 Scenario
并重新发布，生成新的 snapshot。

Snapshot 增加唯一约束：

`(scenario_id, scenario_task_id, scenario_version, roster_period_id, team_rules_hash)`

同一 run 分批或重复执行 `Publish Roster` 时必须幂等复用同一个 snapshot，并把新导入的
roster rows 关联到该 snapshot；不得为同一 run 每次生成新 identity。只有 task/version/hash
不同才代表不同 snapshot identity。

Live `roster_flight` 新增 nullable `scenario_publish_snapshot_id`，Scenario 导回 Live 时写入
本次 snapshot ID，同时继续保留：

- `request_source='SCENARIO'`
- `request_id=scenario.id`

历史 roster row 没有 snapshot ID 时不尝试读取当前 Scenario 参数，Team Rule 明确为未检查。

### 4.3 Snapshot 生成规则

engine-server 为每次 run 额外生成不供 Solver 消费的
`TEAM_RULES_RESOLUTION.json`，固定结构为：

```json
{
  "status": "resolved",
  "rules": []
}
```

- `status='resolved'`：`rules` 必须存在，可以为空；
- `status='failed'`：不得携带可用 verdict，Live 禁止发布该 run；
- 不写原始异常、连接串或其他敏感诊断到该清单；详细错误仅进入受控服务端日志。

该清单不改变 Solver 的 `TEAM_RULES.json`：Solver 仍按现有文件消费规则；清单只明确记录
本次解析究竟成功为空、成功有规则还是失败。

Scenario `Publish Roster` 必须绑定当前已加载结果对应的 `task_id/version`，并从该次运行归档的
input package 读取 `TEAM_RULES_RESOLUTION.json`：

- `status='resolved'`：严格校验并保存其中的 `rules`，空数组表示该 run 确实没有有效 Team
  Rule，检查结果可为 PASS；
- 文件不存在、`status='failed'`、input package 无法读取、无法确认当前 loaded result 对应
  task/version，或 JSON 损坏：阻止
  `Publish Roster`，返回产品化错误；不得回退到当前 `scenario_parameter`。

Snapshot 中的 `roster_period_id` 必须由 Live `roster_period` 唯一解析，且 Scenario 日期范围
必须完整覆盖该 Roster Period。仅部分重叠、匹配不到或匹配多个 Period 都阻止发布，禁止把
`only_do` 规则扩散到 Scenario 范围外。

### 4.4 只读 View

新增 Live 所有的只读 View，建议命名：

`f8.pbs_bid_feedback_team_rule_source`

View 只暴露 PBS Team Rule 检查所需的不可变发布事实：

- `snapshot_id`
- `scenario_id`
- `roster_period_id`
- `scenario_start`
- `scenario_end`
- `team_rules_hash`
- `resolved_team_rules`

View 不暴露 Scenario 文件路径、Task ID、算法文件、其他参数或无关内部字段。通过
migration 仅向 PBS 服务数据库角色授予该 View 的 `SELECT` 权限，不向 PBS 角色开放
整张 `scenario` / `scenario_parameter` 表。

采用 View 而不是新增 Live HTTP 调用，原因是：

- `pbs-server` 当前已经通过受限数据库角色读取 Live 权威业务表；
- 不需要新增 Live URL、服务凭证或网络故障路径；
- 保持 PBS 与 Live Server 运行时服务解耦；
- View 形成最小权限、可审计的跨模块只读契约。

## 5. 来源 Snapshot 解析

针对当前认证 Crew 和 Current Bid Period：

1. 读取该 Crew 在 Current Bid Period 内、`is_deleted=0`、
   `request_source='SCENARIO'`、`scenario_publish_snapshot_id is not null` 的 Live roster rows；
2. 聚合唯一 snapshot identity；同一 snapshot 的多条航段不得形成多份来源；
3. 使用只读 View 校验 snapshot 的 `roster_period_id` 与 Current Bid Period 完全一致；
4. 读取 snapshot 中的 resolved Team Rules；
5. 禁止读取没有被该 Crew Live roster provenance 引用的 snapshot。

解析结果固定为：

- **0 个 Snapshot**：合法的“尚无可审计 Scenario 发布来源”状态；Team Rule 不执行，capability
  返回 `unavailable`。
- **1 个 Snapshot identity**：读取并执行该 run 的 resolved Team Rules；capability 返回
  `available`。
- **多于 1 个不同 Snapshot identity**：发布来源不唯一，完整 Feedback 返回稳定的 `409
  BID_FEEDBACK_SCENARIO_AMBIGUOUS`，不得选最新记录或合并不同 Scenario 的规则。

同一 snapshot ID 被多次分批发布引用仍计为 1 个 identity，不属于歧义。
- **snapshot ID 无对应 View 行、Period 不一致或 provenance 断裂**：返回稳定的 `422
  BID_FEEDBACK_SCENARIO_SOURCE_INVALID`。

当前开发库尚未存在 `request_source='SCENARIO'` 的有效 roster rows，因此开发数据下预期
仍显示 `Team Rule was not checked.`；需要通过真实 Scenario → Publish Roster 流程生成
验收数据，不得手工伪造“最新 Scenario”绑定。

## 6. Team Rule Eligibility 语义

在 `pbs-server` 中将参考项目规则重新实现为 TypeScript，不引用 Python 运行时。

### 6.1 适用 Team

Snapshot 已保存与 Solver 相同的 resolved rule 列表。只处理同时满足以下条件的规则：

- 当前 Crew ID 位于规则的 `crew_ids`；
- `mode` 为 `only_do` 或 `not_do`。

disabled rule、无效 Team、以及不属于本次 Scenario 实际 Crew/Pairing scope 的 ID 已由
该次 run 的 resolver 排除，PBS 不重新解释原始配置。当前 Crew 没有任何适用 Team Rule 时仍属于
“已检查并通过”，不是 `unavailable`。

### 6.2 `not_do`

当候选 Pairing ID 位于规则的 `pairing_ids` 中时，该 Pairing 为 `ineligible`。

原因代码：`TEAM_RULE_NOT_DO`

### 6.3 `only_do`

当候选 Pairing ID 不在规则的 `pairing_ids` 中时，该 Pairing 为 `ineligible`。

原因代码：`TEAM_RULE_ONLY_DO`

### 6.4 Pairing 身份

Snapshot 来自该次 run 的 resolved `TEAM_RULES.json`。Scenario 的 `Publish Roster` 仅支持
引用 Live Pairing 的 RO Scenario；其中 `pairing_ids` 与 PBS Feedback 使用的 Live
`pairing.id` 直接比较，不通过 Pairing Label、Flight Number 或日期进行模糊映射。

若后续允许非 Live Pairing Scenario 发布，必须另行设计明确 ID 映射；本功能不得提前做
兼容猜测。

### 6.5 多规则结果

同一 Pairing 可违反多条适用规则。服务端返回全部去重后的结构化原因，顺序按 Live
Team Rule 原始顺序保持稳定；不得只返回第一条或拼接不可解析的自由文本。

## 7. API Contract 调整

`FeedbackEligibility` 调整为：

```ts
type FeedbackEligibility = {
  status: "eligible" | "ineligible" | "unknown";
  checked: Array<"rank" | "base" | "team_rule" | "preassignment">;
  unavailable: Array<"team_rule">;
  reasons: Array<{
    code:
      | "RANK_MISMATCH"
      | "BASE_MISMATCH"
      | "TEAM_RULE_NOT_DO"
      | "TEAM_RULE_ONLY_DO"
      | "PREASSIGNMENT_OVERLAP"
      | "FACTS_MISSING";
    message: string;
    ruleId?: string;
    ruleName?: string;
    conflict?: {
      assignment: string;
      label: string;
      startLocal: string;
      endLocal: string;
    };
  }>;
};
```

完整响应保留：

```ts
capabilities: {
  teamRuleEligibility: "available" | "unavailable";
  tierWeightVersion: string;
}
```

不向 Portal 暴露 Scenario 文件路径、数据库错误或原始 `param_val`。

## 8. Portal 展示

右侧 Eligibility 文案对齐参考产品：

- 全部可用检查通过且 Team Rule 已检查：绿色 `PASS`，显示
  `Right rank and base, no team rule against it, and no clash with a pre-assignment.`
- 其他检查通过但没有来源 Scenario：不显示完整 PASS 文案，显示：
  - `No issues were found by the available checks.`
  - `Team Rule was not checked.`
- Team Rule 不通过：红色 `Not eligible`，逐条显示规则名称和结构化原因。
- Team Rule 已执行但当前 Crew 没有适用规则：按“已检查并通过”展示，不显示
  `Team Rule was not checked.`。

状态不能只依赖颜色；PASS、Not eligible 和未检查说明必须有可访问文本。

## 9. 缓存与性能

- 每次完整 Feedback 最多批量解析一次来源 Snapshot、读取一次 resolved Team Rules；禁止按
  Pairing 查询 Snapshot 或规则。
- Team Rules 在内存中预编译为 Crew 适用规则和 Pairing ID Set，计算复杂度为规则数加
  候选 Pairing 数。
- Feedback Redis key/version 增加 `snapshotId + teamRulesHash`。
- 新 run 重新发布并形成新 snapshot 后不得命中旧 Eligibility 缓存；只修改尚未运行/发布的
  Scenario 参数不会改变现有 Feedback。
- 现有 Conflict 摘要接口不执行 Team Rule 明细检查，不阻塞 Bid 页面首屏。
- 完整 Feedback 继续只在用户点击 `FEEDBACK` 后加载，目标响应时间小于 2 秒。

## 10. 错误处理

- 无来源 Snapshot：不是系统错误，Team Rule capability 为 `unavailable`。
- 多来源 Snapshot：`409 BID_FEEDBACK_SCENARIO_AMBIGUOUS`。
- 无效来源 Snapshot：`422 BID_FEEDBACK_SCENARIO_SOURCE_INVALID`。
- Team Rule JSON 不符合既有结构：`422 BID_FEEDBACK_TEAM_RULES_INVALID`。
- 数据库错误：保留统一 `500 BID_FEEDBACK_FAILED` 和清洗后的 request ID；不得暴露 SQL、
  stack 或数据库角色信息。

上述 409/422 在 Bid Feedback 弹窗内使用持久错误状态和可重试操作，不连续发送重复
toast。

## 11. Source-of-Truth 迁移审计

- 旧行为：PBS 固定返回 `teamRuleEligibility='unavailable'`。
- 新行为：Live Scenario 发布 provenance + 该 run 的不可变 resolved Team Rule snapshot 为唯一来源。
- 旧行为仅在“0 个来源 Snapshot”时保留，不得覆盖已解析到的 Live Team Rule snapshot。
- 当缓存中的旧 capability 与新 Live 来源冲突时，新来源获胜，旧缓存因版本升级失效。

需要核查的下游路径：

- Live Scenario Team Rule 编辑、运行解析与 `TEAM_RULES.json`；
- Live Scenario input package / version / task provenance；
- Scenario → Live `Publish Roster` provenance；
- PBS Bid Feedback service / Eligibility / response mapper；
- PBS Portal Eligibility 列表与详情；
- Redis key/version 与失效；
- Bid Feedback 后端、组件、Playwright 和 QA 测试。

保持不变的路径：

- PBS Engine 输入包；
- `PAIRING_SCORE.csv` / `DAYSOFF.csv`；
- Award 发布与 `roster_publish`；
- Current Bid、Standing Bid 保存格式。

冲突回归必须构造：当前 `scenario_parameter` 已被修改，但已发布 snapshot 保留旧 run 的规则；
断言 Feedback 使用 snapshot，并返回对应 `TEAM_RULE_NOT_DO` 或 `TEAM_RULE_ONLY_DO`，当前
可变配置不能覆盖发布事实。

## 12. 测试与验收

### 12.1 Live / 数据契约

- migration 创建 snapshot 表、roster provenance 字段和只读 View，并只授予 PBS 服务角色
  所需的 View `SELECT`。
- View 不暴露 Team Rule 之外的 Scenario 参数。
- Scenario → Live publish 回归确认 `request_source='SCENARIO'`、
  `request_id=scenario.id` 和 `scenario_publish_snapshot_id`。
- current parameter 与 run snapshot 冲突时，snapshot 获胜。
- Scenario 仅部分覆盖 Roster Period 时阻止发布。
- `TEAM_RULES_RESOLUTION.json` 覆盖 resolved-empty、resolved-non-empty 和 failed；缺失或 failed
  均阻止 Publish Roster。
- 同一 run 分批发布复用同一个 snapshot；唯一约束和幂等回归通过。

### 12.2 PBS 后端

- 0/1/多个来源 Snapshot 三种解析结果正确。
- 不读取其他 Crew 未引用的 Snapshot。
- `only_do`、`not_do`、disabled rule、无效 team、Crew 不在 Team、多规则冲突均有 fixture。
- Pairing 使用 ID 精确匹配，不使用 Label 猜测。
- 规则已读取但 Crew 无适用规则时标记为 checked/pass。
- Team Rule JSON 损坏返回稳定 422，不伪装未检查或通过。
- 单次请求无 N+1；500 Pairing fixture 达到 2 秒目标。
- Redis key 包含 snapshot ID/hash；新 run 重新发布后不命中旧结果。
- 与 Engine resolved `TEAM_RULES.json` 使用同一 fixture 的 parity 测试通过。

### 12.3 Portal / Playwright

- 有来源 Scenario且通过时显示绿色 PASS 和参考产品文案。
- 无来源 Scenario 时显示 `No issues were found by the available checks.` 和
  `Team Rule was not checked.`。
- `only_do` / `not_do` 冲突显示红叉、Not eligible 和规则名称。
- 多来源/无效来源显示持久错误状态和 Retry，不暴露原始后端异常。
- Playwright 驱动真实 Bid 页面打开 Feedback、选择 Pairing 并验证三种状态。

### 12.4 人工验收数据

1. 在 Live 创建一个完整覆盖目标 Roster Period 的 RO Scenario；
2. 配置一个 Team，将测试 Crew 加入 `crew_ids`；
3. 添加 `not_do` 或 `only_do` 规则；
4. 运行 Scenario，并通过 `Publish Roster` 导回 Live；
5. 在 PBS 使用同一 Crew 打开 Bid Feedback；
6. 验证规则命中的 Pairing 为 Not eligible，未命中的 Pairing按规则语义通过；
7. 只修改 Team Rule、不重新运行发布，确认旧 snapshot 结果保持不变；
8. 重新运行并再次发布，确认新 snapshot 生效且旧 Redis 结果不再出现。

## 13. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: Live snapshot、来源解析、Eligibility contract 和缓存版本紧密耦合，单链路实施更容易保证来源唯一性与错误语义。
- Suggested split: 不拆分；依次完成数据契约、PBS 后端、Portal、自动化与 QA。
- Write boundaries: `engine-server` 仅增加 Team Rule resolution manifest；`live-server` 与
  `sql/migration` 负责不可变 publish snapshot；`pbs-server`/`pbs-portal` 负责 Feedback
  Eligibility 与展示；并更新对应测试和 QA 文档。
- Conflict risk: High；主要风险是把可变 Scenario 参数误当成历史 run 快照，或把部分周期规则
  应用到整个 Period。
- Execution gate: 用户审阅并明确批准本 spec 后，才编写实施计划和修改业务代码。

## 14. 验收结论

完成后，Bid Feedback 不再无条件声称 Team Rule 未检查。只要 Live 已通过真实
Scenario → Publish Roster 链路形成唯一不可变 run snapshot，PBS 就使用该 run 的权威 Team Rules
执行资格判断；没有来源时诚实显示未检查，来源冲突时明确报错，绝不猜测。
