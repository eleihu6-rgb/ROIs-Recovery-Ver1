# Pairing.tafb 统一为 PBS 日历日（删除 pbs_calendar_days）设计

> 日期：2026-08-10 · 状态：设计定稿待评审 · 模块：live-server / pbs-server / scenario / gantt / engine-server / pbs-portal

## 1. 背景与动机

`pairing` 表当前存在两个"天数口径"字段 + 一个历史分钟字段：

| 字段 | 现语义 | 问题 |
|---|---|---|
| `tafb` | 注释/口径=离基地时间（分钟），**但 live 库已有 SQL 将其值修为天数** | 语义与值不一致：注释/写路径/Scenario 仍按分钟（inbound 源数据、PRG、手动建环初值），引擎天数过滤（`context.py:287,289` `tafb >= duration_min`）按天读——**读与写、值与注释互相打架** |
| `pbs_calendar_days` | PBS 口径日历日（Base 时区 Brief→Debrief 覆盖日历日数） | 与 tafb 实际存储的天数口径重复 |
| `duration_days` | 环跨越的自然天数 | 保留不动，与 tafb 是两个口径 |

统一目标：**`tafb` = PBS 日历日（签到开始→签到结束覆盖的日历日数），注释/计算/写路径全部对齐为天，删除 `pbs_calendar_days`**，引擎与 PBS 天数过滤统一读 `tafb`。

## 2. 目标语义（定稿）

- `pairing.tafb`（live + scenario）= **PBS 口径日历日**：Base 当地时区从 `brief_start`（签到开始）到 `debrief_end`（签到结束）覆盖的日历日数，即原 `pbs_calendar_days` 的计算逻辑。
- `tafb` **NOT NULL，最小值 1**（一天内签进签出的环=1 天）。
- 计算失败（base 时区未知 / 无 brief·debrief）时**兜底**：`sch_str_dt_utc→sch_end_dt_utc` 日历日 → `duration_days` → `1`。
- `duration_days`（自然天数）语义不变，与 tafb 并存。
- `roster_publish.tafb_minutes` 列改名为 `tafb`，来源仍是 `pairing.tafb`。

## 3. 已确认决策（用户拍板）

1. **Scenario PRG 导入**：按段重算日历日（复用 live refresh 逻辑），不直接落 PRG 分钟值。
2. **tafb 保持 NOT NULL + 兜底**（不改为可空）。
3. **删除属性 138**（hidden AA 迁移「Maximum TAFB-Credit Ratio」对应的 `core-conditions` case，live 349 / pbs 464 附近）；**属性 125「Credit Per Time Away From Base」保留不动**——live 库 `tafb` 已由既有 SQL 修为天数，125 的 `credit/tafb` 比率本就是按天计算（day-based），不在本次范围。
4. **roster_publish.tafb_minutes → `tafb`**（与 Pairing 列名一致，来源=pairing.tafb），同步 pbs-server award 查询/类型 + pbs-portal mapper。
5. **属性 113「TAFB」改为按天竞价**（bid 值由 HH:MM 分钟改为天数）。

## 4. DB Schema + 迁移

| 对象 | 变更 |
|---|---|
| live `pairing` | DROP `pbs_calendar_days`；`tafb` 列注释改「PBS 口径：Base 当地时区 Brief 至 Debrief 覆盖的日历日数（签到开始→签到结束），单位天」；`idx_pairing_tafb` 保留 |
| scenario `pairing` | `tafb` 注释同步改为天 |
| live `roster_publish` | `tafb_minutes` → `tafb`，注释改「发布快照 pairing.tafb（天）」 |
| `pbs_bid_property` | 行 113 的 `json`（`{"type":"duration","format":"HH:MM","label":"TAFB"}`）改为按天（见 §7） |

迁移脚本（`sql/migration/`）顺序：

1. live：`UPDATE pairing SET tafb = GREATEST(1, COALESCE(pbs_calendar_days, tafb, duration_days, 1)) WHERE is_deleted = 0`（`tafb` 在库中已由既有 SQL 修为天数，此步优先用旧 `pbs_calendar_days` 对齐口径，其余行保留现值兜底）→ `ALTER TABLE pairing DROP COLUMN pbs_calendar_days` → 更新 tafb 注释。迁移前在远端库核对 tafb 当前取值分布（确认已是天数）。
2. scenario：对全部 pairing 跑 §5.2 的 refresh SQL 重算 tafb 为日历日。
3. live：`ALTER TABLE roster_publish RENAME COLUMN tafb_minutes TO tafb` + 注释。
4. `pbs_bid_condition`：`property_id = 113` 行的 `param_a`/`param_b` 从 `HH:MM`（分钟）迁移为天数 `max(0, ceil(分钟/1440))`（分钟粒度 bid 折叠为整天桶，属预期语义损失）。

## 5. live-server

### 5.1 模型与计算

