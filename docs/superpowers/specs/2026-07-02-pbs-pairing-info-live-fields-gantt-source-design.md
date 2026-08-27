# PBS Portal Pairing Info 全字段活数据对齐 Gantt 设计

## 背景

PBS Portal 的 `BIDDING CALENDAR` 点击 pairing bid 后，会打开 `Pairing Bid` 弹窗。当前弹窗里 `PAIRING DETAILS` 已经开始向 Gantt 的 `Pairing Info` 靠拢，但还有字段不是活数据，或者字段来源与 Gantt 口径不一致。

用户明确要求：

- 不要死数据。
- 弹窗里的字段全部使用真实数据。
- 可以参考 Gantt 的 `Pairing Info`。
- 本次只处理 `PAIRING DETAILS` 摘要和 leg 明细表；上面的 `PAIRING BID` 申请摘要表属于 bid 记录，不纳入本次改动。

## 当前问题

### 明确的死数据

| UI 字段 | 当前问题 | 正确方向 |
|---|---|---|
| `Composition` | 前端写死 `"-"` | 后端从 `pairing_composition` 聚合返回 |
| `Total DP` | 前端写死 `"-"` | 后端按 duty 去重汇总 `duty_sch_dp_min` |
| `Ref` | 后端写死空字符串 | 后端返回 `pairing_segment.duty_ref_tz` |
| `GT` | 后端写死空字符串 | 后端按同 duty 内相邻 segment 的间隔计算 |

### 有数据但未严格对齐 Gantt

| UI 字段 | 当前口径 | Gantt 口径 |
|---|---|---|
| `Start` | 使用 `activeDates[0]` | 使用 `pairing.sch_str_dt_utc` 的日期 |
| `Total Credit` | 已按 duty 去重，但会 fallback 计划 credit | Gantt 只按 `duty_act_credited_minutes` 求和 |
| `FT` | 可能等同计划 block | Gantt 使用实际起落 `act_str_dt_utc -> act_end_dt_utc` |
| `PCK` | 使用 pickup end fallback start | Gantt 用 `pickup_start_utc`，且只显示在 duty 第一段 |
| `DRP` | 使用 dropoff/debrief fallback | Gantt 用 `dropoff_end_utc`，且只显示在 duty 最后一段 |
| `Duty` | 显示在 duty 第一段，只含 `LO/FDP` | Gantt 显示在 duty 最后一段，含 `LO/FDP/DP/ETRTZ` |

## 目标

1. `PAIRING DETAILS` 摘要字段全部来自 API 活数据，不再前端写死。
2. leg 表 20 列按 Gantt `Pairing Info` 口径返回和展示。
3. 后端 contract 明确每个字段的真实来源；前端只展示，不再推业务字段。
4. 源数据为空时允许显示 `—` 或空白，但必须是“数据库为空”的结果，不是代码硬编码占位。
5. 保持现有 tier 选择、保存、只读、loading/error、遮罩点击关闭逻辑不变。

## 非目标

- 不重写整个 Gantt `PairingInfoDialog`。
- 不把 Gantt 前端组件直接搬到 PBS Portal。
- 不新增独立 Dashboard-only detail API，优先扩展现有 PBS pairing detail contract。
- 不改 Pairing Bid 的保存模型。
- 不改 Search Pairings 的筛选规则。
- 不处理 Crew on Pairing 表，因为 PBS Portal 当前弹窗没有这块。
- 不新增时区切换按钮；本轮只让返回值按 Gantt 的数据来源生成。

## Gantt 参考口径

Gantt 的 `Pairing Info` 字段口径来自：

- `gantt/src/components/pairing/pairing-info-dialog.tsx`
- `gantt/src/services/pairing-info-service.ts`
- `gantt/src/services/pairing-detail-cache.ts`
- `gantt/src/services/pairing-api.ts`

Gantt 摘要区：

```text
Start / Base / Composition / Total Credit / Total BH / Total DP / Attr
```

当前 PBS Portal 只显示前六个字段。本次对齐前六个字段；`Attr` 暂不新增，避免扩大 UI 范围。

Gantt leg 表头：

```text
QUAL / ALN / Flight / Fleet / ACC / Ref / DEP / PCK / RPT / STD / ATD / ARR / STA / ATA / DRP / GT / BH / FT / MRT / Duty
```

## 推荐方案

