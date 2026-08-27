# Legality Preview Service 设计讨论稿（2026-07-28）

## 背景

本轮问题来自 Live Gantt 手工分配：在 SIT 环境中，用户给 Crew `13441` 在 `2026-07-13` 分配 DO `id=1008104`，该分配与已有 FLY pairing `13684` 重叠，按最新 Rust 法规检查应触发 `1001` 告警并阻止分配，但界面没有实时拦截。

排查后确认：手工 roster 变更路径中，部分操作仍使用旧的实时法规检查链路，或者没有触发 Rust 法规复查。当前短期修复已将 Live/Scenario 的保存后复查调整为基于最新 `ruleset_id` 调用 Rust 法规，而不是旧的 `ruleGroupCode` 或只检查单条 `1001`。

但这只是保存后复查。真正需要补齐的是：用户在 draft 状态下每一步未保存操作，都要基于当前界面/场景选定的法规集合实时执行法规检查，并在保存前提示或阻止非法操作。

## 目标

建立一个职责更完整的 `legality-preview-service`，或进一步抽象为独立 Legality Service，使所有 Live 和 Scenario 手工操作都通过同一套法规检查能力。

核心目标如下：

- 所有手工 roster 操作在 draft 阶段都能实时检查法规。
- 检查范围不是固定 `1001`，而是按当前 `ruleset_id` 下所有启用法规条目执行 Rust 法规检查。
- Preview 检查产生的新告警只返回给当前 user/session，不写入正式 `rule_violation`。
- 只有排班数据正式入库后，法规服务基于已入库事实生成、更新或删除正式告警。
- Live 与 Scenario 的法规检查数据宇宙必须隔离，不能混用数据。
- Scenario 的检查逻辑需要与 Live 的手工操作逻辑保持一致，但 Scenario 使用自身固定选择的 `scenario.ruleset_id`。

## 非目标

本设计不继续扩展旧 `ruleGroupCode` 模型，也不以旧 TypeScript Gantt rule check 作为目标链路。

本设计不把 Preview 告警直接写入正式告警表。Preview 告警属于用户会话临时结果，正式告警只能来自已提交排班事实。

本设计不要求前端自己拼完整法规输入。前端只应提交用户操作意图、draft 操作和必要上下文，完整有效排班数据应由法规服务侧组装。

## 当前短期修复状态

已完成的短期修复提交：`7acee82c fix: recheck selected Rust ruleset after roster edits`。

该提交的方向：

- Live Gantt roster mutation 会带上当前选择的 `ruleset_id`。
- Live 后端 mutation route 保存后调用 Rust live recheck，`ruleCodes = null`，表示检查该 ruleset 下全部法规。
- Live Alert Center 使用当前 `selectedId`，不再硬编码旧规则集。
- Scenario `patch-output` 保存后会标记 `scenario.legality_status` stale，并触发基于 Scenario `ruleset_id` 的 Rust 检查。
- Scenario 使用自身固定规则集，不使用 Live 当前界面选择的规则集。

该修复解决的是保存后复查一致性，不等价于完整 draft preview 架构。

## Live 数据模型

Live 的法规检查数据宇宙应基于正式入库的 Live roster facts，再叠加当前用户 session 的 draft overlay。

Live preview 检查输入应由以下来源组成：

- `CommittedLiveRosterSource`：正式入库的 Live roster、pairing、ground task、assignment 等排班事实。
- `DraftOverlaySource`：当前 user/session 的未保存操作，例如分配、移动、删除、swap、添加地面任务、删除 pairing 任务等。
- `ReferenceSource`：crew、base、fleet、qualification、airport、rule parameter、ruleset 等有效期相关基础数据。
- `RustRulesetSource`：当前界面选择的最新 `ruleset_id`，并展开为该 ruleset 下所有启用法规条目。

Live preview 的有效数据可以表达为：

```text
effective_live_roster = committed_live_roster + draft_overlay(user_id, session_id)
preview_violations = rust_check(effective_live_roster, ruleset_id)
```

其中 `preview_violations` 只返回给当前用户，不入库。

Live commit 后的正式检查可以表达为：

```text
committed_live_roster = save(effective_live_roster)
persisted_violations = rust_check(committed_live_roster, ruleset_id)
upsert/delete rule_violation
```

## Scenario 数据模型

Scenario 与 Live 不同，它是独立的数据维度。用户打开一个优化场景时，看到的是该 Scenario 自己的一套 roster 数据，而不是 Live 当前实时 roster。

Scenario 法规检查数据宇宙应由以下来源组成：