- `src/models/pairing/pairing.ts`：删除 `pbsCalendarDays` 字段；`tafb` 注释更新。
- `src/services/pairing/pairing-calendar-days-service.ts` → 更名 `pairing-tafb-service.ts`；`refreshPbsCalendarDays` → `refreshPairingTafb(db, pairingId, updatedBy)`：
  - 保留现有 CTE 逻辑（lateral 取 base 时区 + segment brief/debrief 边界），但 UPDATE 目标列改为 `pairing.tafb`，且结果 `GREATEST(1, COALESCE(段重算日历日, sch起止日历日, duration_days))` 保证非 NULL。
  - 段重算口径与现在一致：`(debrief_end at base_tz)::date - (brief_start at base_tz)::date + 1`；sch 兜底同式用 `sch_end_dt_utc/sch_str_dt_utc`（base 时区已知用时区转换，未知则按 UTC 日期差 +1）。
  - 同步更新所有 import/tests 里的旧函数名。

### 5.2 调用点与赋值

| 文件 | 变更 |
|---|---|
| `pairing-service.ts` `create()`（~490）| 去掉 `pbsCalendarDays: null`；若入参未带 `tafb`，插入前按 `sch_str→sch_end` 日历日（`GREATEST(1, …)`）兜底（tafb NOT NULL 约束）|
| `pairing-service.ts` `update()`（~499）| 删 `delete updateData.pbsCalendarDays`；base 变化时调 `refreshPairingTafb` |
| `pairing-service.ts` `createFromFlights()`（~703-722）| 初始 `tafb` 改为 `Math.max(1, floor((lastArv-firstDep)/86400000))` 占位，事务内段建成后仍由 refresh 重算为准确日历日 |
| `pairing-service.ts` `addSegment()`（~965）| 调 `refreshPairingTafb` |
| `pairing-duty-node-service.ts:175` | 调 `refreshPairingTafb` |
| `workers/pairing-inbound-worker.ts`（234/247/391）| 插入 `tafb` 列保持占位（`duration_days`），随后 `refreshPairingTafb` 重算为日历日；源分钟值不再写入 |
| `workers/roster-ground-inbound-worker.ts`（494/500）| 地面任务 `tafb: 0` → `tafb: 1`（同日任务=1 个日历日）|
| `scripts/import-pairings-from-raw.ts:222` | `tafb` 兜底不再取分钟源值，直接占位 `durationDays`/`computedTafbDays`（最终由 refresh 重算）|

### 5.3 pairing-search（live + pbs 两侧，bid 条件；代码对称，字典共用）

- 天数过滤：所有 `p.pbs_calendar_days` → `p.tafb`：
  - live：`pairing-search-core-conditions.ts:66,68,70,185,192,303` + `pairing-search-condition-builder.ts:56`
  - pbs：`pairing-search-core-conditions.ts:88,91,93,249,263,428` + `pairing-search-condition-builder.ts:62` + `pairing-search-preview-query.ts`/`pairing-search-preview-mapper.ts`/`pairing-search-id-search-query.ts` 中引用处
  - `is not null` 守卫可去（tafb 恒非 NULL）。
- `pairing-search-core-conditions.ts` case 113（TAFB，live 290 / pbs 385）→ 按天竞价（§7）。
- **删除** `pairing-search-core-conditions.ts` case 138（hidden AA「Maximum TAFB-Credit Ratio」，live 349 / pbs 464 附近，依赖 `tafb::numeric`）；**保留** case 125「Credit Per Time Away From Base」（live detail 857,869 / pbs detail 1085-1109）——tafb 已是天数，其比率按天计算（决策 3）。
- `services/algorithm-export/pairing-score-export.*` 的 `p.pbs_calendar_days` → `p.tafb`。

## 6. Scenario

- `s3-pairing-prg-parser.ts`：`tafb`（PRG 分钟值，348 行）不再作为 scenario.tafb 直接写入。
- `s3-pairing-import-service.ts`：导入事务末尾对本次导入的 pairing 集合执行同款 refresh SQL（§5.1 逻辑，schema 指向 scenario），tafb = 段重算日历日 + 兜底。
- 若 scenario `pairing_segment` 无 brief/debrief（需在计划中核实），走 sch 兜底路径。
- 相关测试更新：`s3-pairing-prg-parser.test.ts`（`tafb: 655` → 天数期望）、`s3-pairing-import-service`、`scenario-export-pairing-division`。

## 7. 属性 113「TAFB」按天竞价（决策 5，scope 最大）

涉及 live-server + pbs-server 对称实现 + pbs-portal UI + 存量数据迁移：

