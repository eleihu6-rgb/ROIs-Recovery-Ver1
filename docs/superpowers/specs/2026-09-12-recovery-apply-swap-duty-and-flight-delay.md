# Rule 1001 Recovery — Apply 接入（Swap duty）+ Flight Delay 改造实录

> 项目：ROIS Recovery · Crew Roster Recovery
> 日期：2026-09-12
> 前置：`docs/superpowers/specs/2026-09-11-swap-duty-and-flight-delay-recovery-design.md`（上一轮只做 GUI，D8 明确「本轮两个新方案都不挂 Apply」）
> 范围：Gantt Live Recovery —— 1001（Assignment Overlap）三方案接入 Apply；Flight Delay 方案按需求 2.1–2.4 改造

## 1. Scope

1. 1001 触发的 **Standby Crew callout** 保持原样（本来就可 Apply）。
2. 1001 触发的 **Swap duty** 接入 Apply：复用既有 swap 落地链路（两个 crew 各 `remove-pairing-from-crew` + `assign-pairing`），复用 `useLockStore.acquireLocks` 与 `ruleCheck` 本地规则预检；双向 base/fleet/rank-seat 不匹配的候选仍保留在列表但不可执行。
3. **Flight Delay** 改造（只影响该方案，其它方案一律不动）：
   - 方案行首列标题由 `Crew / option` 变为 `Flight`；
   - 列出受影响 Pairing 的全部航段：航班号、起飞站、落地站、STD、STA、ATD、ATA；
   - 去掉该方案的执行勾选框；
   - Apply 对该选项里的所有航段执行航班时间编辑（`edit-flight`），把 ATD/ATA 延后到「地面任务结束 + 1:01」。
4. 8004 的原有方案集（roster / standby / cross-base / mixed）完全不变。

## 2. 关键事实（已核实）

- Apply 语义（来自 `docs/requirements/crew-roster-recovery-requirements.md` §4.1）：只把方案写进**未保存的 Gantt Draft** 并立刻刷新甘特；落库仍走 Gantt 自己的 Save / Ctrl+S。本轮不破坏该约束。
- 现有 Draft op 联合类型（`gantt/src/services/draft-api.ts`）没有航班时间编辑；Gantt 里编辑航班时间的既有链路是 `PUT /api/flight/:id`（`flightService.update` → `propagateFlightChange`，同步 `pairing_segment` + `roster_flight` 并在同一事务内重算 duty 窗口）。本轮把这条链路包装成 Draft op `edit-flight`，因此 §Flight-Change-Ripple-Required 的连锁语义由既有代码保证。
- 真实数据（内网 `dev_live`，2026-09-16，Crew 113）：
  - 地面任务 `roster_flight#258` ADM/MTG `14:00Z–15:00Z`（`pairing_id` 为空）；
  - Pairing `136149`（V4127）：`#259` 1888 YVR-LAX `14:50Z–17:45Z`（fltId 78053）、`#260` 1889 LAX-YVR `18:30Z–21:30Z`（fltId 78059）；
  - 地面任务与首段重叠 → 1001，正是 Flight Delay 的典型场景。
- 回归场景：Crew 113 / 2026-09-08 / Pairing 135672 是「已结束 Roster 的 1001」。

## 3. 待确认口径的落地假设（需求方要求先确认，本轮按最小改动实现并把假设固化在此）

需求原文只给了一句：「把 ATD / ATA 都延后到『地面任务结束时间 + 1:01』开始」，并让实现方确认两点。本轮采用如下口径，**若需求方口径不同，只需改 `planFlightDelay()` 一处**：

| # | 问题 | 本轮口径 | 理由 |
|---|---|---|---|
| A1 | 「+1:01」的含义 | 地面任务结束时刻 **+ 61 分钟**（1 小时 1 分钟）作为最早的 ATD | 字面读法；常量 `FLIGHT_DELAY_GAP_AFTER_GROUND_TASK_MINUTES = 61` |
| A2 | 地面任务已早于某航段原计划时间 / 航段间隔如何处理 | **两重下限 + 间隔保持**：① 每个航段的新 ATD 不会早于它**原本的 ATD**（延误不产生「提前」）；② 第 i 段的新 ATD 还要 ≥ 前一段新 ATA + **原本的段间间隔**（原 `ATD_i − ATA_{i-1}`，负间隔按 0 计）；新 ATA = 新 ATD + 原 block 时长 | 若所有航段简单地压到同一个 ATD，同一 duty 内航段会互相重叠、pairing 结构被破坏；保持原间隔既满足「延后到 X 开始」，又不改变 pairing 的合法性形状 |