- `ScenarioRosterSource`：Scenario 加载范围内的 scenario roster/pairing/ground task/assignment 数据。
- `LiveHistorySource`：Scenario 加载范围之前所需的 Live 历史 manday 或历史排班事实，用于跨边界法规计算。
- `ScenarioReferenceSource`：Scenario 固定选择的 `scenario.ruleset_id` 及其法规参数、crew/reference 数据。
- `DraftOverlaySource`：当前 user/session 在该 Scenario 中的未保存操作。

Scenario preview 的有效数据可以表达为：

```text
effective_scenario_roster = scenario_roster(scope)
                          + live_history(before scope.start, required_lookback)
                          + draft_overlay(scenario_id, user_id, session_id)

preview_violations = rust_check(effective_scenario_roster, scenario.ruleset_id)
```

关键边界：

- Scenario 范围内不能读取 Live 当前 roster 作为检查基准。
- Scenario 范围前可以读取 Live 历史事实，用于满足法规 lookback、manday、连续值等计算。
- 不同 Scenario 的 scope、ruleset、reference 版本可能不同，因此 Scenario preview session 必须带 `scenario_id` 和 scope/version 信息。
- Scenario 的法规集合来自 Scenario 创建或加载时固定选择的 `scenario.ruleset_id`，不是 Live 页面当前选择值。

## Draft Session 模型

Draft 状态不能只存在前端内存中。法规服务需要识别不同用户、不同浏览器会话、不同 Scenario 或 Live 上下文中的 draft overlay。

建议引入 draft session 维度：

```text
draft_session_id
context_type: live | scenario
context_id: null | scenario_id
user_id
ruleset_id
scope_start
scope_end
base_version
created_at
updated_at
expires_at
```

Draft overlay 存储每一步操作，而不是只存最终快照：

```text
operation_id
draft_session_id
sequence_no
operation_type
payload
affected_crew_ids
affected_task_ids
created_at
```

这样可以支持：

- 每一步操作后增量触发法规检查。
- Undo/redo 或撤销某一步 draft 操作。
- 多用户、多 session 隔离。
- commit 时校验 base version，避免用户基于过期基准提交。
- preview 结果按 session 做 TTL 清理。

## 操作覆盖范围

以下手工操作都应走同一套 preview 检查，不应出现某些操作只改前端状态、某些操作才调用法规的分裂状态：

- 分配任务给 crew。
- 移动任务。
- swap 任务。
- 添加地面任务，例如 DO、SBY、SL、GRD。
- 删除地面任务。
- 分配带 pairing 的任务。
- 删除带 pairing 的任务。
- 任何会改变 crew 时间线、manday、pairing duty 结构或 assignment group 的操作。

每个操作的基本流程应统一为：

```text
frontend operation
  -> draft service append operation
  -> legality service build effective roster
  -> rust ruleset check all enabled rules
  -> return preview violations and blocking decision
  -> frontend display warning / block operation / allow draft state
```

## 告警生命周期

Preview 告警与正式告警需要分开管理。

Preview 告警：

- 来源：draft session 的有效排班数据。
- 作用域：user/session/context。
- 返回对象：当前用户界面。
- 生命周期：session TTL、draft 重算、用户保存或放弃后清理。
- 不写入正式 `rule_violation`。

正式告警：

- 来源：已入库的 Live roster 或已提交的 Scenario roster。
- 作用域：正式 roster version / scenario version。
- 返回对象：Alert Center、正式报表、持久化查询。
- 生命周期：提交后由法规服务 upsert/delete。
- 写入正式告警表。

保存时的顺序建议：

```text
1. roster/scenario service 持久化排班变更
2. 产生新的 roster_version 或 scenario_version
3. legality service 接收已提交事实或提交事件
4. legality service 重新加载 committed data
5. Rust ruleset 全量或影响范围检查
6. upsert/delete 正式 rule_violation
7. 发布 violation-updated 事件给前端或 Alert Center
```

## Legality Service 职责边界

Legality Service 不应只是一个薄 preview API。它需要承担法规检查的数据组装、session 隔离和告警生命周期管理。

建议职责：

- 管理 Live committed roster snapshot 或按需加载能力。
- 管理 Scenario roster scope 与 Scenario 独立数据源。
- 管理 draft session 和 draft overlay。
- 根据 `ruleset_id` 展开法规集合并调用 Rust 法规。
- 根据操作影响范围决定检查 crew、日期窗口和 required lookback。
- 返回 preview 告警和阻止决策。
- 对已提交数据生成正式告警并维护 `rule_violation`。
- 提供事件或订阅机制通知前端刷新告警。

不建议由 Gantt 前端或普通 roster mutation route 分散拼接法规输入。否则 Live、Scenario、draft、正式告警的边界会继续分裂。

## API 草案

创建或恢复 draft session：

```http
POST /api/legality/sessions
```