采用“后端扩展 contract，前端纯展示”的方案。

### 为什么不在前端拼字段

这些字段大多是业务字段或 duty-level 规则：

- `Composition` 需要读 `pairing_composition`。
- `Total DP` 需要按 `duty_seq` 去重。
- `GT` 需要知道同 duty 的下一段。
- `Duty` 需要判断 duty 最后一段，并组合 `LO / FDP / DP / ETRTZ`。
- `PCK/RPT/DRP/MRT` 都是 duty-level 信息，不应该由前端猜。

因此应在 `pbs-server` mapper 中统一生成，前端只根据 contract 渲染。

## API Contract 设计

在 `PbsSearchPairingsResult` 增加 Gantt-style summary 字段：

| 字段 | 类型 | UI | 来源 |
|---|---|---|---|
| `startDateLabel` | `string` | `Start` | `pairing.sch_str_dt_utc` 格式化后的日期 |
| `compositionLabel` | `string` | `Composition` | `pairing_composition` 聚合，如 `CA (1)` / `IFD(1)FA(3)` |
| `totalDp` | `string` | `Total DP` | 按 `duty_seq` 去重汇总 `duty_sch_dp_min` 后格式化 `H:MM` |

保留现有字段：

- `base`
- `totalCredit`
- `totalBlock`
- `legs`
- `activeDates`

其中 `totalCredit` 和 `totalBlock` 的语义要调整为严格 Gantt 口径。

在 `PbsSearchPairingsLeg` 上补齐 / 修正 Gantt-style 字段：

| 字段 | UI 列 | 来源 / 规则 |
|---|---|---|
| `ganttQual` | `QUAL` | `seg_assignment`；与 Gantt 一致，普通 `FLT` 可显示空，非普通任务显示如 `DH/FLY` |
| `ganttAirline` | `ALN` | `pairing_segment.airline` |
| `ganttFlight` | `Flight` | `pairing_segment.flt_num` |
| `ganttFleet` | `Fleet` | `pairing_segment.fleet_seg`，fallback `pairing.fleet` |
| `ganttAcc` | `ACC` | `pairing_segment.duty_acc_state` |
| `ganttRef` | `Ref` | `pairing_segment.duty_ref_tz` |
| `ganttDep` | `DEP` | `pairing_segment.dep_arp`，可带机场时区 offset |
| `ganttPickup` | `PCK` | duty 第一段显示 `pickup_start_utc` |
| `ganttReport` | `RPT` | duty 第一段显示 `brief_start_utc` |
| `ganttStd` | `STD` | `pairing_segment.sch_str_dt_utc` |
| `ganttAtd` | `ATD` | `pairing_segment.act_str_dt_utc` |
| `ganttArr` | `ARR` | `pairing_segment.arv_arp`，可带机场时区 offset |
| `ganttSta` | `STA` | `pairing_segment.sch_end_dt_utc` |
| `ganttAta` | `ATA` | `pairing_segment.act_end_dt_utc` |
| `ganttDropoff` | `DRP` | duty 最后一段显示 `dropoff_end_utc` |
| `ganttGroundTime` | `GT` | 同 duty 内下一段 `sch_str_dt_utc - 当前 sch_end_dt_utc` |
| `ganttBlockHour` | `BH` | 当前段 `sch_end_dt_utc - sch_str_dt_utc` |
| `ganttFlightTime` | `FT` | 当前段 `act_end_dt_utc - act_str_dt_utc` |
| `ganttMinimumRest` | `MRT` | duty 最后一段显示 `duty_sch_rest_min|duty_act_rest_min` |
| `ganttDuty` | `Duty` | duty 最后一段显示 `LO / FDP / DP / ETRTZ` 汇总 |

## 后端数据来源

### Pairing summary 查询

`executePreviewQuery` 和 `executePairingDetailsQuery` 都应查询或聚合：

- `p.sch_str_dt_utc`
- `p.base`
- `p.fleet`
- `p.duty_count`
- `p.duration_days`
- `p.tags` 暂不展示，可不返回
- `pairing_composition.acting_rank`
- `pairing_composition.plan`
- `pairing_composition.is_deleted = 0`

### Segment 查询

`loadSegmentsByPairingId` 需要补充字段：