推论（需知晓）：如果配对整体在 `delayStart` 之前就已结束，则没有任何航段需要延后 → 该选项标记为不可执行并给出原因，不产生空操作。

## 4. 设计决策

| # | 决策 | 理由 |
|---|---|---|
| D1 | Swap duty 复用既有 swap 语义：源 pairing 与候选 pairing 互换，落地为 4 条 Draft op（2×remove + 2×assign） | 与 `D5/D8`（上一轮设计）一致，后端仍走 `/api/recovery/methods/roster-assignment` 的 `swap` 语义 |
| D2 | Swap duty 的 `localExecutable` / `ruleCheck` 与既有多 crew 方案对齐：无硬性冲突时 `ruleCheck='pending'` → 弹窗跑 `legalityPreviewApi.checkDraft` → 通过才可 Apply | 需求要求「与现有方案保持一致」 |
| D3 | `recoveryRuleFailures` 的「双向锚点」判定把 `swap-duty` 视同 `swap` | swap duty 也是双向互换，只锚定一个方向会漏掉源 crew 收到候选 pairing 后的新违规 |
| D4 | 弹窗规则预检的 pending 集合加入 `swapDuty` 组 | 否则 1001 的 swap duty 永远停在 `pending`，Apply 永远禁用 |
| D5 | Flight Delay 不做本地规则预检（`ruleCheck='not-run'`），`localExecutable` 只取决于「是否存在真实需要延后的航段」 | 该方案不改 crew 归属；真正的连锁校验由 Save 时的既有航班编辑链路完成 |
| D6 | Flight Delay 无勾选框：选中 Flight Delay 分组（左侧 PlanTree / 分组标题）即把该组唯一选项设为本次执行对象；切走时清空 | 需求 2.3「不需要勾选」，同时避免跨分组的陈旧选择 |
| D7 | 新增 Draft op `edit-flight`，一次携带该 Pairing 全部航段的 4 个时间戳 | 一个 undo 步骤、一次提交；后端沿用 `flightService.update` 的重算与通知 |
| D8 | Flight Delay 的航段来源优先取 Pairing 段快照（`PairingItem.segments`，来自 `pairing_segment`），缺失时回退到 Roster 行 | 已结束 Roster 的 1001 场景里 pairing 可能不在当前加载窗口，回退保证方案不空 |
| D9 | Flight Delay 的 `afterItems` / `changes` 反映延后后的 ATD/ATA | 让 Preview 与 Detail 与 Apply 结果一致 |

## 5. 影响模块

| 文件 | 改动 |
|---|---|
| `gantt/src/services/recovery-candidates.ts` | 新增 `RecoveryFlightDelayPlan` / `RecoveryPairingSegmentSnapshot` 与 `planFlightDelay()`；swap-duty 变为可执行；Flight Delay 生成延后计划 |
| `gantt/src/services/recovery-draft.ts` | swap-duty 走完整互换；flight-delay 产出 `edit-flight` |
| `gantt/src/services/draft-api.ts` | `DraftOp` 增加 `edit-flight` 与 `flightTimes` |
| `gantt/src/stores/draft-store.ts` | `applyDraftOps` / 无锁提交路径支持 `edit-flight` |
| `gantt/src/components/recovery/recovery-violation-dialog.tsx` | 徽标、执行选择、Apply 门禁、Flight Delay 的 `Flight` 列与航段表 |
| `live-server/src/routes/draft/draft.ts` | `edit-flight` op 落到 `flightService.update`（复算 + 通知） |

## 6. 验证

- 单测：`planFlightDelay` 的 +61min / 不提前 / 间隔保持 / 无需延后；swap-duty 的 Draft op 形状；flight-delay 的 `edit-flight` 形状。
- 真机 UI（Playwright，真实内网库）：Crew 113 / Pairing 136149 → 1001 三方案 → Flight Delay 列显示两段航班 → Apply → 甘特上 ATD/ATA 已按 +1:01 与间隔保持延后，且配对内其它未受影响航段不变。
- 截图：`docs/assets/screenshots/crew-recovery/`（同名功能重复验证时按 `-Ver<N>` 递增）。

