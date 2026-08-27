# PBS Bid Feedback Rule Engine Eligibility 集成（Phase Two）设计

## 1. 状态与决策

- 状态：待用户审阅批准后实施。
- **2026-08-12 修正**：原「镜像 live-server HTTP client（`/check/pairing`）」方向错误——该 HTTP 端点无服务端（旧 `rule-engine/` 包已删）。改为**方式 A：直接进程调用 `rule-engine-rs/target/release/check-*` 二进制，复用 `legality-recheck-core.mjs` 规则函数**（见 §6）。`RULE_ENGINE_URL` 移除，改为可选 `RUST_RULE_CORE`；RUST 二进制与 live-server 共用同一份。
- 本规格是 `2026-08-12-pbs-bid-feedback-phase-one-cleanup-design.md` 的第二阶段：实现正式 Rule Engine Eligibility，替换 Phase One 的统一 `unknown/unavailable`。
- 法规集合解析契约（用户确认，与 LIVE 侧 `type LIKE '%LIVE%'` 对称）：`category='RULE' AND type LIKE '%PBS%' AND enabled=true`，每个 division 启用一套；**ruleset_id（workset.id）随环境/部署可变，但三个筛选条件不变**。用 `LIKE '%PBS%'` 是为了兼容 PBS 与 LIVE 共用一套法规集（如 `type='LIVE,PBS,RO'` 的 103/637 同时服务两边）。
- 找不到法规集合 → 对所有 Award Pairing **统一返回告警**（unknown + 提示 admin 配置 PBS 法规集合），不静默通过。
- `pbs_user.base/rank` 字段移除（用户确认，Full removal）：改为从 live `crew_base`/`crew_rank` 取，`division` 字段保留。
- `pbs_user.division` 为空时兜底 `'P'`（admin 账号可忽略）。

## 2. 背景与前置

Phase One（已实施）删除 Scenario Snapshot 链，Award Pairing 的 `eligibility` 固定为：

```text
status = unknown
checked = []
unavailable = [rule_engine]
reasons = []
eligibilityLabel = "Eligibility unavailable. Rule Engine eligibility checks have not been run for Bid Feedback."
```

本阶段实现该接口：pbs-server 像 live-server 一样调用 RUST 法规（HTTP rule-engine 服务），对每个候选 Award Pairing 单独检查，把告警映射回 `eligibility.reasons[]`。

现状代码基线：

- `pbs-server/src/services/bid-feedback/bid-feedback-service.ts:67-71` 定义 `UNKNOWN_PAIRING_ELIGIBILITY`；`:562` 对 award 方向 pairing 赋值。
- `pbs-server/src/services/bid-feedback/bid-feedback-input-loader.ts:222-346` `bid_feedback_actor_context` CTE 读取 `pbs_user.base/rank`。
- `packages/contracts/pbs-bid-feedback.d.ts:44-60` 已定义 eligibility 完整结构（`checked`/`unavailable`/`reasons`，含 `RULE_ENGINE_CONFLICT`）。
- live-server 调用基线：`live-server/src/services/rule-engine-client.ts`（`checkPairing`/`checkRoster`，POST `/check/pairing`，`groupCode=String(ruleset_id)`）；`live-server/src/services/rule-check/rule-check-data-service.ts`（`loadPairingInput`/`loadCrewInfo`/`loadFlightHistory`）。
- live 权威数据源：`crew_base`（is_prime_base=1，effective-dated）、`crew_rank`（effective-dated）、`crew`、`crew_fleet`、`crew_qualification`、`roster_flight`+`pairing_segment`+`flight`。
- 误导性遗留 `rule-engine/dist/`（`rule_group.group_code` 旧模型）已删除；`CLAUDE.md` 过期引用已清理。

## 3. 目标

