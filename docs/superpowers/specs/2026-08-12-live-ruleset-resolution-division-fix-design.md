# live-server 法规告警自动刷新 ruleset 解析修正（去掉 103 偏好 + 写死 division）设计

## 1. 状态与决策

- 状态：待用户审阅批准后实施。与 `2026-08-12-pbs-bid-feedback-rule-engine-eligibility-design.md` 相互独立，可分别排期。
- 背景：Live 侧"后台自动刷新法规告警"各路径已动态解析 enabled workset（非硬编码 103），但存在两个遗留问题：
  1. `resolveAffected`（legality-recheck.ts:123-126）用 `ORDER BY case when id=103 then 0 else 1 end` 的 **103 偏好**判定"默认 live ruleset"。
  2. `getDefaultRulesetId`（rule-check-trigger.ts:16）与 `runLegalityOnStartup`（index.ts:81）**写死 `division='P'`**。
- 决策（用户确认）：
  - `type LIKE '%LIVE%'` 逻辑正确，保留；PBS 侧同样用 `LIKE '%PBS%'`（见 PBS spec §5），支持与 LIVE 共用一套法规集（如 `type='LIVE,PBS,RO'`）。
  - 所有路径不再写死 division，由调用方传入。
  - 调用方与 division 来源：
    - roster 变更重查 → 取被分配 crew 的 `crew.division`；
    - 法规参数变更刷新 → 直接传入受影响的法规集合 id，不再重新解析；
    - 启动自动刷新 → 无具体 crew，枚举所有 enabled 的 LIVE workset（P/C 各一套），并按 workset.division 传 `--division`，保证 P 法规集只查 `crew.division='P'`、C 法规集只查 `crew.division='C'`，division 严格对应。
  - 无用代码直接删除：`rule-check-trigger.ts` 全文件无引用（死代码），整文件删除，不保留。

## 2. 现状路径清单

| 路径 | 位置 | 现状 SQL | division 问题 |
|---|---|---|---|
| 冷启动自动刷新 | `index.ts:80-86` `runLegalityOnStartup` | `category='RULE' AND type LIKE '%LIVE%' AND enabled=true AND division='P' ORDER BY id LIMIT 1` | 写死 P 且不传 `--division`，漏 Cabin；改为枚举全部 + 按 workset.division 传 `--division`（§3.5） |
| 排班变更触发（violation bell） | `rule-check-trigger.ts` `getDefaultRulesetId` / `enqueueRuleCheckForMutation` | `... AND division='P' ORDER BY id LIMIT 1` | 死代码（无引用），整文件删除（§3.4） |
| roster 变更重查 | `legality-recheck.ts:256-263` `recheckLiveRosterMutation` | `... enabled=true ORDER BY division, id`（枚举全部） | 未按调用方 crew 的 division 过滤 |
| 法规参数变更刷新 | `legality.ts:38-44` `refreshAllLiveRulesets` | `... enabled=true ORDER BY division, id`（枚举全部） | 未按受影响 ruleset 精确定位 |
| 法规参数变更判断 | `legality-recheck.ts:123-126` `resolveAffected` | `ORDER BY case when id=103 then 0 else 1 end, id LIMIT 1` | **103 偏好** |

## 3. 修正方案

### 3.1 `resolveAffected` — 去掉 103 偏好

- 删除 103 偏好查询（legality-recheck.ts:124-126）。
- 该函数已通过 `rule_set` join 计算出 `worksetIds`（受改法规影响的 workset 集合），直接返回它。
- `affectsLiveDefault` 语义调整：改为"`worksetIds` 中是否包含 **enabled 的 LIVE workset**"（用 `WHERE id = ANY($1) AND category='RULE' AND type LIKE '%LIVE%' AND enabled=true` 判定），供路由状态展示（legality.ts:286,289）沿用。

### 3.2 `refreshAllLiveRulesets` — 直接传入 ruleset id

- 签名改为 `refreshAllLiveRulesets(fastify, rulesetIds: number[], ruleCodes?)`：不再自己重新解析 `type LIKE '%LIVE%'`，直接对传入的 rulesetIds spawn `spawnLiveRecheck`。
- 调用方（legality.ts:283）：`PATCH /rule/:ruleId/params` 时，`resolveAffected` 返回 `worksetIds` → `refreshAllLiveRulesets(fastify, affected.worksetIds, recheckRuleCodes)`。
- 效果：法规参数变更只重算包含该法规的 workset，不再"默认刷新所有/依赖 103 判断"。

### 3.3 `recheckLiveRosterMutation` — 按 crew.division 过滤