## 7. 落地记录（2026-09-12 实做）

### 7.1 实现

| 文件 | 改动 |
|---|---|
| `gantt/src/services/recovery-candidates.ts` | 新增 `RecoveryFlightDelayPlan` / `RecoveryFlightDelaySegment` / `RecoveryPairingSegmentSnapshot` 与纯函数 `planFlightDelay()`（+61min、不提前、间隔保持）；`makeOption` 让 swap-duty 与其它方案一样走 `localExecutable` + `ruleCheck='pending'`，Flight Delay 走 `localExecutable` + `ruleCheck='not-run'`；Flight Delay 的 `afterItems` / `changes` 反映延后后的 ATD/ATA；`recoveryRuleFailures` 把 swap-duty 也当作双向互换 |
| `gantt/src/services/recovery-draft.ts` | swap-duty 走完整互换（2×remove + 2×assign）；flight-delay 产出单条 `edit-flight` |
| `gantt/src/services/draft-api.ts` | `DraftOp` 新增 `edit-flight` + `flightTimes`（`FlightTimeEdit`） |
| `gantt/src/stores/draft-store.ts` | `applyDraftOps` / 无锁提交路径支持 `edit-flight`（复用 `flightApi.updateTimes`） |
| `gantt/src/components/recovery/recovery-violation-dialog.tsx` | 徽标、执行选择（`planTypeForMode`）、Apply 门禁（`isApplicableOption`）、规则预检 pending 集合加入 swap-duty、Flight Delay 的 `Flight` 列与航段表、切到 Flight Delay 分组时自动成为 Apply 目标（离开即清空） |
| `live-server/src/routes/draft/draft.ts` | `edit-flight` op 落到既有 `flightService.update`（含 `pairing_segment` / `roster_flight` 连锁、缓存失效、Manday 复算窗口来源） |

### 7.2 需求方两个待确认口径（落地假设）

见 §3：①「+1:01」= 地面任务结束 + **61 分钟**；② 采用「不提前 + 段间间隔保持」两重下限（等同整条 pairing 按 delta 平移，且任何航段都不早于原 ATD）。若需求方口径不同，只改 `planFlightDelay()` 一处。

### 7.3 验证（实际命令 + 结果）

| 验证 | 命令 | 结果 |
|---|---|---|
| gantt 类型检查 | `gantt: node_modules/.bin/tsc.CMD -b` | PASS（无输出） |
| gantt Recovery 单测 | `vitest run src/services/__tests__/recovery-{flight-delay,swap-duty,draft,candidates,trigger}.test.ts src/stores/__tests__/recovery-preview-store.test.ts` | PASS 71/71 |
| live-server 类型检查 | `live-server: tsc -p tsconfig.json --noEmit` | PASS |
| live-server draft 路由测试 | `vitest run src/routes/draft/draft-edit-flight.test.ts src/routes/draft/draft-manday-swap.test.ts` | PASS 6/6 |
| 真机 UI（Playwright） | `e2e: npx playwright test --config=config/playwright.local.config.ts tests/gantt/recovery-1001-flight-delay-crew-113.spec.ts --reporter=list` | PASS 3/3 |

截图（均来自同一次 Playwright 运行，`docs/assets/screenshots/crew-recovery/`）：

- `recovery-1001-flight-delay-options-Ver1.png`：三方案 + Flight 列 + 两段航班 STD/STA/ATD/ATA（含延后值）+ 无勾选框 + Apply 可用。
- `recovery-1001-flight-delay-applied-Ver1.png`：Apply 后“已写入未保存草稿”的提示与甘特刷新。
- `recovery-1001-swap-duty-retained-Ver1.png`：真实数据下 swap-duty 候选“保留但不可用”（Blocked、勾选框禁用）。
- `recovery-1001-swap-duty-applied-Ver1.png`：swap-duty Apply 后两侧 pairing 互换（草稿）。

### 7.4 遗留问题与数据限制（本次实测发现，均非本次改动引入）