1. **字典**：`sql/seed/10-pbs-bid-property.sql` 行 113 `json` 从 `{"type":"duration","format":"HH:MM","label":"TAFB"}` 改为按天（天数 stepper 或等价 day type，`format:"days"`，操作符仍 `["<",">","Between"]`）。
2. **条件构建**：live + pbs `pairing-search-core-conditions.ts` case 113 表达式 `p.tafb::numeric` 改按天比较（复用 stepper 类 compare，不再 `parseDurationToMinutes`）。
3. **bid 值校验/存取**：提交校验（live/pbs 共用的 property 校验，`pbs-server/src/services/pairing/pairing-bid-service.ts` 附近）对 113 改收天数；`pbs_bid_condition.param_a/param_b` 存天数。
4. **存量数据迁移**：`property_id=113` 行 `param_a/param_b` 的 `HH:MM` → `max(0, ceil(minutes/1440))`。
5. **pbs-portal**：定位 113 的 bid 输入控件（`features/pairing/components/`，如 `time-between-flights-editor.tsx` 同族），改天数输入/回显；`pairing-property-catalog.ts` 同步类型。
6. **测试**：live/pbs condition builder + 校验单测、portal mapper 单测。

> 计划阶段需先精确定位：bid 值提交校验入口（live+pbs 两侧）、portal 中 113 的输入/回显组件、`pbs_bid_condition` 的迁移脚本位置。

## 8. pbs-server award + pbs-portal（roster_publish 快照）

- `scripts/sync-roster-publish-from-roster-flight-core.ts`（352/539/617/700）：`tafb_minutes` → `tafb`。
- `services/award/award-results-service.ts:110`：`rp.tafb_minutes::text as tafb_minutes` → `rp.tafb::text as tafb_days`。
- `services/award/types.ts:47`：`tafb_minutes` → `tafb_days`（number|null）。
- `services/award/award-results-mapper.ts:589`：`parseNumericMinutes(...)` → 整数天数。
- pbs-portal `features/award/types.ts` / `award-mappers.ts:445`：`tafbMinutes` → `tafbDays`；`tafbLabel`（日期推导）不变，UI 展示不受影响。

## 9. gantt

- `src/components/panes/pairing-pane.tsx:492`：`blh` 兜底 `(p.tafb ? formatBlockMinutes(p.tafb) : '-')` → 删除（tafb 现在是天数，不再是 block 分钟）→ 无 `blockMinutes` 时显示 `-`。
- `src/components/gantt/gantt-utils.ts:838`：`String(p.blockMinutes ?? p.tafb ?? 0)` → `String(p.blockMinutes ?? 0)`。
- `src/utils/scenario-pairing-adapter.ts:159,255`：`tafb: 0` → 映射真实天数。
- TAFB 列（`pairing-pane.tsx:61`）值=天数，列头保持 `TAFB`。

## 10. engine-server（无需改动，自动修正）

- `ro_input_builder/context.py:287,289`：`tafb >= duration_min` 在 tafb=天 后**自动正确**。
- `ro_input_builder/sections/pairing.py`、`legacy_ro_converter.py`：tafb 透传，无需改。
- 计划中可加一条断言/测试：coverage 过滤 tafb 与 duration_min/max 比较时单位已对齐（天）。

## 11. 测试策略

| 层 | 必改测试 |
|---|---|
| live-server 单测 | `pairing-calendar-days-service.test.ts`（改 refreshPairingTafb 语义+兜底）、`pairing-service.test.ts`（create/update/createFromFlights/addSegment）、`pairing-duty-node-service.test.ts`、`pairing-inbound-worker.test.ts`、`pairing-search-*.test.ts`（pbs_calendar_days→tafb + 113 天 + 删 138）、`pairing-score-export.test.ts` |
| live-server 集成 | 远端库核查：迁移后 tafb 回填=旧 pbs_calendar_days、roster_publish.tafb 同步 |
| scenario | `s3-pairing-prg-parser.test.ts`、`s3-pairing-import-service`、`scenario-export-pairing-division.test.ts` |
| pbs-server | `pairing-search-*`、`award-results-*`、`sync-roster-publish-*`、bid 校验（113 天数） |
| pbs-portal | `award-mappers`、pairing bid 控件/类型（113 天数回显） |
| gantt | `pairing-pane` TAFB/block 兜底、scenario adapter |
| E2E | 若改到 UI 可见行为（TAFB 列、bid 113 输入），补 Playwright 回归 |

## 12. 风险与注意

- **113 按天是语义变更**：分钟粒度 TAFB bid 折叠为整天桶，存量 bid 值迁移为近似值，需产品确认可接受（已按用户决策 A）。
- **tafb 口径收敛会带来行为差异**：重构后所有写路径统一为「段重算日历日 + 兜底」，新导入/手动建的环 tafb 会与既有「SQL 修的天数」可能不完全一致（如地面任务 0→1、手动环从 floor 自然天改为日历日）；引擎/PBS 天数过滤基于收敛后的值，需回归观察覆盖池变化。
- **ground 任务 tafb 0→1**：地面任务环 tafb=1，若引擎/PBS 按天过滤会进入「1 天」桶，需确认预期。
- `pbs_calendar_days` 删除属不可逆 DDL，迁移前必须备份/在 SIT 演练。
- 本机 `live-server` 的 `.env` 指向 UAT schema，迁移核查需显式选环境（见 `docs/modules/database` 规范）。
