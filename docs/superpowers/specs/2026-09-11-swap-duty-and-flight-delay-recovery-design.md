# Swap Duty + Flight Delay Recovery Options — Design

> 项目：ROIS Recovery · Crew Roster Recovery
> 日期：2026-09-11
> 范围：Gantt Recovery 新增「Swap duty」「Flight Delay」两个方案；新增 Assignment Overlap（Rule 1001）恢复入口

## 1. Scope

新增两项恢复能力，并让 1001（Assignment Overlap）告警也能进入 Recovery：

1. **Swap duty** — 把被恢复的飞行 pairing 与另一名 crew 的 pairing 互换；候选 pairing 必须 report 更晚。
2. **Flight delay** — 保留原 crew，只展示受影响 pairing 的全部航班。
3. **新触发条件** — crew 存在「地面任务 × 飞行 pairing 重叠」且有 Rule 1001 告警时可触发 Recovery。
4. **方案顺序** — 命中新触发条件时，方案按 `standby crew callout → Swap duty → Flight Delay` 依次展示。

## 2. 关键事实（已核实）

- 现有 Recovery 只认 Rule `8004`：`canRecover` 在 4 处独立计算（`live-gantt-source.ts`、`recovery-violation-dialog.tsx`、`violation-list-dialog.tsx`、`shared/roster-pane.tsx`），条件都是 `ruleCode === '8004' && !isRosterCompleted(...)`。
- Rule `1001` 是 **Assignment Overlap**：同 crew 两个任务重叠、且参数矩阵里没有 `Overlap=Y` 例外时产生违规（见 `sql/seed/07-rule.sql`、`docs/superpowers/specs/2026-07-08-assignment-overlap-rule-1001-design.md`）。因此「地面任务与飞行 pairing 重叠」正是 1001 的典型场景。
- 方案分组目前是 `roster | standby | cross-base | mixed`（`RecoveryPlanGroup['id']`），UI 的 `planForType` / `allOptions` / `planTone` / `PlanTree` 都按这个固定联合类型索引。
- 成本已改为成本库驱动（`POST /api/recovery/calculate-cost/batch`），后端 `recovery-cost.ts` 用 `z.enum` 校验 mode，新增 mode 必须同步扩展。

## 3. 设计决策

| # | 决策 | 理由 |
|---|---|---|
| D1 | 新增两个方案组 id：`swap-duty`、`flight-delay`；`RecoveryPlans` 增加 `trigger` 字段 | 保持既有 4 组结构不变，只做加法 |
| D2 | 统一触发判定抽到 `gantt/src/services/recovery-trigger.ts`，4 处调用点改为调用它 | 消除 4 份重复逻辑 |
| D3 | `trigger = 'assignment-overlap'` 时只展示 `standby / swap-duty / flight-delay` 三组，且按此顺序 | 需求原话「显示3个方案依次为…」 |
| D4 | `trigger = 'roster-qualification'`（8004）时展示集合与顺序完全不变 | 「保持现有触发逻辑」 |
| D5 | Swap duty 的落地动作复用现有 swap 链路（两个 crew 各 `remove-pairing-from-crew` + `assign-pairing`），后端复用 `/api/recovery/methods/roster-assignment` 的 `swap` | 整 pairing 互换语义与既有 swap 一致 |
| D6 | 双向 base/fleet/rank seat 不匹配的候选**保留在列表中但 `localExecutable=false`**，原因文案固定为 `The return pairing does not match both crews' base, fleet and rank seat.` | 需求明确要求「保留但标记不可用」 |
| D7 | Flight Delay 是**展示型方案**：不改 crew、不产生 Draft 操作、`localExecutable=false`，只列出受影响 pairing 的全部航班 | 需求只说「保留原 crew，显示所有航班」；工具没有延时分钟输入，无法生成本地可执行变更 |
| D8 | **本轮两个新方案都不挂 Apply**：`swap-duty` / `flight-delay` 一律 `localExecutable=false` + `ruleCheck='not-run'`，只走 GUI（列表 / Detail / Preview / 成本）。Swap duty 的落地动作将来复用现有 swap 链路（两个 crew 各 remove + assign），后端仍走 `/api/recovery/methods/roster-assignment` | 用户明确要求「先不挂钩 apply 逻辑，只挂同一份 GUI」；避免半截 swap 造成数据错误 |
| D9 | 新方案在 UI 上标记为 `Preview only`（而不是 `Blocked`） | 让排班员明白这是「暂不可执行」而非「规则不通过」 |

## 4. 影响模块

| 文件 | 改动 |
|---|---|
| `gantt/src/services/recovery-trigger.ts` | 新增：触发判定 + 地面/飞行重叠检测 |
| `gantt/src/services/recovery-api.ts` | `RecoveryOptionMode` 增加两个 mode；成本入参 mode 同步 |
| `gantt/src/services/recovery-candidates.ts` | 新增两组候选生成 + 组类型/mode 分支 |
| `gantt/src/services/recovery-draft.ts` | swap-duty 复用 swap 操作；flight-delay 无操作 |
| `gantt/src/stores/recovery-preview-store.ts` | pairing 预览识别 swap-duty |
| `gantt/src/components/recovery/recovery-violation-dialog.tsx` | 方案树/配色/汇总支持新组；1001 行可触发 |
| `gantt/src/components/gantt/source/live-gantt-source.ts`、`panes/violation-list-dialog.tsx`、`panes/shared/roster-pane.tsx` | 改用统一触发判定 |
| `live-server/src/routes/recovery/recovery-cost.ts` | mode 枚举与系数支持新 mode |

## 5. 待确认（实现时按 D 列默认执行，可一行改回）

1. Swap duty 的 rank seat「相符」按平台既有的降级规则实现（`crewRankOrder <= requiredRankOrder`），而不是完全相等。
2. 「当前 Recovery 业务日期」取告警的 `flightDate`（缺失时回退到源 pairing 开始日期）。
3. Flight Delay 目前不可执行（D7）；若需要真正下发延时，需要补延时分钟输入与后端接口。

## 6. 落地记录（2026-09-11 实做）

实现过程中暴露并修掉了 4 个只有真机数据才会暴露的问题（详见 gantt playbook §17）：

1. `roster-pane.tsx` 的 `recovery:open` 监听里硬编码 `ruleCode !== '8004' → return`，导致右键/悬浮条上的新入口"菜单出现、点击无反应"。改为走统一的 `recoveryTriggerFor()` 判定。
2. 同一条 Pairing 同时挂 8004 与 1001 时，旧逻辑取到的第一条（8004）对"已结束 Roster"不成立，把 1001 一起否掉。`findRecoverableAlert()` 现在把 1001 排在前面。
3. 1001 的源 Roster 与候选范围原来只从"仍有效"的排班组里取，而 1001 场景经常是"回看昨天/已结束的 Roster"（例：组员 113 / 9-08），结果方案全空、窗口打开也没内容。1001 改为按业务日期取源与候选；8004 规则不变。
4. `enrichPlansWithLibraryCosts` 只枚举了 roster/standby/cross-base/mixed，新两组没参与成本库报价，已补上。

验证：gantt `tsc -b` 通过；Recovery 相关单测 87 个全过（含 113/9-08 已结束 Roster 仍生成方案、双条件同时满足时优先 1001）；真机 UI 上恢复窗口已按 Standby → Swap duty → Flight Delay 三组正常弹出。