1. pbs-server 集成调用 RUST 法规（与 live-server 相同调用方式）。
2. 按 `pbs_user.division` + PBS 类型解析 enable 法规集合（`workset type='PBS'`），得到 `ruleset_id`。
3. 对每个候选 Award Pairing 独立检查（per-pairing isolation），返回每个 Pairing 的告警。
4. 告警映射进现有 `eligibility.reasons[]`（`RULE_ENGINE_CONFLICT`：ruleId/ruleName/message），契约无需改动。
5. `pbs_user.base/rank` 移除，统一从 live `crew_base`/`crew_rank` 取。
6. 无法规集合 / 引擎不可用时不阻断反馈，统一降级 unknown + 告警提示。

## 4. 非目标

- 不做 roster 级（跨 pairing 交互）检查；候选 Pairing 之间不互相叠加。
- 不检查 Rank/Base/Pre-assignment Eligibility（`RANK_MISMATCH`/`BASE_MISMATCH`/`PREASSIGNMENT_OVERLAP` 暂不生成，仅作为契约预留）。
- 不改前端契约；`eligibility` shape 保持 `pbs-bid-feedback.d.ts` 现状。
- 不手写法规检查器；全部走 rule-engine HTTP 服务。
- 不修改 `pbs_user.division`（保留，用于 ruleset 解析与 UI 机组类型筛选）。
- 不删除 live 侧任何 RUST / rule-engine 相关逻辑。

## 5. 法规集合解析

新文件 `pbs-server/src/services/bid-feedback/ruleset-resolver.ts`：

```sql
SELECT id, name
FROM {liveSchema}.workset
WHERE category = 'RULE'
  AND type LIKE '%PBS%'
  AND enabled = true
  AND division = $1
ORDER BY id
LIMIT 1
```

- `division` = `pbs_user.division`，为 null/空时兜底 `'P'`。
- 返回 `{ rulesetId, name } | null`。
- 结果可按 rulesetId 短缓存（如 60s），降低每次反馈解析开销；不缓存为空的结果（避免 admin 配置后需等缓存过期）。

### 5.1 未找到法规集合 → 统一告警

当解析为 null 时，所有 Award Pairing 的 eligibility 统一为：

```text
status      = unknown
checked     = [rule_engine]
unavailable = [rule_engine]
reasons     = [{ code: FACTS_MISSING, message: "No enabled PBS ruleset configured for division <division>. Please ask an administrator to configure the PBS ruleset." }]
```

`eligibilityLabel` 固定为同义告警文案（如 `Eligibility unavailable: no enabled PBS ruleset. Please contact your administrator.`）。

## 6. 调用方式（与 live-server 一致：直接进程调用 RUST 二进制）

**修正（2026-08-12）**：live-server 真正的 RUST 调用是直接进程方式，不是 HTTP。旧 `rule-engine/` HTTP 服务已删除，`/check/pairing` 无任何服务端；live-server 通过 `live-server/scripts/legality-recheck-core.mjs` 用 `spawnSync` 调 `rule-engine-rs/target/release/check-*` 二进制（每规则一套 TSV，见 `runBin`）。

pbs-server 采用**方式 A（复用 core 的规则函数）**：

- 复用 `live-server/scripts/legality-recheck-core.mjs` 导出的规则函数（`rule8002`/`rule8056`/`rule8071`/`rule8072`/`rule8030`/`rule8004`/`rule1001`/`rule7505`/`rule7507`/`rule7506`/`rule7501`/`rule7508`/`rule7503`/`rule7504`）与 `runBin`/`resolveRulesetRules`，规则逻辑与 live-server **零漂移**。
- pbs-server 提供收窄到"候选 crew + 候选 pairing"的 `source`（`.db` 查询 live schema 的接口）与 `ctx`（rulesetId + 候选 pairing 时间窗 + division），调用 `computeViolations(source, ctx, rulesetRuleCodes)`。
- **RUST 二进制共用同一份部署**：pbs-server 与 live-server 在同一主机的同一 repo checkout（SIT: `~/rois/sit/`），指向同一 `rule-engine-rs/target/release/`。**无需单独配置 bin 目录**——core 的 `runBin` 用 `path.resolve(__dirname, '../../rule-engine-rs/target/release')` 已解析到同一份二进制。
- 规则集由 workset 驱动：`resolveRulesetRules` 读 `rule_set`+`rule`（function/instance/severity/param_json）。**当前 PBS workset（103/637）规则定义尚不准确，后续由 admin 补充具体规则**；实现架构上跑 workset 实际定义的规则，规则集配好后自然生效。