```json
{
  "contextType": "live",
  "contextId": null,
  "rulesetId": "...",
  "scopeStart": "2026-07-01",
  "scopeEnd": "2026-07-31",
  "baseVersion": "..."
}
```

追加 draft 操作并实时检查：

```http
POST /api/legality/sessions/:sessionId/operations
```

```json
{
  "operationType": "assign_task",
  "payload": {
    "taskId": 1008104,
    "crewId": 13441,
    "date": "2026-07-13"
  }
}
```

返回：

```json
{
  "allowed": false,
  "blockingViolations": [
    {
      "ruleCode": "1001",
      "severity": "ERROR",
      "crewId": 13441,
      "message": "..."
    }
  ],
  "previewViolations": [],
  "sessionVersion": 12
}
```

保存后正式复查事件：

```text
RosterCommitted {
  contextType: live | scenario,
  contextId: null | scenario_id,
  version: roster_version | scenario_version,
  rulesetId,
  affectedCrewIds,
  affectedRange
}
```

## 数据加载策略

Live：

- 基于当前 Live roster version 加载正式排班。
- 对受影响 crew 和日期窗口执行检查。
- 对需要跨边界计算的规则，向前加载 required lookback。
- required lookback 应由 ruleset/rule dependency 推导，不能固定写死为一天或一个月。

Scenario：

- 加载 Scenario scope 内的 scenario roster。
- 加载 scope start 之前的 Live 历史 manday 或必要排班事实。
- 不加载 scope 内 Live 当前 roster。
- Scenario scope、ruleset、reference version 应进入检查上下文，保证不同 Scenario 互相隔离。

## Blocking 决策

Draft preview 返回的不只是 violation list，还应返回是否允许该操作继续。

建议规则：

- 严重级别为 blocking 的法规违规，应阻止本次 draft 操作进入有效 draft 状态。
- 非 blocking warning 可以允许进入 draft，但需要界面明确展示。
- blocking 级别不应由前端硬编码，应来自 ruleset/rule item 配置或法规服务统一策略。

以 DO `1008104` 分配问题为例：

```text
assign DO 1008104 to crew 13441 on 2026-07-13
  -> effective roster includes existing FLY pairing 13684 and new DO
  -> Rust ruleset check all enabled rules under selected ruleset_id
  -> rule 1001 detects overlap/conflict
  -> legality service returns allowed=false
  -> frontend blocks assignment and shows warning
```

## 待明确问题

以下问题需要在正式实现前进一步定稿：

- Snapshot 粒度：Live 按全局 roster version、日期窗口 version，还是 crew/range version 管理。
- Scenario reference 数据：按 Scenario 创建时固化，还是按检查时 effective-dated reference 表读取。
- required lookback：由 Rust 引擎声明规则依赖，还是由法规服务维护规则依赖表。
- Preview 结果存储：Redis TTL、DB 临时表，还是两者结合。
- Draft session 冲突：保存时 base version 过期后，是要求用户 rebase，还是自动重放 overlay。
- 性能策略：每一步操作全量检查、按 affected crew/range 检查，还是 Rust 引擎支持增量 workset。
- 正式告警 upsert/delete 的唯一键：需要覆盖 context type、context id、ruleset id、crew、rule code、violation fingerprint、version。
- Scenario 提交后是否写正式 Scenario violation 表，还是统一写入带 context 维度的 violation 表。

## 建议实施阶段

第一阶段：统一现有保存后法规复查路径。

- 确认所有 Live roster mutation 保存后都使用 `ruleset_id` 调 Rust ruleset。
- 确认所有 Scenario patch 保存后都使用 `scenario.ruleset_id` 调 Rust ruleset。
- 清理前端和后端新增代码中的 `ruleGroupCode` 依赖。

第二阶段：建立 preview session 基础能力。

- 新增 draft session 和 operation append API。
- Live preview 先覆盖 assign/move/delete/add ground task。
- Preview 告警只返回给当前 session，不入库。
- UI 根据 `allowed=false` 阻止操作。

第三阶段：Scenario preview 接入。

- Scenario 使用独立 context。
- 检查数据为 Scenario roster + scope 前 Live history + Scenario draft overlay。
- Scenario ruleset 固定取 `scenario.ruleset_id`。

第四阶段：正式告警生命周期归拢。

- Roster/Scenario commit 统一发布 committed event。
- Legality Service 接管正式 violation upsert/delete。
- Alert Center 只消费正式 violation 或事件刷新。

第五阶段：性能和一致性优化。

- 引入影响范围计算。
- 引入规则 lookback metadata。
- 支持 session rebase 和冲突提示。
- 根据需要增加 Rust 增量检查 workset。

