# Pre-flight: 代码现状 vs Recovery Refactor Prompt

> 基础：`pre-recovery-refactor-2026-09-07` tag @ `5b6f408`
> 范围：6 个核心文件 / 5013 行（gantt 前端 5 + live-server 后端 1）
> 状态：调研完成；**未写一行代码**
> 用途：你 review 后决定哪些 §2.x 做、哪些不做

## 阅读覆盖

| 文件 | 行数 | 读法 |
|---|---|---|
| `gantt/src/components/recovery/recovery-violation-dialog.tsx` | 738 | 全文 + apply() 实现细节 |
| `gantt/src/components/panes/violation-list-dialog.tsx` | 435 | 关键路径（isRecoverable、入口、选区） |
| `gantt/src/components/panes/shared/roster-pane.tsx` | 848 | Recovery 入口桥接（window event） |
| `gantt/src/services/recovery-candidates.ts` | 1260 | positioningFor / makeDhdItem / buildSingleRecoveryPlans / combineRecoveryOptions |
| `gantt/src/services/recovery-draft.ts` | 169 | buildRecoveryDraftPlan 全文 |
| `gantt/src/stores/legality-store.ts` | 212 | 全文 |
| `live-server/scripts/live-legality.mjs` | 1520 | 关键路径（SKIP_RUST、8004 adapter、Ruleset、is_valid） |
| `live-server/src/services/roster/roster-service.ts` | 1500+ | recoverCrossBaseRoster + recoverDestinationBaseRoster |
| `live-server/src/services/recovery/recovery-method-service.ts` | 238 | executeCrossBaseRecovery 全文 |
| `live-server/src/routes/recovery/recovery.ts` | 315 | crossBaseRecoverySchema + apply 入口 |
| `gantt/src/config/recovery-cross-base.ts` | 22 | DEFAULT_CROSS_BASE_RECOVERY_CONFIG |

## 状态符号

- **OK**：已实现且与 prompt 描述一致
- **DIFF**：实现存在但与 prompt 描述有差异（不一定是错，看你怎么裁决）
- **TODO**：未实现或部分缺失
- **N/A**：按你指示"暂不重构"
- **UI-LOCK**：与"UI 流程不变"约束冲突，必须先决策再动

---

## §2.1 入口与可恢复性

| 约束 | 实际代码 | 状态 |
|---|---|---|
| 唯一入口 Alert Center | `violation-list-dialog.tsx:105` 名为 `ViolationListDialog`（即 Alert Center）；Roster Pane Toolbar 嵌入；Live 顶层无独立 Violation 按钮 | **OK** |
| 浮显 Recovery 入口 | `roster-pane.tsx:233-247` 通过 `window` 自定义事件 `recovery:open` 桥接到 `RecoveryViolationDialog` | **OK**（与 prompt 一致；浮显是入口，不是第二套逻辑） |
| 入口不可恢复禁用 | `violation-list-dialog.tsx:87-88` `isRecoverable = ruleCode === '\''8004'\'' && pairingId != null && canRecover === true` + `notRecoverableReason` 文案 | **OK** |
| System → Interface 仅 OPS | 无 Alert Center 入口；`RecoveryViolationDialog` 只能由 Alert Center / 浮显 / 快捷键触发 | **OK** |
| Rule 无关 method 注册 | 当前只有 8004 / Cross-base / standby / swap / destination；接口预留 `/api/recovery/methods/*` (recovery.ts:65-70) | **OK**（已 Rule 无关） |

## §2.2 Ruleset 严禁硬编码

| 约束 | 实际代码 | 状态 |
|---|---|---|
| `LegalityStore.selectedId` 唯一来源 | `recovery-violation-dialog.tsx:243` `useLegalityStore((s) => s.selectedId)`；`legality-store.ts:13-17` 注释明确"nothing is hardcoded" | **OK** |
| 异步初始化等待 | `legality-store.ts:71-85` `init()` 拉 ruleset 列表 → `selectSet(first.id)`，`loaded` 标志防重复；`selectSet` line 86-108 触发 `setRuleGroup` + 立即重检 | **OK** |
| 完成 Ruleset 后重新查询 | `legality-store.ts:99-104` `if (items.length > 0) checkCrews(...)` 立即重检；line 95 `setRuleGroup` 清旧告警 | **OK** |
| 不得伪造空告警 | `legality-store.ts:108` `useRuleCheckStore.setRuleGroup(String(id))` 同步；UI 不显示"暂无告警"占位 | **OK** |