### 6.1 与 live-server 的同步机制（单一来源）

- pbs-server **直接 import** `live-server/scripts/legality-recheck-core.mjs`（默认从 pbs-server 所在 repo 根解析到 `live-server/scripts/`，可被 `RUST_RULE_CORE` env 覆盖），**不复制、不 fork**。live-server 日后修改任何规则函数 / TSV 格式 / `runBin`，pbs-server 下次重启即自动使用新实现，**无需单独改动 pbs 侧代码**。
- **部署拓扑**：支持 pbs-server 与 live-server 同主机同 checkout（默认，单一份 core + 同一份 RUST 二进制），也支持**各自独立部署**——独立部署时 pbs-server 主机需同时部署两份东西：(1) core 文件 `legality-recheck-core.mjs` + `live-legality.mjs`（`liveSource` 所在），并设 `RUST_RULE_CORE` 指向它；(2) `rule-engine-rs/target/release/check-*` 二进制（core 的 `runBin` 相对自身位置解析）。此时 core 是部署快照，live 改 core 后需把新 core 重新部署到 pbs 主机才能同步（deploy 脚本应把 core + RUST 二进制同时推给两个主机）。
- 若未来 live-server 新增/移除规则，只要新增的规则也在 `RULES` 列表且对应 `check-*` 二进制已部署，pbs 自动跟随。
- 运行时以**动态 import**（`.mjs`）方式加载，避免 tsc 编译该文件；调用处 `await import(corePath)`。

配置：`pbs-server/src/config/env.ts` + `.env.example` 增加可选 `RUST_RULE_CORE`（指向 core 文件路径，默认按 repo 根解析到 `live-server/scripts/legality-recheck-core.mjs`），**移除 `RULE_ENGINE_URL`**。

## 7. 数据服务（live schema 取值）

新文件 `pbs-server/src/services/rule-check/rule-check-data-service.ts`，镜像 live-server 同名 service，全部 SQL 加 `{liveSchema}.` 前缀：

### 7.1 CrewInfo 构建

```ts
interface CrewInfo {
  crewId: string
  division: string      // crew.division
  rank: string          // crew_rank 有效区间
  fleetQuals: string[]  // crew_fleet 有效区间
  airportQuals: string[]// crew_qualification is_valid=1
  recentFlightHours: { last24h, last7d, last28d, last90d, last365d }  // 滚动飞行时长
  recentLandings90d?: number
  totalHours?: number
  dateOfBirth?: string  // crew.birthday
}
```

- base 单独由 `crew-identity`（见 §10.1）解析；CrewInfo 本身不含 base（与 live-server 契约一致）。

### 7.2 PairingInput 构建

```ts
interface PairingInput {
  pairingId: number
  crewBase: string          // pairing.base
  seatPosition?: string | null  // Phase Two 传 null（无既有 roster_flight）
  duties: Array<{
    dutySeq: number
    reportUtc: Date         // brief_start_utc ?? duty_sch_str_dt_utc
    releaseUtc: Date        // debrief_end_utc ?? duty_sch_end_dt_utc
    restAfterMinutes?: number // duty_sch_rest_min
    segments: Array<{
      fltNo, depPort, arrPort,
      stdUtc, staUtc,        // sch_str_dt_utc / sch_end_dt_utc
      blockMinutes,          // flight.blk_min（无 flight 时 0）
      isNight,               // stdUtc UTC 22:00–06:00
      fleetCode,             // fleet_seg
      isDeadhead,            // seg_assignment = 'DH'
    }>
  }>
}
```