- 调用方均带 `crewIds`（roster.ts:33、roster-bulk-delete-worker.ts:139、draft.ts:229、manday-operation-service.ts:40）。
- 内部新增：`SELECT DISTINCT division FROM crew WHERE crew_id = ANY($1)`，得到受影响 crew 的 division 集合。
- workset 解析 SQL 增加 division 过滤：`... AND enabled=true AND division = ANY($divisions)`。无 crewIds（防御性）时保持枚举全部 enabled。
- 与现有 `resolveWorksetDivision`（按单个 rulesetId 查 workset.division）共存；未明确 rulesetId 时按 division 集合枚举。

### 3.4 删除死代码 `rule-check-trigger.ts`

- `live-server/src/services/rule-check/rule-check-trigger.ts` 全文件在 src 中无任何引用（`enqueueRuleCheckForMutation` / `getDefaultRulesetId` 均无调用方），violation bell 的交互检查已改走 `rule-check-routes.ts` 的 on-demand/batch 与 `recheckLiveRosterMutation`。
- 整文件删除，不保留停用代码；`getDefaultRulesetId` 的 `division='P'` 写死随之消失，无需修补。

### 3.5 `runLegalityOnStartup` — 枚举所有 enabled 的 LIVE workset，division 严格对应

- 启动时无具体 crew，不能传单个 division；且不能用 P 法规集检查 C crew。
- 改为查询所有 enabled 的 LIVE workset（含 division）：
  `SELECT id, division FROM workset WHERE category='RULE' AND type LIKE '%LIVE%' AND enabled=true ORDER BY division, id`
- 对每个 workset 各 spawn 一次 `live-legality.mjs`，并传入该 workset 自己的 division：
  `--group <id> --from <from> --to <to> --division <workset.division>`
- `live-legality.mjs:40` 已按 `--division` 过滤 crew（`coalesce(rf.division, c.division, '') = '<DIVISION>'`），division 对应由脚本保证：P workset 只查 `crew.division='P'`，C workset 只查 `crew.division='C'`。

## 4. 与 PBS 侧的一致性

- PBS spec §5 使用 `type LIKE '%PBS%'`；两边的 ruleset 解析契约对齐（`category='RULE' AND type LIKE '%<ENGINE>%' AND enabled=true AND division`）。
- 共用一套法规集（`LIVE,PBS,RO` 型）时，LIVE 与 PBS 都能命中同一 workset，符合预期。

## 5. 测试

Vitest（live-server 服务层）：

- `resolveAffected`：改法规属于 workset X 时返回 `[X]`；`affectsLiveDefault` 仅当 X 是 enabled 的 LIVE workset 时为 true；无 103 依赖（把 103 停用/换 id 后断言不变）。
- `refreshAllLiveRulesets`：传入 rulesetIds 精确 spawn，不再全量枚举。
- `recheckLiveRosterMutation`：传 P division 的 crewIds 时只 spawn P workset；混 P/C 时两者都 spawn。
- `rule-check-trigger.ts` 删除后：全仓库无 `enqueueRuleCheckForMutation` / `getDefaultRulesetId` 残留引用（grep 断言）。
- `runLegalityOnStartup`：mock workset 含 P/C 各一，断言各 spawn 一次且各传 `--division P` / `--division C`；P workset 的 spawn 不传 C 的 crew 范围（division 对应）。

## 6. 风险

- 删除 `rule-check-trigger.ts` 前需确认无外部（非 src）引用；src 内已确认无引用，dist 为陈旧产物不追溯。
- **优化侧依赖核查**：engine-server（Python）/ pbs-engine 不调用被修改的 live-server TS 函数（`resolveAffected` / `refreshAllLiveRulesets` / `recheckLiveRosterMutation` / `rule-check-trigger`），删除与改签名不影响优化链路；优化侧也不消费 `rule_violation` / `rule_check_result_*`（solver 直接读 `rule_set` / `rule` / `rule_parameter`）。优化侧已按 `scenario.ruleset_id` 动态加载法规集合（`ro_input_builder/cli.py:144-145` → `RUST_RULE_WORKSET`）；`legacy_ro_converter.py:336 default_workset_id=103` 与 Rust connector 的 103 仅是场景 `ruleset_id` 未解析时的防御兜底，无需改动，不在本 spec 范围。
- `recheckLiveRosterMutation` 的 4 个调用方均传 crewIds；若未来有调用方不传 crewIds，默认回退枚举全部，行为不劣化。
- `resolveAffected` 的 `affectsLiveDefault` 展示字段语义变化：从"是否含 103"变为"是否含启用中的 live workset"，前端 status 展示含义更准确，需确认 UI 无依赖旧语义。

## 7. 参考

- `live-server/src/services/rule/legality-recheck.ts`
- `live-server/src/services/rule-check/rule-check-trigger.ts`
- `live-server/src/routes/rule/legality.ts`
- `live-server/src/index.ts`
- `docs/superpowers/specs/2026-08-12-pbs-bid-feedback-rule-engine-eligibility-design.md`
