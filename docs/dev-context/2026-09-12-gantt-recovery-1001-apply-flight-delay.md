# 开发上下文（2026-09-12）

> 由 Codex 按 `./save-context.sh` 的格式手工生成（本机无 bash，脚本无法执行）。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-12
- Wing：`gantt`
- Topic：`recovery-1001-apply-flight-delay`
- Title：Rule 1001 Recovery — Swap duty / Flight Delay 接入 Apply
- Git branch：`main`（未 commit、未 push）

## 本轮对话上下文

任务来自上一窗口的交接：给 Rule 1001（Assignment Overlap）Recovery 的 Swap duty 接入 Apply，并改造 Flight Delay（列名改 Flight、列出受影响 pairing 全部航段、去掉执行勾选框、Apply 后延后 ATD/ATA）。

**口径（已按最小改动实现，写进 spec）**：①「+1:01」= 地面任务结束 + 61 分钟；② 采用「不提前 + 段间间隔保持」两重下限 —— 每个航段新 ATD = max(delayStart, 原 ATD, 前一段新 ATA + 原段间间隔)，新 ATA = 新 ATD + 原 block。若需求方口径相反，只改 `planFlightDelay()` 一处。

**实现落点**：

- `gantt/src/services/recovery-candidates.ts`：新增 `RecoveryFlightDelayPlan/Segment`、`RecoveryPairingSegmentSnapshot`、`FLIGHT_DELAY_GAP_AFTER_GROUND_TASK_MINUTES=61`、纯函数 `planFlightDelay()`、`flightDelaySegmentsFor()`（优先 pairing 段快照，回退 roster 行）；`makeOption` 让 swap-duty 可执行（`pending` 规则预检），Flight Delay 可执行但不做 owner 规则预检（`not-run`）；Flight Delay 的 afterItems/changes 反映延后时间；`recoveryRuleFailures` 把 swap-duty 视同双向互换。
- `gantt/src/services/recovery-draft.ts`：swap-duty 走完整互换（2×remove + 2×assign）；flight-delay 产出单条 `edit-flight`。
- `gantt/src/services/draft-api.ts` + `gantt/src/stores/draft-store.ts`：新增 Draft op `edit-flight`（`flightTimes[]`），本地 applyDraftOps 改 actStrDtUtc/actEndDtUtc，无锁回退路径调用 `flightApi.updateTimes`。
- `live-server/src/routes/draft/draft.ts`：`edit-flight` 落到既有 `flightService.update`（pairing_segment/roster_flight 连锁 + 缓存失效 + Manday 复算来源）。
- `gantt/src/components/recovery/recovery-violation-dialog.tsx`：徽标、`planTypeForMode`、`isApplicableOption`、pending 集合加入 swapDuty、Flight Delay 的 `Flight` 列 + 航段表（STD/STA/ATD/ATA + 延后值）、无勾选框、切到 Flight Delay 分组即成为 Apply 目标（离开清空）。

**验证（实际跑过）**：

- gantt `tsc -b` PASS；Recovery 单测 71/71 PASS；live-server `tsc --noEmit` PASS；live-server draft 路由测试 6/6 PASS；`node scripts/check-ui-standard.mjs` PASS（0 hard / 124 既有 warning）。
- 真机 UI：`e2e: npx playwright test --config=config/playwright.local.config.ts tests/gantt/recovery-1001-flight-delay-crew-113.spec.ts --reporter=list` → 3/3 PASS（Crew 113 / Pairing 135672 / 2026-09-08；Flight Delay 列与延后值、Apply 写入 `edit-flight` 草稿且甘特时间同步、Swap duty Apply 交换两侧 pairing）。
- 截图：`docs/assets/screenshots/crew-recovery/recovery-1001-{flight-delay-options,flight-delay-applied,swap-duty-retained,swap-duty-applied}-Ver1.png`（已逐张目视检查）。
- 未 Save（Apply 只写未保存草稿是既有语义）；E2E 期间预置的候选配对已在 finally 里删除，DB 无残留（已查询确认）。

**必须知道的两个数据限制（非本次改动引入）**：