## §2.3 8004 数据源（缺一不可）

| 约束 | 实际代码 | 状态 |
|---|---|---|
| `pairing_segment.fleet_seg` 优先 + 回退航班/Pairing | `live-legality.mjs:1206` `coalesce(nullif(ps.fleet_seg, '\'''\''), nullif(f.fleet, '\'''\''), nullif(p.fleet, '\'''\''), '\'''\'')` | **OK**（完整回退链） |
| `crew_fleet.{fleet_specific, ac_type, fleet_grp}` | `live-legality.mjs:1235-1252` 三个 UNION ALL 查三列 | **OK** |
| `eff_dt/exp_dt` 判定（无 is_valid） | `live-legality.mjs:1230-1231` 注释明确；line 1238 实际查询不读 is_valid | **OK** |
| 缺任一适配器必须失败 | 适配器是 `liveSource` 的方法（line 1202/1232），未发现"无 fleet 时伪造成功"的兜底；line 1198-1201 注释明确"成功但悄悄不查"会被发现 | **OK** |

**注**：其他 4 个 `is_valid=1` 引用（line 545/862/870）属于 `active_crew` / `crew_qual` / `crew_team` 表，**不是** `crew_fleet` —— 与 prompt 描述一致。

## §2.4 本地 Rule Server（**暂不重构**）

按你指示：暂不解决"删 SKIP_RUST_BINS 与原有功能冲突"。当前 `live-legality.mjs:29/94 rustBinsSkipped()` + `resolveLiveRecomputeCodes(onlyCodes, skipRust)` + `console.warn` (line 1427) 完整保留。**N/A**

## §2.5 Apply 语义

| 约束 | 实际代码 | 状态 |
|---|---|---|
| `Apply` 写 Gantt Draft，不调后端 | `recovery-violation-dialog.tsx:401-442` `apply()`: `buildRecoveryDraftPlan` → `acquireLocks` → 循环 `addDraftOp` → `recomputeDraftPane` → `clearPreview` | **OK** |
| `/api/recovery/apply-option` 仅前向兼容 | `recovery.ts` 有 `legacyApplyOptionSchema` (line 80) + 旧 demo 路由；但 `recovery-violation-dialog.tsx` 全文未引用 `/api/recovery/apply-option` | **OK** |
| `Save` / `Ctrl+S` 走 Gantt 既有链路 | `apply()` line 431 `recomputeDraftPane('\''main'\'')` 触发 Gantt Draft 状态；`Save` 由 Gantt 自身处理（未在 dialog 内） | **OK** |

**注意**：`apply()` 包含 `acquireLocks` (line 410) — prompt §2.5 未提 lock 行为，但 lock 是当前实现的关键步骤（防并发），属于"原有功能"不能删。

## §2.6 候选范围与过滤

| 约束 | 实际代码 | 状态 |
|---|---|---|
| 候选仅用已加载 Roster/Pairing/Crew/任务/SBY | `recovery-candidates.ts:192-217` `buildGroups` 从 `input.items` 构造；line 822 `buildSingleRecoveryPlans` 取 `input.items`；`recovery-violation-dialog.tsx:262-263` `items = useMemo(() => uniqueItems([...mainItems, ...subItems]))` | **OK** |
| 模拟 Rule 失败候选从可选项移除 | `recovery-candidates.ts:262-291` `recoveryRuleFailures` 函数；line 638 `affectsFirstFollowing` 排除后续冲突；具体 Apply 时的可执行判断在 `recovery-violation-dialog.tsx:402` `executionOption.localExecutable && ruleCheck === '\''passed'\''` | **OK** |
| 资格按完整 Roster 精确匹配 | `recovery-candidates.ts:305-313` `qualifiesForFleet` 字符串相等比较 | **OK** |
| `Roster end < Now()` 不生成 | `recovery-candidates.ts:219-227` `isRosterCompleted`；line 824 `activeGroups = groups.filter((group) => group.end >= now)` | **OK** |
| `Roster end == Now()` 视为未完成 | line 824 `>= now` 包含等于 | **OK** |
| 范围内无候选明示 | `recovery-violation-dialog.tsx` 中需 review 是否显示 "no candidates" 提示（未细看，**TODO** 待 verify） | **TODO** |