数据源：`{liveSchema}.pairing` + `pairing_segment`（`is_deleted=0`）LEFT JOIN `flight`（`ps.flt_id`），`ORDER BY duty_seq, seg_seq`，按 `duty_seq` 分组。缺失（无 segment）→ 该 pairing 数据不可用，按 §8 unknown + `FACTS_MISSING`。

### 7.3 性能

- CrewInfo 每反馈只加载一次（复用全部 pairing）。
- 候选 PairingInput 批量加载（`WHERE p.id = ANY($1)`）。
- 引擎调用并发上限 ~8（`checkPairing` per pairing）。

## 8. Eligibility 映射

新文件 `pbs-server/src/services/bid-feedback/rule-eligibility.ts`：

| 场景 | status | checked | unavailable | reasons |
|---|---|---|---|---|
| 成功且 `passedAll=true` | eligible | `["rule_engine"]` | `[]` | `[]` |
| 成功且存在失败项 | ineligible | `["rule_engine"]` | `[]` | 失败 checkResults → `{code:"RULE_ENGINE_CONFLICT", message:cr.message, ruleId:cr.ruleCode, ruleName:cr.ruleName}` |
| 引擎调用异常 | unknown | `["rule_engine"]` | `["rule_engine"]` | `[]`（日志记录） |
| pairing 数据缺失 | unknown | `["rule_engine"]` | `["rule_engine"]` | `[{code:"FACTS_MISSING", message}]` |
| 法规集合未配置 | unknown | `["rule_engine"]` | `["rule_engine"]` | §5.1 统一告警 |

## 9. 接入 bid-feedback-service.ts

- `buildFeedback` 中，`matches` 聚合完成后：
  1. 解析 ruleset（§5），一次；
  2. 对 `rawDirection === "award"` 的 pairings 调用 `checkPairingEligibility(...)`（§8）；
  3. 用结果替换 `UNKNOWN_PAIRING_ELIGIBILITY`（`bid-feedback-service.ts:562` 处）。
- Avoid / Neutral pairing 的 `eligibility` 保持 `null`（现状）。
- `eligibilityLabel` 更新为实际状态摘要（含 ruleset 名称/检查时间，或 §5.1 告警文案）。
- `FEEDBACK_CACHE_VERSION` 从 `v7` 升到 `v8`（响应 shape 变更，避免旧缓存含 unknown 结果）。
- 引擎失败不阻断反馈：逐 pairing 降级 unknown，整体仍返回 200。

## 10. `pbs_user.base/rank` 移除

### 10.1 共享解析器（新增 `pbs-server/src/services/lineholder/crew-identity.ts`）

```ts
resolveCrewIdentity(pgPool, liveSchema, crewId): Promise<{ base, rank, division, zoneId }>
```

- base：`crew_base WHERE crew_id=$1 AND is_prime_base=1 AND eff_dt<=now() AND (exp_dt IS NULL OR exp_dt>now()) LIMIT 1`；无 prime base 时回退任一有效 base。
- rank：`crew_rank WHERE crew_id=$1 AND eff_dt<=now() AND (exp_dt IS NULL OR exp_dt>now()) ORDER BY eff_dt DESC LIMIT 1`。
- division：`crew.division`。
- zoneId：`airport.zone_id`（按 base 关联）。

### 10.2 数据库

- 新增迁移 `sql/migration/2026-08-12-pbs-user-drop-base-rank.sql`（每个环境 pbs schema 执行）：
  `ALTER TABLE pbs_user DROP COLUMN base, DROP COLUMN rank; DROP INDEX IF EXISTS idx_pbs_user_base; DROP INDEX IF EXISTS idx_pbs_user_rank;`