- `duty_ref_tz`
- `duty_etr_tz`
- `duty_layover_nits`
- `duty_sch_dp_min`
- `duty_act_dp_min` 可先不展示，但可为后续保留
- 当前已有的 `pickup_start_utc / brief_start_utc / dropoff_end_utc`
- 当前已有的 `sch_* / act_* / rest / credit / assignment`

## 字段计算规则

### Composition

按 `pairing_composition` 聚合：

```text
acting_rank + "(" + plan + ")"
```

排序建议：

1. 保持数据库返回顺序或按 `id asc`。
2. 如需稳定展示，可按 `acting_rank asc, id asc`。

示例：

```text
CA(1)
CA(1)FO(1)
IFD(1)FA(3)
```

### Total Credit

严格参考 Gantt：

```text
按 duty_seq 去重
只使用 duty_act_credited_minutes
为空则该 duty 计 0
总和格式化为 H:MM
```

不再 fallback `duty_sch_credited_minutes`，否则会和 Gantt 可能不一致。

### Total BH

参考 Gantt：

```text
sum(blockMin(sch_str_dt_utc, sch_end_dt_utc))
```

### Total DP

参考 Gantt：

```text
按 duty_seq 去重
sum(duty_sch_dp_min)
```

### PCK / RPT / DRP

参考 Gantt：

- `PCK`：只在 duty 第一段显示 `pickup_start_utc`。
- `RPT`：只在 duty 第一段显示 `brief_start_utc`。
- `DRP`：只在 duty 最后一段显示 `dropoff_end_utc`。

### Duty

参考 Gantt，只在 duty 最后一段显示：

```text
LO {duty_layover_nits}
FDP {duty_sch_fdp_min}
DP {duty_sch_dp_min}
ETRTZ {duty_etr_tz}
```

只显示存在的部分，用 ` · ` 连接。

示例：

```text
LO 1 · FDP 3:15
LO 1 · FDP 9:10 · DP 12:10
```

### 空值规则

这是关键规则：

- 禁止代码层写死业务值。
- 如果数据库字段为空，UI 可以显示空白或 `—`。
- 空白 / `—` 只表示“源数据为空”，不能用于掩盖未接字段。
- 测试要覆盖“源数据存在时必须显示真实值”。

## 前端展示设计

`PairingCalendarCompactDetail` 使用后端返回的 Gantt-style summary 和 leg 字段：

- `Start` 显示 `startDateLabel`。
- `Base` 显示 `base`。
- `Composition` 显示 `compositionLabel`。
- `Total Credit` 显示 `totalCredit`。
- `Total BH` 显示 `totalBlock`。
- `Total DP` 显示 `totalDp`。

leg 表继续按 20 列：

```text
QUAL / ALN / Flight / Fleet / ACC / Ref / DEP / PCK / RPT / STD / ATD / ARR / STA / ATA / DRP / GT / BH / FT / MRT / Duty
```

前端不再 fallback 生成 `Duty` 文案，不再把缺失字段伪造成活数据。

## 影响范围

### 后端

- `packages/contracts/pbs-search-pairings.d.ts`
- `pbs-server/src/services/pairing-search/pairing-search-preview-query.ts`
- `pbs-server/src/services/pairing-search/pairing-search-preview-mapper.ts`
- `pbs-server/src/services/pairing-search/pairing-search-service.test.ts`
- `pbs-server/src/routes/pairing-search.test.ts` 如 contract 快照受影响则更新

### 前端