## §2.7 基础方案业务规则（方案一 / 方案二）

| 约束 | 实际代码 | 状态 |
|---|---|---|
| 方案一 直接转移 `Deassign + Assign` Draft | `recovery-draft.ts:118-122` `remove-pairing-from-crew(source) → assign-pairing(target)` | **OK** |
| 方案一 双向交换 Draft | `recovery-draft.ts:124-136` 双方各一次 `remove` + `assign` | **OK** |
| 排名降级规则 `crewRankOrder <= requiredRankOrder` | `recovery-candidates.ts` 未直接读 `crewRankOrder` 数字（用 Rank 名称），具体逻辑在 `qualifiesForFleet` 之外，**TODO** 待 verify | **TODO** |
| 时间相邻排序 `\|Δ start\|` 升序 | `recovery-candidates.ts:733-751` `sortedCrewCandidates` 排序逻辑 | **OK**（实现存在） |
| Callout Standby SBY 边界包含 | `recovery-candidates.ts:806-818` `crewFreeForPositioning` 用 `timeRangesOverlap` 包含边界；后端 `roster-service.ts:1031` `startMs(standby.schStrDtUtc) > sourceStart` 含等 | **OK** |
| 保留原 SBY 任务 | `roster-service.ts:1087` `tx.update(rosterFlight).set({ exceptionCode: '\''CALLOUT_STANDBY'\'' })` —— 不是删除，是加 exceptionCode | **OK** |
| 一个 Roster 仅一个 SBY Crew | UI 上 `selectedOption` 唯一性 + 后端 `assignPairing` 单次插入 | **OK** |
| Callout 例外仅豁免匹配 SBY | 后端 `roster-service.ts:1021` `if (row.assignmentGroup === '\''SBY'\'') return false` —— SBY 任务不参与冲突检查 | **OK** |

## §2.8 Preview 双入口等价

| 约束 | 实际代码 | 状态 |
|---|---|---|
| Detail 内"在 Live Gantt 中预览"与方案卡 `Preview` 同一渲染器 | `recovery-violation-dialog.tsx` 全文搜：需 verify 两个入口是否共享 `setPreview` (line 245) | **TODO** 待 verify |
| 切换选项清除旧预览 | `recovery-violation-dialog.tsx:432-434` `clearPreview() + setPreviewedOptionId(null)` 在 apply() 末尾；切换时需 verify | **TODO** |

## §2.9 方案卡 = 方法选择区

| 约束 | 实际代码 | 状态 |
|---|---|---|
| 整块可点击方案卡 | `recovery-violation-dialog.tsx:595-678` `PlanGroup` 组件 + `planTone` 配色 | **OK** |
| 候选区独立滚动 | dialog 内多 section，**TODO** 待 verify 布局 | **TODO** |
| 方案切换/勾选/Detail/Preview 同步 | `selectedOption` (line 266) + `executionOption` (line 270) 派生 + `useEffect` 同步 | **OK** |

## §2.10 方案三 Cross-base（**与 prompt 子方式 1 冲突**）

**冲突点**：prompt §2.10 方案三子方式 1 要求"Duty 内新增 DHD 航段（不创建独立半环 Pairing）"。当前实现是 prompt §2.10 顶部概述中提到的"原 7.3.1 三个独立操作" — 通过 `createDhdPairing` 创建**独立**半环 Pairing。