1. **`dev_live.roster_flight` 存在重复 `id`（无主键约束）**，例如 Crew 113 的 MTG 行 `id=258` 与 Crew 73 的 ADM 行 `id=258` 同日并存。前端以 `id` 为键合并（`loadRosterBatched` 的 `Map`、store 的 `patchItems`/`replaceCrewItems`），重复 id 会让其中一行被覆盖 → 受影响机组的 1001 入口静默失效（实测 Crew 113 / Pairing 136149 的 Alert Center 行 `data-recoverable="false"`，原因正是地面任务行被覆盖）。**本次 E2E 因此改用无窗口内冲突的 Crew 113 / Pairing 135672（2026-09-08）。** 建议后续单独修数据（补主键/重发 id）或在客户端按复合键合并。
2. **当前演示数据不存在“双向机队相容”的 swap-duty 候选**：候选机队为 7M8，而 Crew 113 只有 737 资格，双向互换必然新建 8004 违规 → 本地规则预检正确地把它过滤为不可执行。E2E 因此用「预置一个无冲突候选 + stub 掉本地预检」来证明 Apply 接线，并在用例与注释中明示；真实数据下的“保留但不可用”契约由 `recovery-1001-swap-duty-retained-Ver1.png` 覆盖。
3. gantt 全量 vitest 仍有 14 个与本次改动无关的历史失败（例如 `no-store-imports.guard`、`draft-store-pairing-undo`（mock 缺 `setDraftRecomputeCallback`）、`gantt-colors-perf` 等）；已用 `git stash` 单文件回退确认 `draft-store-pairing-undo` 的失败在改动前就存在。

## 8. 追加修复（2026-09-12 第二轮）：Callout SBY 被 1001 拦截

**用户反馈**：Crew 113 / 2026-09-16 的 SBY callout 与 Swap 方案都无法选中，提示「任务重复」。

**用真实数据复现（还原弹窗的 `checkOption` 预检）**，得到每个 option 的真实拦截原因：

| Option | 预检返回的失误项（received 锚点） |
|---|---|
| Standby → Crew 529 / 136149 | `1001/001 ASBY × FLY`（Callout 保留的 SBY 与收到的 pairing 重叠）+ `3007/001 FDP 07:55 > 01:00` |
| Swap duty → Crew 656 / 136152 | `8004/002`（113 与 656 都是 737，收到 7M8 pairing）×2 + `3007/001 FDP > 01:00` ×2 |

**根因 1（真 bug，已修）：Callout SBY 被当作竞争任务。** Recovery 的 Callout Standby 会保留原 SBY 行并标记 `exception_code='CALLOUT_STANDBY'`（渲染器据此画黄色 C），但规则 1001 的 overlap 时间线仍把它当成一次竞争分配，于是「Recovery 自己制造的这一次重叠」反而挡住了方案 —— 与需求 §7.2「除明确允许的 Callout SBY 任务外…」矛盾。

修复分两处：

1. `live-server/scripts/{live-legality,scenario-legality,scenario-legality-source}.mjs`：1001 的 `assignmentOverlapRosters()` ground 分支排除 `exception_code='CALLOUT_STANDBY'` 的行（**修的是保存后的实时 recheck**，因为执行期拿的是数据库真值）。
2. `gantt/src/services/recovery-candidates.ts`：`buildAfterItems` 给保留的 SBY 行同时写 `exceptionCode='CALLOUT_STANDBY'`（与 Save 写入的值一致）；`recoveryRuleFailures` 新增 `calloutStandbyWindow` 契约，放行**窗口完全落在保留 SBY 任务窗口内**的 1001 违规，其余（更长的 SBY、第二个任务）照旧拦截。弹窗 `checkOption` 传入该窗口。

> 为什么门槛侧也要改：草稿预览 overlay 只替换 Pairing 行（`resolvePreviewRosterOverlay` 的 `mode='pairing'`），地面行仍取自数据库副本，因此 `exception_code` 传不进引擎 —— 这一层必须显式表达需求里那一条「允许的例外」。