1. `dev_live.roster_flight` 没有主键约束，存在重复 `id`（例：Crew 113 的 MTG 行 `id=258` 与 Crew 73 的 ADM 行 `id=258` 同日并存）。前端按 `id` 合并 roster 行，重复 id 会吞掉其中一行 → 受影响机组的 1001 入口静默不可用（Crew 113 / Pairing 136149 的 Alert Center 行 `data-recoverable="false"`）。**E2E 因此改用 Crew 113 / Pairing 135672（2026-09-08）。**
2. 演示数据没有「双向机队相容」的 swap-duty 候选（候选机队 7M8、Crew 113 只有 737 → 双向互换必然新建 8004 违规，本地预检正确过滤）。因此 swap-duty Apply 的 E2E 预置了一个无冲突候选并 stub 了本地预检，用例与注释中已明示；真实数据下「保留但不可用」由 `swap-duty-retained` 截图覆盖。

**不要重复推翻的结论**：Apply 仍只写未保存 Gantt Draft（Save/Ctrl+S 才落库）；Flight Delay 用 `edit-flight`（ATD/ATA 编辑，不改 crew 归属、不改 STD/STA）；Swap duty 复用既有 swap 语义与 `/api/recovery/methods/roster-assignment` 的 `swap` 语义。

## 第二轮（同日）：Crew 113 / 9-16 的 standby & swap 选不中

用户反馈「SBY callout 和 swap 都无法选中，提示任务重复」。用真实数据还原弹窗的 `checkOption` 预检后，拿到确定的拦截原因：

- Standby（Crew 529 / 136149）：`1001/001 ASBY × FLY`（Callout 保留的 SBY 与收到的 pairing 重叠）+ `3007/001 FDP 07:55 > 01:00`。
- Swap duty（Crew 656 / 136152）：`8004/002` ×2（113 与 656 都是 737，7M8 pairing）+ `3007/001` ×2。

**已修**：Callout SBY 是需求允许的唯一重叠，却被 1001 当成竞争任务。两处修复：① `live-server/scripts/{live-legality,scenario-legality,scenario-legality-source}.mjs` 的 1001 `assignmentOverlapRosters()` 排除 `exception_code='CALLOUT_STANDBY'`（管保存后的实时 recheck）；② `recovery-candidates.ts` 的 `buildAfterItems` 给保留 SBY 写 `exceptionCode='CALLOUT_STANDBY'`，`recoveryRuleFailures` 新增 `calloutStandbyWindow` 放行「窗口落在保留 SBY 窗口内」的 1001（草稿预览 overlay 只替换 pairing 行，地面行的 exception_code 传不进引擎，所以门槛侧必须显式表达该例外），弹窗 `checkOption` 传入窗口。真实数据重跑：standby 的拦截原因只剩 3007（ASBY×FLY 消失）。单测 +3（candidates 25 例全过）、SQL 守卫 +3 断言。

**仍需业务决定（未擅自改）**：demo ruleset 的 `3007/001 MAX FDP = 01:00` 让任何 >1h duty 都新报 3007，于是**所有会分配 pairing 的方案**（standby/swap/roster/cross-base）都会被预检过滤 —— 这是 demo 规则参数状态（疑似规则参数测试遗留），需确认是否改回常规值。另：Crew 113 只有 737 资格而窗口内 YVR/P pairing 都是 7M8，任何 swap 都会新建 8004，若要真机演示 swap Apply 需要机队相容的数据。

## 第三轮（同日）：机型限制改软约束（需求方决定）