| 约束 | 实际代码 | 状态 |
|---|---|---|
| Cross-base 是本期纳入 | `recovery-candidates.ts:133 crossBase: RecoveryPlanGroup` + UI 展示 `plans.crossBase` | **OK**（作为单独 group） |
| 子方式 1 在 Duty 内插 DHD | `makeDhdItem` (line 388) + `makeDhdItems` (line 451) 创建**独立** RosterItem，有独立 `syntheticId` (line 379-386)、`dutySeq: 1, segSeq: 1`、新 Pairing（半环） | **UI-LOCK**（与 prompt 冲突） |
| 子方式 2 复用首尾 DHD | `recoverDestinationBaseRoster` (roster-service.ts:1108+) + `destinationSplit` schema | **OK** |
| DHD 间隔 2-6h | `DEFAULT_CROSS_BASE_RECOVERY_CONFIG` (recovery-cross-base.ts): `minFlightLeadHours: 2, reserveBeforeHours: 2, returnAfterHours: 1` —— 只有**下限 2h**，**没有上限 6h** | **DIFF**（无 6h 上限） |
| Acting Rank 动态继承 | `recovery-draft.ts:124, 145` `actingRankFor(items, ...)`；后端 `roster-service.ts:1039` `data.rosterActingRank \|\| sourceRows[0]?.rosterActingRank \|\| sourceRows[0]?.flightActingRank` | **OK** |
| `plan=1` 改原 / `plan>1` 建新 | 后端 `destinationSplit.createsPairing` 标志（line 90 schema）；具体 plan 决策在 `recoverDestinationBaseRoster` | **OK**（依实现，**TODO** 细看） |
| 成本：方案 2 扣除 DHD | `recoverCrossBaseRoster` 不显式计算成本；前端 `recovery-candidates.ts:643` `directCost` 与 DHD 关联 | **DIFF**（具体算法需细看） |

**`createDhdPairing`（roster-service.ts:1060-1083）** 注释：`'\''Cross-base Recovery DHD half-ring'\''` — **明确说"half-ring 半环"**，与 prompt"不创建独立半环 Pairing"是**直接矛盾**。

## §2.11 综合恢复

| 约束 | 实际代码 | 状态 |
|---|---|---|
| 顶层 Option = 完整 Crew 组合 | `recovery-candidates.ts:1183-1233` `combineRecoveryOptions` + `combineRecoveryMetrics` | **OK**（实现存在） |
| 同一 (源 Roster, 目标 Crew) Option 内唯一 | 需 verify `combineRecoveryOptions` 逻辑 | **TODO** |
| KPI 排序（成本→稳定性→后续任务→年度飞时） | `recovery-candidates.ts:767` `sortedCrewCandidates` 排序键：`directCost → sameRank → sameBase → followOnImpactCount → annualFlightMinutes → timeDistanceMinutes`（升序最便宜的排前，rank 优先 stable cost 平衡，决策 D1 已补 directCost） | **OK** |
| 子方案仅作明细 | `recovery-violation-dialog.tsx:405-407` `subOptions?.length ? subOptions : [executionOption]` —— Apply 时递归子方案 | **OK** |
| Draft 递归覆盖全部子方案 | `recovery-draft.ts:24-32` `option.subOptions?.length` 递归 | **OK** |

## §2.12 接口/事务/日志/安全

| 约束 | 实际代码 | 状态 |
|---|---|---|
| 跨表写同事务 | `recoverCrossBaseRoster` line 961 `fastify.db.transaction(async (tx) => { ... })` 包裹；`recoverDestinationBaseRoster` 同 | **OK** |
| 事务外缓存失效不反写 | `recoverCrossBaseRoster` line 1098-1104 缓存 invalidate + composition fill refresh 显式 `.catch` 记日志，**不抛** | **OK** |
| 错误统一 `code/data/message` | `recovery.ts:62-68` `mutationResponse`；`recovery.ts:100-104` 等错误用 `Object.assign(new Error, { statusCode })` | **OK** |
| 审计字段 | `recoverCrossBaseRoster` line 1037/1046/1062/1068/1076 全部 `auditUpdate/auditCreate` | **OK** |
| 不提供 Recovery 回滚接口 | `recovery.ts` 全文未发现 rollback / undo-recovery 路由 | **OK** |
| 前端 `localExecutable` 交互保护 | `recovery-violation-dialog.tsx:402` 校验；line 448-450 快捷键再校验 | **OK** |
| 参数化 SQL | `live-legality.mjs` 全文 `$1::varchar[]` 参数化 | **OK** |

## §2.13 UI/性能/索引