- 更新 `sql/schema/pbs/01-pbs.sql`：删除 `base`/`rank` 列、`idx_pbs_user_base`/`idx_pbs_user_rank` 索引及对应 comment。
- `pbs-server/src/models/pbs/pbs-user.ts`：删除 `base`/`rank` 字段（保留 `division`）。

### 10.3 同步脚本

- `pbs-server/src/scripts/sync-pbs-users.ts`：删除 base/rank 的 enrich UPDATE（当前 288-329 行区域），仅保留 division 同步。

### 10.4 消费者迁移

| 文件 | 现状 | 改为 |
|---|---|---|
| `bid-feedback-input-loader.ts` | CTE 用 `pbs_user.base/rank` | join live `crew_base`/`crew_rank`（或调 `crew-identity`） |
| `dashboard-profile-service.ts` | `pbsUser.base/rank` | join live `crew_base`/`crew_rank` |
| `pairing-specific-date.ts` | `select({ base: pbsUser.base })` | join live `crew_base` |
| `reserve-coverage-service.ts` | `pbs_user.base` | join live `crew_base` |
| `days-off-export.ts` | `airport.airport = pbs_user.base` | join live `crew_base` |

响应 shape 不变（base/rank 仍返回，仅数据源变化），前端无感。

## 11. 错误处理与降级

- 法规集合未配置：§5.1 统一告警（unknown），不调用引擎。
- 引擎 HTTP 失败 / 超时：逐 pairing 降级 unknown + `unavailable:["rule_engine"]`，日志记录，反馈仍 200。
- 单 pairing 数据缺失（无 segment）：该 pairing unknown + `FACTS_MISSING`，其余继续。
- 并发上限：引擎调用并发 ~8，避免打爆引擎。

## 12. 测试

Vitest（纯后端，前端契约已存在，无需新增 Playwright）：

- `ruleset-resolver`：`type='PBS'` 精确匹配、division 匹配、enabled 过滤、空结果 → null、division 兜底 P。
- `crew-identity`：有效/过期区间、无 prime base 回退、zoneId 解析。
- `rule-eligibility`：eligible / ineligible（reasons 映射）/ 引擎异常 unknown / 数据缺失 FACTS_MISSING / ruleset 未配置统一告警。
- `bid-feedback-service` 集成：award pairing 返回真实 eligibility；引擎 down 时 fallback unknown；`FEEDBACK_CACHE_VERSION` 变更后旧缓存不被读取（回归断言）。
- 5 个消费者既有测试同步更新（live `crew_base`/`crew_rank` 数据源）。
- 生成 SQL 需遵守 `docs/modules/database/generated-sql-safety-standard.md`（fixture/结构校验 + 远端 EXPLAIN 或最小只读执行 + 入口 smoke）。

## 13. 风险与开放问题

- 引擎 `/check/pairing` 契约依赖部署中的引擎版本（live-server worker 已用同一调用方式，风险低）。
- `pbs_user.division` 兜底 P：admin 账号或异常数据会命中 P 集合，行为可预期。
- 当前 DEV enabled 且 type 含 PBS 的是 103/637（`LIVE,PBS,RO`，PBS Solver Ruleset，同时服务 LIVE 与 PBS）。`LIKE '%PBS%'` 会命中它们；若后续要 portal 与 solver 分开，启用 754/755（`type='PBS'` Portal Ruleset）并停用 103/637 即可，代码无需改。
- `recentLandings90d` / `totalHours` 为可选字段，v1 可不填（引擎侧有默认）。
- `seatPosition` v1 传 null；若引擎 crew_composition 检查依赖 seat，需在联调时确认。

## 14. 参考

- `docs/superpowers/specs/2026-08-12-pbs-bid-feedback-phase-one-cleanup-design.md`
- `live-server/src/services/rule-engine-client.ts`
- `live-server/src/services/rule-check/rule-check-data-service.ts`
- `live-server/src/services/rule-check/rule-check-trigger.ts`（workset 解析参照）
- `packages/contracts/pbs-bid-feedback.d.ts`
