# F8 (Flair Airlines) 法规规则手册

> 文档来源：*Flair PBS BRD – Rules_FD_v1.docx*（飞行甲板，FD）和 *Flair PBS BRD – Rules_CC_v1.docx*（客舱乘务，CC）  
> 版本：2026-01-23  
> 法规依据：Canadian Aviation Regulations (SOR/96-433)、Flight Crew Member Fatigue Management – Prescriptive Regulations、ALPA FLE CBA No.1、CUPE 4060-Flair CBA (2019-2028, amended 2024-01-17)

---

## 目录

1. [通用概念](#1-通用概念)
2. [排班周期定义](#2-排班周期定义)
3. [任务类型与休息的判定规则](#3-任务类型与休息的判定规则)
4. [FD — 飞行甲板规则](#4-fd--飞行甲板规则)
5. [CC — 客舱乘务员规则](#5-cc--客舱乘务员规则)
6. [分阶段实施计划](#6-分阶段实施计划)
7. [当前实现问题与修复建议](#7-当前实现问题与修复建议)

---

## 1. 通用概念

### 1.1 Duty（勤务）

**定义**：航空公司分配给机组成员的任何任务，包括但不限于：管理工作、飞行勤务、行政/办公室工作、训练、定位（Positioning/Deadhead）、待命（Reserve）、备用（Standby）。

> 关键原则：**"Duty"是同义于"工时（hours of work）"的广义概念。地面任务（GRD 组）中凡非 DO/VAC/ILL 者，均属 Duty，计入工时。**

### 1.2 Duty Period（DP，勤务时间段）

- **起点**：机组成员按规定报到开始执行任务的时刻
- **终点**：机组成员完全结束所有任务的时刻
- **包含**：DP 包含任何 Positioning（DHD）时间

### 1.3 Flight Duty Period（FDP，飞行勤务时间段）

- **起点**：以下时刻中最早者——被分配飞行前任务的时刻、报到参加首个飞行的时刻、报到进行 Positioning 的时刻、作为备用机组成员报到的时刻
- **终点**：最后一个飞行段发动机关闭（Engines Off）或旋翼停转（Rotors Stopped）

**DHD 对 FDP 的影响**：
- DHD 在 FDP 之前：DHD 本身不计入 FDP，但报到时间算 FDP 起点
- DHD 在 FDP 之后：不计入 FDP，也不计入休息时间
- DHD 可将 Duty Day 延长最多 3 小时（含 FDP）；经飞行员同意最长可延长至 7 小时

### 1.4 Flight Time（飞行时间）

飞机自主动力开始滑行（准备起飞）至落地后完全停止之间的时间。对应 `blk_min`（Block Minutes）字段。

### 1.5 WOCL（Window of Circadian Low，昼夜低谷窗口）

- **时间范围**：02:00–05:59（以机组成员已适应时区的当地时间计）
- DHD 段落入该窗口，仍按 WOCL 勤务处理
- Split Duty 任何部分与该窗口重叠，视为 WOCL 勤务
- 任何勤务时间段（报到至释放）与 [02:00, 05:59] 重叠，均为 WOCL 勤务

### 1.6 Early / Late / Night Duty

| 类型 | 条件 |
|------|------|
| Early Duty | 勤务起始于已适应时区当地时间 02:00–06:59 |
| Late Duty | 勤务结束于当地时间 00:00–01:59 |
| Night Duty | 勤务起始于 13:00–01:59 **且** 结束于 01:59 之后 |

### 1.7 Acclimatization（适应时区）

- 一般假设：机组成员已适应其本部基地时区，除非先前的勤务使其适应了其他时区
- 跨时区 < 4 小时：在新时区停留满 72 小时后视为已适应
- 跨时区 ≥ 4 小时：停留满 96 小时后视为已适应
- 每在新时区停留 24 小时，适应时区向新时区偏移 1 小时
- 若机组不在同一时区停留超过 24 小时，则保持上一个已适应时区
- **CC 当前不适用适应规则（Phase 2 再实现）**

### 1.8 Credit Hours（学分小时）

**FD**：取以下最大值：
- 最低 4.0 学分/天（含待命日、假期、模拟机训练、工会日、行政日、RAP 日等）
- 计划飞行小时数
- 实际飞行小时数
- 勤务时间 ÷ 2（每 2 小时勤务折算 1 学分，DHD-only 天不计）

**CC**：取以下最大值：
- 最低 4.0 小时保底（最低勤务时间保证）
- 实际飞行时间
- 计划飞行时间
- 勤务时间 ÷ 2

### 1.9 Home Base（本部基地）

机组成员通常通勤报到执行 FDP 或 Positioning 的地点；每人有且仅有一个本部基地。

### 1.10 Positioning（定位/Deadhead, DHD）

- 应航空公司要求将机组成员从一地转移至另一地
- **不包含**往返适当住宿或机组成员住所的交通
- 飞行勤务**之前**的 DHD：必须计入 FDP
- 飞行勤务**之后**的 DHD（且该 DP 无更多飞行任务）：**不**计入 FDP 也不计入休息时间
- DHD 属于 Duty，计入 Duty Period

---

## 2. 排班周期定义

| 月份 | 排班周期 |
|------|---------|
| 一月 | 01/01 ~ 01/30 |
| 二月 | 01/31 ~ 03/01 |
| 三月 | 03/02 ~ 03/31 |
| 四月至十二月 | 自然月 |

---

## 3. 任务类型与休息的判定规则

### 3.1 F8 实际任务类型（来自数据库 `roster_flight` 表）

| assignment_group | assignment | 含义 | 是否计为 Duty | 是否计为 Free from Duty |
|-----------------|-----------|------|--------------|------------------------|
| `FLY` | `FLY` | 飞行段 | **是** | 否 |
| `FLY` | `DHD` | 飞行内 Deadhead（配对内定位） | **是** | 否 |
| `GRD` | `DO` | 休假日（Day Off / GDO） | 否 | **是** |
| `GRD` | `VAC` | 带薪年假 | 否 | **是** |
| `GRD` | `ILL` | 病假 | 否 | **是** |
| `GRD` | `SBY` | 备用/待命（Standby） | **是** | 否 |
| `GRD` | `GRD` | 地面勤务（行政/办公室） | **是** | 否 |
| `GRD` | `DHD` | 独立 Deadhead（配对外定位） | **是** | 否 |
| `GRD` | `SIM` | 模拟机训练 | **是** | 否 |
| `GRD` | `SFT` | 换班（Shift） | **是** | 否 |

### 3.2 规则引擎处理原则

1. **所有 Duty 类任务均须参与法规检查**，不得因 `assignment_group` 为 `GRD` 而跳过
2. 计算累计工时（28/90/365 天）时，`GRD` 组中 `SBY`、`GRD`、`DHD`、`SIM`、`SFT` 均应计入工时
3. 计算休息时间（Rest Period）时，`DO`、`VAC`、`ILL` 计为 Free from Duty；其余均为 Duty
4. GDO（Guaranteed Days Off）来自 `DO` 类型任务；
5. `SBY`（Standby）本身计为 Duty，但 Reserve Availability Period（RAP）开始前的等待期在部分场景下有特殊处理（参见 FD §8.13）

---

## 4. FD — 飞行甲板规则

### 4.1 FDP 最大限制（CAR 700.28）

FDP 上限由**报到时刻**（本地/适应时区时间）和**航段数**共同决定，查表确定。

主要参数：
- 基础上限：`base_limit_minutes`（默认 780 分钟 = 13 小时）
- DHD 最多延长 FDP 3 小时（最多 7 小时需飞行员同意）
- Split Duty 可在每个 FDP 内提供至少 60 分钟休息以延长上限（应尽量避免）

**告警消息格式**：`Duty {seq}: FDP {actual}min exceeds limit {limit}min ({n} segments, report {HH:MM})`

### 4.2 最大飞行时间（CAR 700.27(1)，§4.5）

| 周期 | 限制 | 建议预警缓冲 | 实际告警阈值 |
|------|------|------------|------------|
| 任意 28 连续天 | 112 小时 | 5 小时 | 107 小时 |
| 任意 90 连续天 | 300 小时 | 5 小时 | 295 小时 |
| 任意 365 连续天 | 1,000 小时 | 10 小时 | 990 小时 |

- 以滚动窗口计算（rolling 28/90/365 days）
- Flair 不执行单飞行员运营
- 所有阈值均可配置为参数

**告警消息格式**：`Flight time {actual}h in last {N}d exceeds {limit}h limit`

### 4.3 最大工时（CAR 700.29(1)，§4.30）

| 周期 | 限制 |
|------|------|
| 任意 365 连续天 | 2,200 小时 |
| 任意 28 连续天 | 192 小时 |
| 任意 7 连续天（选项 c） | 60 小时（须配合 GDO 要求） |
| 任意 7 连续天（选项 d） | 70 小时（须配合 120 连续小时休息等严格条件）[Phase 2] |

**选项 c 的 GDO 要求**：
- 168 连续小时（7 天）内至少有 1 个单日 Free from Duty
- 672 连续小时（28 天）内至少有 4 个单日 Free from Duty

**计算说明**：分层休息（Layover）中从释放到下次报到之间（扣除往返住宿交通时间）计为 Free from Duty。

### 4.4 GDO — 保障休假日（ALPA FLE CBA No.1，§8.13）

| 月份天数 | 最低 GDO 数 |
|---------|-----------|
| 30 天 | 12 个 GDO |
| 31 天 | 13 个 GDO |

- 每个排班周期最多安排 **18 个工作日**
- 排班发布后，所有未分配 Duty 的天数均视为 GDO
- 勤务可延伸进 GDO（实现：法规 **2015 DO Start Time**，默认 `01:00` 本地 home base；任务在该时刻之前结束不占用该日历日。缺失 2015 时保持午夜边界。历史 BRD 摘要曾写「默认 30 分钟」时长，现以 HH:MM 定义为准）
- 在 GDO 之后的首个飞行任务报到时间不早于计划时间（无需额外缓冲）

**告警消息格式**：`Only {n} GDOs in bid period, minimum required: {min}`

### 4.5 Single Day Free from Duty（单日休息）

- 一个日历日（00:00–23:59）内完全没有 Duty 分配
- 注意事项：
  - 若 Duty 在 00:30 之后结束，则该日不可视为单日 Free from Duty
  - 若 Duty 在 07:30 之前开始，则前一日不可视为单日 Free from Duty
  - 可配置缓冲时间（默认 30 分钟），通常加在 Duty 结束时间之后

### 4.6 最低休息时间（CAR 700.29(1)，§4.36）

| 情形 | 最低休息时间 |
|------|------------|
| FDP 结束于本部基地 | **13 小时** |
| FDP 结束于非本部基地 | 10 小时（在适当住宿内）[配对层面保证，PBS 不检查] |

- 休息时间从 FDP 结束（释放）开始，到下次 FDP 报到结束
- 若 FDP 后紧接 DHD（不计入 FDP），则休息从 DHD 结束后开始计算

**告警消息格式**：`Rest before next duty {actual}min below required {required}min at home base`

### 4.7 Positioning 后最低休息（CAR 700.43(1)，§4.44）

当 FDP + Positioning 时间超过最大 FDP 限制时：

| 超出量 | 所需休息时间 |
|--------|------------|
| 超出 ≤ 3 小时 | 休息时间 = FDP + Positioning 总时间 |
| 超出 > 3 小时 | 休息时间 = FDP + Positioning 总时间 + 超出时间 |

### 4.8 WOCL 连续夜勤限制（CAR 700.51(1)，§4.53）

- **最多 3 个连续 FDP** 中任意部分落入 WOCL（02:00–05:59 适应时区）
- 第 3 个 WOCL FDP 结束后必须提供至少 1 个本地夜间休息
- 两个 WOCL 之间的间隔不少于 **55 小时**（间隔期间可安排任意类型勤务）
- 可延伸至 5 个连续 WOCL FDP，条件：每个 FDP 内有 ≥3 小时适当住宿休息 + 最后一个 FDP 结束后 ≥56 连续小时 Free from Duty
- 连续天数上限可配置

**告警消息格式**：`{n} consecutive WOCL duty periods exceeds maximum of {max}`

### 4.9 Single Daily Check-in 限制

- 每个日历日内，飞行员**不得**多于一次报到开始 FDP
- 合法示例：FDP1 报到在日历日 A，FDP2 报到在日历日 B（不同日）
- 违规示例：FDP 报到与 GND 报到在同一日历日

**告警消息格式**：`Multiple check-ins on same calendar day {date}`

### 4.10 返回本部基地的附加休息（CAR 700.42(2)，§4.43）[Phase 2]

当 FDP 结束于本部基地且出发地与本部时区差异时：

| 时区差 | 离家时间 | 要求 |
|--------|---------|------|
| ≤4 小时 | >36 连续小时 | 最少 13 连续小时休息 |
| >4 小时且 ≤10 小时 | ≤60 连续小时且返程 FDP 不侵入 WOCL | 下次 FDP 前至少 1 个本地夜间休息 |
| >4 小时且 ≤10 小时 | >60 连续小时或返程 FDP 侵入 WOCL | 下次 FDP 前至少 2 个本地夜间休息 |
| >10 小时 | ≤60 连续小时 | 下次 FDP 前至少 2 个本地夜间休息 |
| >10 小时 | >60 连续小时 | 下次 FDP 前至少 3 个本地夜间休息 |

### 4.11 年龄限制

- 年龄 >65 岁飞行员：只能在加拿大境内飞行
- 年龄 >65 岁飞行员：不能与年龄 >60 岁飞行员同组执飞

### 4.12 资质规则

**Acting Rank Qualification**：
- 机长（CPT）降级担任副驾驶（FO）职位时，必须持有右座（RH）资质

**Green on Green（Phase 2）**：
- 双机组中不能两人都是"Green"（新手）
- Green 定义：未完成 8 个飞行航段的飞行员

---

## 5. CC — 客舱乘务员规则

### 5.1 月度学分小时上限（CUPE §5.01.12）

| 情形 | 上限 |
|------|------|
| 标准上限 | 每排班周期 **85 学分小时** |
| 乘务员主动申请 + 公司同意 | 最多 95 学分小时（每年最多 4 次） |

- 月度上限参数化，可配置调整

**告警消息格式**：`CC credit hours {actual}h exceeds monthly limit {limit}h`

### 5.2 24 小时内最大航段数（CUPE §5.04.01）[Phase 2]

任意 24 小时内，计划航段数不超过 **8 个**。

### 5.3 GDO 保障（CUPE §5.01.10）

- 排班发布后，所有未分配 Duty 的天均视为 GDO
- 勤务日**不得**延伸进 GDO（与 FD 规则不同）

### 5.4 最低休息时间（CUPE §5.02.02）

- 本部基地最低计划休息时间：**12 小时**
- （FD 要求 13 小时，CC 要求 12 小时）

**告警消息格式**：`CC rest before next duty {actual}h below required 12h at home base`

### 5.5 Single Daily Check-in 限制（CUPE §5.01.15）

- 乘务员每个日历日内不得多于一次报到开始 FDP
- 规则与 FD §4.9 相同

### 5.6 待命/备用规则（CUPE §5.07.04, 5.07.06, 5.08）

| 规则 | 内容 |
|------|------|
| 最多连续待命天 | 6 天 |
| 全月待命（无飞行）| 每排班周期最多 20 天 |
| 混合排班（待命+飞行）| 待命以 ≥4 日历日为一块分配（1-3 天块可酌情分配） |
| 混合排班：1-9 天待命 | 该月最多 18 个工作日 |
| 混合排班：≥10 天待命 | 该月最多 19 个工作日 |

### 5.7 资质规则

**Green on Green**：
- 同一次飞行中，Green 乘务员人数不超过 **2 人**
- Green 定义：完成飞行航段数 < 8 的乘务员

**Prohibited Crew Pairs（Phase 2）**：
- 特定机组成员不得分配到相同飞行、地面勤务或模拟机勤务
- 乘务员不得与飞行甲板成员（FD）同飞（Phase 2）

**Language Qualification（Phase 2）**：
- 每个飞行须配备足够数量持有所需语言资质的机组成员

---

## 6. 分阶段实施计划

### Phase 1（当前目标）

| 规则 | FD | CC |
|------|----|----|
| FDP 最大限制（表格驱动） | ✅ 已实现 | N/A |
| 最大飞行时间 28/90/365 天 | ✅ 已实现（FlightTimeChecker） | N/A |
| 最低休息时间（本部基地） | ✅ 已实现（MinRestChecker） | ✅（12h 参数化） |
| Single Daily Check-in | 待实现 | 待实现 |
| GDO 最低保障 | 待实现 | 待实现 |
| 最大工时 7/28/365 天 | 待实现 | 待实现 |
| WOCL 连续夜勤 ≤3 | 待实现 | N/A |
| 年龄限制 | 待实现 | N/A |
| Acting Rank 资质 | 待实现 | N/A |
| CC 月度学分小时 | N/A | 待实现 |
| CC 连续待命 ≤6 天 | N/A | 待实现 |
| CC Green on Green | N/A | 待实现 |

### Phase 2（规划中）

- 适应时区计算（FD 和 CC）
- 返回本部基地附加休息（FD CAR 700.42(2)）
- Positioning 后特殊休息计算（FD CAR 700.43(1)）
- 70 小时/7 天工时选项（FD）
- 24 小时内最大航段数（CC）
- Green on Green（FD）
- Prohibited Crew Pairs（CC，含 FD×CC 禁止同飞）
- Language Qualification（CC）

---

## 7. 当前实现问题与修复建议

### 7.1 任务类型过滤不完整 [高优先级]

**问题**：`live-server/src/services/rule-check/rule-check-data-service.ts` 和 `batch-orchestrator-worker.ts` 中的 SQL 查询过滤条件为：

```sql
-- 现状（不正确）
AND rf.assignment_group IN ('FLT', 'DHD')
-- 或
AND rf.assignment_group IN ('FLT', 'DHD', 'FLY')
```

F8 实际数据中**没有** `FLT` 这个 `assignment_group`；飞行任务全部归类为 `FLY`；独立 Deadhead 使用 `GRD` 组的 `DHD`。

**影响**：`batch-orchestrator-worker.ts` 仍使用旧的 `('FLT', 'DHD')` 过滤，导致批量初始化任务完全找不到 F8 的飞行记录，violation 表无法正确填充。

**修复**：
- `rule-check-data-service.ts`（已修复为 `'FLT', 'DHD', 'FLY'`，仍需补充 `GRD` 组任务）
- `batch-orchestrator-worker.ts`：将 `IN ('FLT', 'DHD')` 改为 `IN ('FLY', 'GRD')` 或移除该过滤条件（所有非删除记录均需计算）

### 7.2 地面任务未参与法规检查 [高优先级]

**问题**：当前规则引擎的 `PairingInput` 数据模型仅包含 pairing（配对，即含飞行的任务块）。`SBY`（Standby）、`GRD`（地面行政）、`SIM`（模拟机）、`SFT`（换班）、`GRD/DHD`（独立定位）等任务类型完全不进入法规检查流程。

**影响**：
- 工时累计计算（28/90/365 天）**严重低估**，漏算大量 Duty 时间
- 两个 Pairing 之间的休息时间计算**可能偏高**（实际中间有地面 SBY/GRD 任务时休息未被正确扣减）
- GDO 数量计算不准确

**修复建议**：
- 在 `RosterInput` 或 `CrewRosterContext` 中增加 `ground_duties: list[GroundDuty]` 字段
- `GroundDuty` 包含：`assignment_group`、`assignment`、`start_dt`、`end_dt`、`is_duty: bool`
- 根据 §3.1 的判定规则，在 roster-level 检查（工时累计、GDO 计数）中将地面任务纳入计算
- pairing-level 检查（FDP、每次飞行内休息）维持现有逻辑不变

### 7.3 哪些地面任务算作休息 [中优先级]

根据 BRD 和实际数据，以下规则适用于**休息时间计算**（即 Free from Duty 判定）：

| assignment | 是否 Free from Duty | 说明 |
|-----------|-------------------|------|
| `DO` | **是** | GDO，完全 Free from Duty |
| `VAC` | **是** | 带薪年假，完全 Free from Duty |
| `ILL` | **是** | 病假，视为 Free from Duty |
| `SBY` | **否** | 待命也是 Duty，计入工时 |
| `GRD` | **否** | 行政勤务，计入工时 |
| `DHD`（GRD 组）| **否** | 独立 Deadhead，计入 Duty Period |
| `SIM` | **否** | 训练，计入工时 |
| `SFT` | **否** | 换班，计入工时 |

**Layover（外站休息）**：配对内两个 Duty Period 之间的时间（从释放到下次报到，扣除往返住宿交通时间），视为 Free from Duty。

### 7.4 batch-orchestrator-worker 过滤条件 [高优先级]

`live-server/src/workers/batch-orchestrator-worker.ts` 第 58 行和第 105 行：

```typescript
// 当前（错误）
AND rf.assignment_group IN ('FLT', 'DHD')
// 修复为
AND rf.assignment_group IN ('FLY', 'GRD')
// 或直接去掉 assignment_group 过滤，改为
AND rf.is_deleted = 0
AND rf.pairing_id IS NOT NULL
```

注意：若要获取**所有**与休息/累计工时相关的任务（包括无 `pairing_id` 的地面任务），还需要单独查询 `pairing_id IS NULL` 的 `GRD` 组记录，在 Roster 级别检查中一并使用。
