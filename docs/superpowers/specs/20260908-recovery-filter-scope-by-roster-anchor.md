# Recovery Filter Scope — 锚定到「被接收的 Roster」

> 项目：ROIS-AI Gantt · Crew Roster Recovery（8004 恢复方案）
> 文档状态：优化设计稿（v1）
> 日期：2026-09-08
> 范围：仅修改 `recoveryRuleFailures` 的告警差异判定边界

## 1. 背景

`gantt/src/services/recovery-candidates.ts` 中的 `recoveryRuleFailures()` 负责对"模拟 swap 后的 Roster 重新跑 Rule 检查"，判定哪些候选方案应被过滤（从 `options` 移到 `excludedOptions`，并在 UI 的 "Filtered after Rule check" 面板展示）。

当前实现的问题：
- `newViolations = after.filter(v => !beforeKeys.has(previewViolationKey(v)))`
- `previewViolationKey` 用 `(crewId, pairingId, ruleCode, ruleInstance, scopeKey, message)` 拼出。
- 任何在"恢复方案模拟前后"看上去不一样（哪怕只是不同 Crew 上的不同 Pairing 上的无关 Rule 告警）的 after 项，都会被当成"新出现告警"，从而错误地把方案过滤掉。

按 `docs/requirements/crew-roster-recovery-requirements.md` §4.3 的语义：
- 恢复方案的目标是「把 8004 解决掉、目标 Roster 整体不引入新告警」。
- 与"被恢复的 Roster"无关的告警，是 Crew 当下持有的、与本次 8004 无关的历史告警，不应作为过滤依据。

## 2. 目标

将"新出现告警"的判定范围锚定到本次恢复实际接收/交换的 Roster：
- 只有 (crewId, pairingId) 等于「本次方案接收的 Roster 锚点」上的 `after` 告警，才会参与"是否新出现"的判定。
- 不在锚点集合内的 `after` 告警 → 直接忽略，不计入 `newViolations`、不进入 `ruleMessages`、不触发过滤。
- `unresolved8004` 判定逻辑保持不变（它本来就在锚点上，属于"恢复方案没解决 8004"的语义）。
- 锚点保持与现有 `received` 集合（mode/subOptions 处理）一致。

## 3. 非目标

- 不修改 Alert Center 告警列表的呈现。
- 不修改"Filtered after Rule check" UI 面板的位置、文案、配色。
- 不修改 `unresolved8004` 的判定条件。
- 不修改 8004 之外的其他告警的处理。
- 不修改 `apply` 时的最终 Rule 检查语义。

## 4. 设计

### 4.1 锚点集合（保持现有逻辑）

```ts
const received = options.flatMap((option) => [
  { crewId: option.targetCrewId, pairingId: option.destinationSplit?.createdPairingId ?? option.sourcePairingId },
  ...((option.mode === 'swap' || option.mode === 'cross-base-swap') && option.targetPairingId != null
    ? [{ crewId: option.sourceCrewId, pairingId: option.targetPairingId }]
    : []),
])
```

### 4.2 过滤后的 newViolations

```ts
const receivedKeys = new Set(received.map((a) => `${a.crewId}|${a.pairingId ?? ''}`))
const onReceivedAfter = input.after.filter((v) => receivedKeys.has(`${v.crewId}|${v.pairingId ?? ''}`))
const beforeKeys = new Set(input.before.map(previewViolationKey))
const newViolations = onReceivedAfter.filter((violation) => !beforeKeys.has(previewViolationKey(violation)))
```

`unresolved8004` 维持对 `input.after` 全集检查（其 `received.some(...)` 判定本就精确）。

## 5. 影响范围

| 文件 | 改动 |
|---|---|
| `gantt/src/services/recovery-candidates.ts` | 改 `recoveryRuleFailures` 内 `newViolations` 的过滤范围 |
| `gantt/src/services/__tests__/recovery-candidates.test.ts` | 新增 1 个测试：非锚点上的告警差异不应触发过滤 |
| 无后端改动 | — |

## 6. 风险

- 如果"无关联的告警"恰好 (crewId, pairingId) 与被恢复 Roster 巧合相同但属于完全不同的 Rule 触发原因，新逻辑仍会认为它是"历史告警"——这与需求 §4.3「Crew 当前持有的告警不应当作新告警」的语义一致，可接受。
- 既有测试「rejects a candidate that leaves 8004 on a received Roster or creates any new Rule violation」中 7501 告警的 (crewId='B', pairingId=100) 正好是锚点 → 仍能通过新逻辑。无回归。

## 7. 验证

- 单元测试：`vitest run src/services/__tests__/recovery-candidates.test.ts`（PASS）。
- 手动验证：构造一个"非锚点 Crew + 非锚点 Pairing 上的告警差异"用例，方案不应被 filter。

## 8. 不需要迁移

- 无 schema 变更、无 API 变更，仅纯前端逻辑。

## 9. 不要硬编码具体 Rule 编号（补丁 §2 的延伸约束）

`recoveryRuleFailures` 的过滤门控必须只依赖服务端返送的 `violation.ruleCode`，不能写死看到某个具体 ruleCode（例如 7501 / 8002 / 8056）就特殊处理。理由：

- 不同 ruleset 启用的 rule 集合不同（见 `docs/requirements/crew-roster-recovery-requirements.md` §4.3）。客户端不能假设某个 rule 一定存在或一定不存在。
- 业务硬编码只允许出现在「本期 Recovery 唯一入口规则」这一处，即 8004（`unresolved8004` 的判定）。这是 `crew-roster-recovery-requirements.md` §4.3 明确规定的业务分支，不算功能硬编码。
- 测试代码中模拟 violation 时，使用占位 ruleCode（例如 `7001`）而不是把某个具体编号当成「典型」硬编码值；让代码读者明确意识到「ruleCode 是数据，不是判断条件」。