验证：单测 `recovery-candidates.test.ts` 新增 2 例（放行 callout 重叠、保留非 callout 的 1001）+ 1 例断言 afterItems 带 `CALLOUT_STANDBY`；`live-server/scripts/__tests__/assignment-overlap-rosters-sql.test.mjs` 新增 live/scenario/seed 三处「必须排除 CALLOUT_STANDBY」断言；用真实数据重跑预检：standby 的拦截原因只剩 3007（ASBY×FLY 消失）。

**根因 2（数据/规则参数，未改）：demo ruleset 的 `3007/001 MAX FDP = 01:00`。** 该参数让**任何**超过 1 小时的 duty 都产生 3007；于是在收到 anchor 上，「新」的 3007 会把**所有会分配 pairing 的方案**（standby / swap / roster / cross-base）全部过滤掉。这是 demo 规则集里的参数状态（疑似规则参数测试遗留），需业务确认后调整（例如改回 13:00）—— 改参数影响整个 demo 环境的告警量，本次未擅自修改。

**根因 3（数据，未改）：Crew 113 只有 737 资格，而窗口内 YVR/P pairing 都是 7M8**，所以任何 swap 都会在两侧新建 8004 → 本地预检正确拦截。要让 swap 在真机上可执行，需要一对机队相容的 crew×pairing 数据（或给 113 补 7M8 资格）。

## 9. 追加决策（2026-09-12 第三轮）：机型限制改为软约束

需求方决定：**机型（fleet）不符合不再是硬拦截** —— 候选要出现、要能被选中，但必须把「机型不符」显示出来。基地（base）、rank seat 与任务冲突仍保持硬拦截。

| 层 | 改动 |
|---|---|
| 候选生成 `recovery-candidates.ts` | transfer / swap / standby / cross-base(destination·standby·direct) 的 fleet 校验从 `reasons`（硬）移到新的 `warnings`（软）；swap 的「return pairing 双向匹配」只保留 base + rank seat，fleet 单独出告警；文案统一 `Fleet mismatch: Crew <id> is not qualified for aircraft type <fleet> (receives Pairing <id>).` |
| 预览维度透传 | `live-server` 的 `normalizePreviewViolations` 把 8004 的 `operation_result.strType`（`BASE`/`RANK`/`FLEET`）透出为 `dimension`；`DraftLegalityPreviewResponse` 同步。避免用文案判断机型/基地。 |
| Apply 预检门槛 `recoveryRuleFailures` | 返回值改为 `{ failures, warnings }`：`8004 + dimension='FLEET'` 进 `warnings`（不再过滤该 option），`BASE`/`RANK` 与其它规则照旧进 `failures`。 |
| 弹窗 | 新增 `RecoveryOption.warnings`（候选级）与 `ruleWarnings`（门槛级），选项行与 Detail 弹窗用琥珀色 ⚠ 显示；当候选级告警已存在时，门槛级重复的 8004 FLEET 行不再重复展示（候选级更具体、带 crew+pairing）。 |

验证（真实 9/16 场景，未用 stub、未预置数据）：`e2e/tests/gantt/recovery-1001-flight-delay-crew-113.spec.ts` 4/4 PASS ——

1. 三方案齐全；**standby 可执行**（callout SBY 例外生效）；**swap duty 对真实候选 Crew 656 / Pairing 136152 可执行**并显示机型不符；Flight Delay 列与延后值正确；
2. Flight Delay Apply → 单条 `edit-flight` + 甘特 ATD/ATA 同步；
3. Swap duty Apply → 4 条互换 op + 两侧 roster 互换（尽管机型不符）；
4. Standby callout Apply → remove + assign + `update{exceptionCode:'CALLOUT_STANDBY'}`，保留的 SBY 行在该草稿里就是 callout（test hook 新增 `exceptionCode`/`isCalloutStandby` 字段以便断言渲染器同源数据）。

截图：`recovery-1001-swap-duty-fleet-warning-Ver3.png`（Executable + 机型告警文案）、`recovery-1001-flight-delay-options-Ver3.png`；Apply 结果见 `*-applied-Ver2.png`。

> E2E 的 crew 过滤额外加了 `Base = YVR`：dev_live 里 Crew 113 的 MTG 行与 Crew 73 的行 `id` 重复（见 §7.4），客户端按 id 合并会吞掉 Crew 113 的地面任务；Crew 73 是 YYZ 基地，加 base 过滤即可保持场景数据完整。这条数据缺陷仍建议单独修。