- 需求方已自行把 `3007/001 MAX FDP` 从 01:00 改为 **10:00**（读到 updated_by=HXG），不需要我再动参数。
- **决策**：机型（fleet）不符合改为**软约束** —— 候选要出现、可被选中，但必须显示机型不符；base / rank seat / 任务冲突仍硬拦截。
- 实现：
  - `recovery-candidates.ts`：新增 `RecoveryOption.warnings`（软）与 `ruleWarnings`（门槛软），transfer/swap/standby/cross-base 的 fleet 校验从 `reasons` 移到 `warnings`；swap 的双向匹配只保留 base+rank seat，fleet 单独告警（文案 `Fleet mismatch: Crew X is not qualified for aircraft type 7M8 (receives Pairing Y).`）。
  - `live-server/src/services/rule/legality-preview.ts`：`normalizePreviewViolations` 透出 8004 的 `operation_result.strType` → `dimension: BASE|RANK|FLEET`（不靠文案判断）。前端 `DraftLegalityPreviewResponse` 同步。
  - `recoveryRuleFailures` 返回 `{ failures, warnings }`；`8004 + dimension=FLEET` 进 warnings（不再过滤 option），BASE/RANK 与其它规则仍进 failures。
  - 弹窗：选项行 + Detail 用琥珀 ⚠ 显示 warnings；候选级告警存在时不再重复显示门槛级同义的 8004 FLEET 行。
- 验证（真实 9/16 场景，无 stub、无预置数据）：`e2e/tests/gantt/recovery-1001-flight-delay-crew-113.spec.ts` **4/4 PASS**（standby 可执行；swap 对真实候选 656/136152 可执行且显示机型告警；Flight Delay Apply；Swap Apply 4 条互换 op；Standby callout Apply 带 CALLOUT_STANDBY）。截图 `docs/assets/screenshots/crew-recovery/recovery-1001-*-Ver2/Ver3.png`。
- E2E 的 crew 过滤加了 `Base=YVR` 以绕开 dev_live 的重复 `roster_flight.id` 缺陷（Crew 113 的 MTG 被 Crew 73 同 id 行覆盖；Crew 73 是 YYZ），该数据缺陷仍建议单独修。
- gantt test hook 的 `roster()` 新增 `exceptionCode` / `isCalloutStandby` 两个字段，供断言渲染器同源数据。

## 当前工作树快照

### git status --short

```text
 M docs/modules/gantt/live-scenario-gantt-playbook.md
 M e2e/config/playwright.local.config.ts
 M gantt/src/components/recovery/recovery-violation-dialog.tsx
 M gantt/src/services/__tests__/recovery-draft.test.ts
 M gantt/src/services/__tests__/recovery-swap-duty.test.ts
 M gantt/src/services/draft-api.ts
 M gantt/src/services/recovery-candidates.ts
 M gantt/src/services/recovery-draft.ts
 M gantt/src/stores/draft-store.ts
 M live-server/src/routes/draft/draft-manday-swap.test.ts
 M live-server/src/routes/draft/draft.ts
?? docs/assets/screenshots/crew-recovery/recovery-1001-flight-delay-applied-Ver1.png
?? docs/assets/screenshots/crew-recovery/recovery-1001-flight-delay-options-Ver1.png
?? docs/assets/screenshots/crew-recovery/recovery-1001-swap-duty-applied-Ver1.png
?? docs/assets/screenshots/crew-recovery/recovery-1001-swap-duty-retained-Ver1.png
?? docs/superpowers/specs/2026-09-12-recovery-apply-swap-duty-and-flight-delay.md
?? e2e/tests/gantt/recovery-1001-flight-delay-crew-113.spec.ts
?? gantt/src/services/__tests__/recovery-flight-delay.test.ts
?? live-server/src/routes/draft/draft-edit-flight.test.ts
```

### unstaged changed files

```text
docs/modules/gantt/live-scenario-gantt-playbook.md
e2e/config/playwright.local.config.ts
gantt/src/components/recovery/recovery-violation-dialog.tsx
gantt/src/services/__tests__/recovery-draft.test.ts
gantt/src/services/__tests__/recovery-swap-duty.test.ts
gantt/src/services/draft-api.ts
gantt/src/services/recovery-candidates.ts
gantt/src/services/recovery-draft.ts
gantt/src/stores/draft-store.ts
live-server/src/routes/draft/draft-manday-swap.test.ts
live-server/src/routes/draft/draft.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-09-12-gantt-recovery-1001-apply-flight-delay.md`
3. `docs/superpowers/specs/2026-09-12-recovery-apply-swap-duty-and-flight-delay.md`
4. `docs/modules/gantt/live-scenario-gantt-playbook.md` §17

然后运行：

```bash
git status --short
```