- `pbs-portal/src/features/pairing/types.ts`
- `pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx`
- `pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx`
- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`
- 相关 test utils mock

### 文档 / 测试用例

- 更新或新增 `docs/test-cases/pbs/dashboard/...` 人工测试用例。
- 运行并记录自动化验证命令。

### 版本号

本次跨 `pbs-server` 和 `pbs-portal`，需要递增：

- `gantt/src/version.ts` 的 `BACKEND_VERSION`
- `gantt/src/version.ts` 的 `FRONTEND_VERSION`
- `gantt/src/version.ts` 的 `PBS_BACKEND_VERSION`
- `gantt/src/version.ts` 的 `PBS_FRONTEND_VERSION`

## 测试计划

### 后端自动化

1. `pairing-search-service.test.ts`
   - mock `pairing_composition` 返回 `CA(1)`，断言 `compositionLabel`。
   - mock `duty_sch_dp_min`，断言 `totalDp`。
   - mock `duty_ref_tz`，断言 `ganttRef`。
   - mock同 duty 两段，断言 `ganttGroundTime`。
   - mock actual flight time 与 scheduled block 不同，断言 `ganttFlightTime` 使用 actual。
   - mock多个 segment 同 duty，断言 `totalCredit` 只按 duty 去重。
   - mock `duty_act_credited_minutes = null`，断言不 fallback 计划 credit。

2. `pairing-search.route` 相关测试
   - contract 结构包含新增 summary 字段。
   - 旧字段仍存在，避免其他页面立即断裂。

### 前端自动化

1. `pairing-calendar-bid-detail-dialog.test.tsx`
   - 显示真实 `Composition`，不显示硬编码 `-`。
   - 显示真实 `Total DP`。
   - 显示 `Ref / GT / FT / Duty` 的后端返回值。
   - 源数据为空时显示空白或 `—`，但存在值时必须显示值。

2. 共享工作台回归测试
   - 打开 calendar pairing bid detail 后，tier 编辑、保存按钮、只读状态不变。

### UI / 构建

- `pbs-server` focused tests
- `pbs-server npm run build`
- `pbs-portal` focused tests
- `pbs-portal npm test`
- `pbs-portal npm run lint`
- `pbs-portal npm run build`
- 根目录 `npm run check:ui`
- 相关 Playwright smoke 或 PBS Portal pairing detail E2E

## QA 人工测试验收

前置条件：

- 有一个包含多 duty / 多 segment 的 pairing。
- 至少一个 pairing 有 `pairing_composition`。
- 至少一个 duty 有 `duty_sch_dp_min`。
- 至少一个同 duty 多航段可以验证 `GT`。
- 至少一个航段的 actual 起落时间与 scheduled 起落时间不同，可以验证 `FT`。

步骤：

1. 登录 PBS Portal。
2. 打开 `Dashboard`。
3. 在 `BIDDING CALENDAR` 点击包含 pairing bid 的日期。
4. 查看 `PAIRING DETAILS` 摘要。
5. 对照 Gantt 同一个 pairing 的 `Pairing Info`。

预期：

- `Composition` 不再是固定 `-`，有源数据时显示如 `CA(1)`。
- `Total DP` 不再是固定 `-`，有源数据时显示 `H:MM`。
- `Ref` 有源数据时显示真实值。
- `GT` 有同 duty 下一段时显示真实间隔。
- `FT` 使用实际起落时间计算。
- `Duty` 出现在 duty 最后一段，包含真实 `LO/FDP/DP/ETRTZ` 片段。
- 没有源数据的字段显示空白或 `—`，不会显示 `undefined/null/0000`。
- tier 编辑和保存不受影响。

## Acceptance Criteria

- [ ] `Composition` 从后端返回真实聚合值，不再前端写死。
- [ ] `Total DP` 从后端返回真实汇总值，不再前端写死。
- [ ] `Ref` 从 `duty_ref_tz` 返回真实值。
- [ ] `GT` 按同 duty 内相邻航段计算。
- [ ] `FT` 按 actual 起落时间计算。
- [ ] `Duty` 按 Gantt 口径显示在 duty 最后一段。
- [ ] `Total Credit` 按 Gantt 口径只用 actual duty credit 并按 duty 去重。
- [ ] 前端不再用 fallback 文案伪造 Gantt 字段。
- [ ] 自动化测试覆盖源数据存在和源数据为空两种情况。
- [ ] QA 测试用例已更新。
- [ ] UI gate、build、相关测试结果已记录。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本任务主要围绕一个 contract、一个后端 mapper/query、一个前端弹窗和对应测试；文件耦合紧，拆分会增加 contract 冲突。
- Suggested split: 不拆。
- Write boundaries: 由单个实现者顺序修改 contract → 后端 → 前端 → 测试。
- Conflict risk: 多人同时修改 contract/mock/test 容易互相覆盖。
- Execution gate: 用户确认本 spec 后再开始实现。

## 风险与约束

- 如果数据库本身没有某些字段值，UI 仍会显示空白或 `—`；这不是死数据，而是源数据为空。
- 如果要完全复刻 Gantt 的机场 offset 和时区切换，需要额外接入 airport zone 逻辑。本次优先保证字段真实来源，不新增时区切换交互。
- 当前 PBS Portal 弹窗仍不是 Gantt 原生 `AppDialog`，本轮不借机重构弹窗基础结构，避免扩大风险。