| 约束 | 实际代码 | 状态 |
|---|---|---|
| `@rois/ui` `AppDialog` 业务弹窗 | `violation-list-dialog.tsx:3` `import { AppDialog, Button } from '\''@rois/ui'\''` | **OK** |
| UI 文案英文 | `violation-list-dialog.tsx:92-94` 英文 `"Only Rule 8004 alerts are recoverable (this is " + row.ruleCode + ")."` 等 | **OK** |
| 样式 token + `check:ui` | 需 verify 引入 globals.css；`check:ui` 未跑 | **TODO** |
| 首屏 1-2 秒 | 需 Playwright 验证 | **TODO** |
| 单批失败最多重试一次 | 需 verify 是否有递归二分并发重试 | **TODO** |
| 必备索引 | `live-legality.mjs` 全文未声明索引（属于部署配置） | **TODO** |
| `scenario/run-health` Scenario 页面活跃才轮询 | 需 verify 是否有该轮询 | **TODO** |

## §2.14 不在本期范围

| 约束 | 实际代码 | 状态 |
|---|---|---|
| 不删/替 Rule Engine | 无 | **OK** |
| 不重启用顶层 Recovery 菜单 | 无 | **OK** |
| 不通知 Crew | 无 | **OK** |
| 不支持撤销/回滚 | 无 | **OK** |

---

## 关键决策点（需要你拍板）

### 决策 A：Cross-base 算法（**UI-LOCK**）

当前实现是"独立半环 Pairing"（7.3.1 原方案）。prompt §2.10 方案三子方式 1 要求"Duty 内插 DHD 航段"。

**冲突影响**：
- **算法**：后端 `recoverCrossBaseRoster` + 前端 `makeDhdItem` 整套逻辑要改
- **UI 流程**：用户当前看到的"方案三 → 选 standby/swap/destination 子模式"流程可以保持（用户不知道底层是独立半环还是 Duty 内插）
- **Roster 行为**：独立半环 Pairing 是新 PairingID + 新 RosterID；Duty 内插是修改原 Roster 的航段序列（不创建新 Pairing）
- **Pairing Pane 展示**：当前 `cross-base-recovery` Draft operation 后 Pairing Pane 显示 `Created`（独立半环）；Duty 内插则显示 `Modified`

**3 选项**：
1. **保持现状（7.3.1 三类子模式 + 独立半环）** —— prompt §2.10 方案三子方式 1 改写为"独立半环"（与现状一致）
2. **改算法为 Duty 内插 DHD** —— prompt §2.10 方案三子方式 1 严格执行，需要改前端 `makeDhdItem`、`positioningFor`、后端 `recoverCrossBaseRoster` + UI 文案（Created → Modified）
3. **暂停决策，先做其他** —— 跳过 §2.10 不重构

### 决策 B：DHD 间隔 6h 上限

prompt §2.10 方案三子方式 1："DHD 间隔 2-6 小时（**不得 < 2h 含地面操作，不得 > 6h 避免长待命**）"。

当前 `DEFAULT_CROSS_BASE_RECOVERY_CONFIG` 只有下限 2h，无上限 6h。`recovery-violation-dialog.tsx` 内有"Recovery dialog 中可编辑"，意味着用户可以手动调参。

**3 选项**：
1. **保持现状（无上限）** —— 与 prompt 部分一致
2. **加 6h 上限** —— 改 `DEFAULT_CROSS_BASE_RECOVERY_CONFIG` + UI 编辑器
3. **暂停决策**

### 决策 C：方案一 Rank 降级规则

prompt §2.7："同 Rank 优先，只允许同 Rank 或更高 Rank Crew 降级执行较低 Rank 任务（`crewRankOrder <= requiredRankOrder`）"。

当前 `recovery-candidates.ts` 用 `qualifiesForFleet` 检查 fleet 资格，但**未明确**检查 Rank 降级规则。**TODO 待 verify**。

### 决策 D：哪些 TODO 项真要补

§2.6/§2.8/§2.11/§2.13 中多个 **TODO** 项需要跑代码或测试才能定。

---

## 建议下一步

按你"A = 先读后改，不写一行代码"指示完成。建议你 review 这份对照表后：

1. 选 Cross-base 算法（决策 A）
2. 选 DHD 间隔上限（决策 B）
3. 确认哪些 TODO 项要补
4. 告诉我从哪条 §2 约束开始改

我不会在没有明确指示的情况下动任何代码。
