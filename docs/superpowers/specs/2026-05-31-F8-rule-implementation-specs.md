# F8 Rule Engine — Pending Implementation Specs

> 文档日期：2026-05-31  
> 依据：`docs/modules/rule-engine/F8-rule.md`  
> 当前代码基线：`feat/rule-engine/python-migration`，B23/F37

---

## 0. 前置修复（Critical — 必须在 Phase 1 之前完成）

这些是当前代码中已有实现但被"模板代码不匹配"静默跳过的 bug，不修复则 Phase 1 规则无法被正确调用。

### 0.1 `flight_hour_calculator` 模板代码不一致

| 项 | 值 |
|----|----|
| DB `rule_template.template_code` | `flight_hour_calculator` |
| Python `FlightTimeCalculator.template_code` | `flight_time_calculator` |

**影响**：飞行时间计算器（24h/7d/28d/90d/365d 累计）在所有 pairing 检查中均被跳过，`CheckInput.recent_flight_hours` 始终为 0，导致所有飞行时间超限规则均无法触发。

**修复方案（二选一）**：
- 方案 A（推荐）：修改 DB，将 `rule_template.template_code` 从 `flight_hour_calculator` 改为 `flight_time_calculator`。  
  文件：`sql/migration/` 新增 migration；运行 `UPDATE rule_template SET template_code='flight_time_calculator' WHERE template_code='flight_hour_calculator'`
- 方案 B：修改 Python，将 `FlightTimeCalculator.template_code = "flight_time_calculator"` 改为 `"flight_hour_calculator"`

修改文件：`rule-engine/src/core/calculators/flight_time_calculator.py`

---

### 0.2 `max_ft_28d` roster 级别模板代码缺失 DB 条目

| 项 | 值 |
|----|----|
| DB rule_instance（`ccar121_gantt` 组） | `max_ft_28d`（只有 pairing-level stub） |
| Python roster checker `RollingFlightTimeChecker` | 注册 `template_code = "max_ft_roster_28d"` |
| DB 对应条目 | **不存在** |

**影响**：roster 级别的 28 天滚动飞行时间检查永远不会被加载，`RollingFlightTimeChecker` 在所有航司均处于死代码状态。

**修复**：在 `rule_template` + `rule_instance` + `rule_group_item` 中为 `ccar121_gantt` 规则组插入 `max_ft_roster_28d` 条目，或将 Python 中 `max_ft_roster_28d` 改名为 `max_ft_28d` 并在 DB 侧将原有 pairing-level `max_ft_28d` 区分处理。

**推荐**：将 Python `RollingFlightTimeChecker.template_code` 改为 `max_ft_28d_roster`，同时在 DB 新增对应 rule_template/instance；原有 pairing-level stub `max_ft_28d` 保留用于单配对级别的 28d 检查（不适用 F8，暂禁用）。

---

### 0.3 `fatigue_risk_index` 双角色拆分

| 项 | 值 |
|----|----|
| DB `rule_template` | `fatigue_risk_index`，`check_type = BOTH` |
| Python calculators | `FatigueCalculator`，`template_code = "fatigue_risk_index"` |
| Python checkers | `FrmsThresholdChecker`，`template_code = "frms_score_threshold"` |

**影响**：DB 中 `fatigue_risk_index` 同时被注册为 CALC 和 CHECK，但 Python checker 侧使用的是不同的 `template_code = "frms_score_threshold"`，导致 FRMS 告警永远无法触发。

**修复**：在 DB 中新增 rule_template `frms_score_threshold`（check_type = CHECK），并将原 `fatigue_risk_index` 改为纯 CALC 类型；或在 Python 中将 `FrmsThresholdChecker.template_code` 改为 `fatigue_risk_index`（check 角色）并在 DB 中将 `fatigue_risk_index` 的 check_type 保持为 BOTH（当前现状）。

---

## 1. Phase 1 — Stub 实现补全

以下规则已在 DB 中注册、Python 中有占位实现（返回 `passed=True`），需补全真实逻辑。

---

### 1.1 `max_ft_24h` — 任意 24 小时最大飞行时间

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.2；CAR 700.27(1) |
| 实现类型 | Pairing-level checker |
| Python 文件 | `rule-engine/src/core/checkers/flight_time_checker.py`（已存在 stub） |
| DB template_code | `max_ft_24h` |
| 适用角色 | FD |

**业务逻辑**：  
在当前配对的 `CheckInput.recent_flight_hours.last_24h`（单位：分钟）基础上，加上本配对内 24 小时窗口内的飞行 block 分钟数，若总和超过阈值则告警。阈值从 `rule_instance.params["limit_minutes"]` 读取（默认 8×60=480 分钟）。

**输入数据**：`CheckInput.recent_flight_hours.last_24h`（已由 live-server 计算注入）

**告警消息**：`Flight time {actual}h in last 24h exceeds {limit}h limit`

**severity**：从 `rule_instance.params["severity"]` 读取，默认 2

---

### 1.2 `max_ft_7d` — 任意 7 天最大飞行时间

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.2；CAR 700.27(1) |
| 实现类型 | Pairing-level checker |
| Python 文件 | `rule-engine/src/core/checkers/flight_time_checker.py` |
| DB template_code | `max_ft_7d` |

**业务逻辑**：同 1.1，使用 `recent_flight_hours.last_7d`，阈值默认无（F8 不设 7d 上限，但预留）。实现时若 `params["limit_minutes"]` 不存在则直接 pass，不触发告警。

**告警消息**：`Flight time {actual}h in last 7d exceeds {limit}h limit`

---

### 1.3 `max_ft_28d` — 任意 28 天最大飞行时间

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.2；CAR 700.27(1) |
| 实现类型 | Pairing-level + Roster-level（见 §0.2） |
| Python 文件 | `rule-engine/src/core/checkers/flight_time_checker.py`（pairing）；`rule-engine/src/core/checkers_roster/rolling_flight_time_checker.py`（roster） |
| DB template_code | `max_ft_28d`（pairing）；`max_ft_28d_roster`（roster，待新增 DB 条目，见 §0.2） |
| F8 限制 | 112 小时（6720 分钟），预警 107 小时（6420 分钟） |

**业务逻辑（pairing-level）**：使用 `recent_flight_hours.last_28d`，阈值 6720 分钟。

**业务逻辑（roster-level）**：对 roster 内每个 pairing 的结束时刻，以其为基准向前 28 天，累加所有 pairing 的飞行 block 分钟数（`RosterContext.get_flight_minutes_in_window(end_dt, 28)`），超限则告警。

**告警消息**：`Flight time {actual}h in last 28d exceeds {limit}h limit`

---

### 1.4 `max_ft_365d` — 任意 365 天最大飞行时间

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.2；CAR 700.27(1) |
| 实现类型 | Pairing-level checker |
| Python 文件 | `rule-engine/src/core/checkers/flight_time_checker.py` |
| DB template_code | `max_ft_365d` |
| F8 限制 | 1,000 小时（60,000 分钟），预警 990 小时（59,400 分钟） |

**业务逻辑**：同 1.3 pairing-level，使用 `recent_flight_hours.last_365d`。

**告警消息**：`Flight time {actual}h in last 365d exceeds {limit}h limit`

---

### 1.5 `max_dp` — 单次 Duty Period 最大时长

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.3；CAR 700.29(1) §4.30 |
| 实现类型 | Pairing-level checker（duty-level） |
| Python 文件 | `rule-engine/src/core/checkers/duty_period_checker.py`（已存在 stub，需补全） |
| DB template_code | `max_dp` |
| F8 限制 | 从 params 读取，无硬性全局上限，依报到时间表格 |

**业务逻辑**：遍历配对的每个 `DutyPeriod`，计算 `(release_utc - report_utc).total_minutes()`，与 `params["limit_minutes"]`（默认 780）比较。

**告警消息**：`Duty {seq}: DP {actual}min exceeds maximum {limit}min`

---

### 1.6 `max_dp_7d` — 任意 7 天累计工时

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.3；CAR 700.29(1) — 7天60小时选项 |
| 实现类型 | Roster-level checker |
| Python 文件 | `rule-engine/src/core/checkers_roster/` 新建 `max_duty_hours_checker.py` |
| DB template_code | `max_dp_7d` |
| F8 限制 | 60 小时（3600 分钟）/ 7 天，或 70 小时（Phase 2 选项 d） |

**业务逻辑**：对 roster 内每个 pairing，以其结束时刻为基准向前滚动 7 天，累加所有 pairing duty 分钟数 + 地面任务（非 free-from-duty）分钟数（`RosterContext.get_duty_minutes_in_window(end_dt, 7)`），超过 3600 分钟则告警。

**告警消息**：`Duty hours {actual}h in last 7d exceeds {limit}h limit`

---

### 1.7 `min_rest_weekly` — 每周最低休息天数

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.3 GDO 条件；CAR 700.29(1) |
| 实现类型 | Roster-level checker |
| Python 文件 | `rule-engine/src/core/checkers_roster/min_weekly_rest_checker.py`（已有 partial，需补全） |
| DB template_code | `min_rest_weekly` |
| F8 要求 | 任意 168 小时内 ≥1 个单日 Free from Duty；任意 672 小时内 ≥4 个单日 Free from Duty |

**业务逻辑**：扫描 roster 时间线，对每个 7 天窗口和 28 天窗口，统计 Free from Duty 的完整日历日数（`RosterContext._duty_days` 的反面）。

**告警消息**：
- `Only {n} free day(s) in 7-day window, minimum required: 1`  
- `Only {n} free day(s) in 28-day window, minimum required: 4`

---

### 1.8 `qual_airport` — 机场资质检查

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.12 |
| 实现类型 | Pairing-level checker |
| Python 文件 | `rule-engine/src/core/checkers/qualification_checker.py`（已存在 stub） |
| DB template_code | `qual_airport` |

**业务逻辑**：遍历配对内每个 `FlightSegment`，检查 `dep_port` 和 `arr_port` 是否在 `CrewInfo.airport_quals` 列表中（如果机场属于"限制机场"范围）。限制机场列表从 `params["restricted_airports"]` 读取（JSON 数组）。

**告警消息**：`Crew {crewId} lacks airport qualification for {airport}`

**注意**：F8 当前实际 restricted_airports 需在 DB rule_instance.params 中配置，可先设空数组（全通过）等待配置。

---

### 1.9 `qual_fleet` — 机型资质检查

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.12 |
| 实现类型 | Pairing-level checker |
| Python 文件 | `rule-engine/src/core/checkers/qualification_checker.py` |
| DB template_code | `qual_fleet` |

**业务逻辑**：遍历配对内每个 `FlightSegment`，检查 `fleet_code` 是否在 `CrewInfo.fleet_quals` 列表中。若 `fleet_quals` 为空则不检查（向后兼容）。

**告警消息**：`Crew {crewId} lacks fleet qualification for {fleet_code}`

---

### 1.10 `qual_recency` — 近期资质检查

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.12 |
| 实现类型 | Pairing-level checker |
| Python 文件 | `rule-engine/src/core/checkers/qualification_checker.py` |
| DB template_code | `qual_recency` |

**业务逻辑**：检查 `CrewInfo.recent_landings_90d`（近 90 天起落次数）是否满足 `params["min_landings_90d"]`（默认 3 次）。若低于阈值则告警。

**输入数据**：`CrewInfo.recent_landings_90d`（目前已定义于 live-server `rule-engine-client.ts` 中的 `serializeCrew`，需确保 live-server 填充该字段）

**告警消息**：`Crew {crewId} recency check: only {n} landings in last 90 days, minimum {min} required`

---

### 1.11 `composition_check` — 机组构成检查

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.12（Acting Rank）；§4.12（Green on Green，Phase 2） |
| 实现类型 | Pairing-level checker |
| Python 文件 | `rule-engine/src/core/checkers/composition_checker.py`（已存在 stub） |
| DB template_code | `composition_check` |

**Phase 1 实现范围（Acting Rank）**：  
若 `CrewInfo.rank` 为 `CA`（机长）但配对内 `PairingInput.seat_position` 为 `FO`（副驾驶），检查 `CrewInfo.fleet_quals` 中是否包含 `RH`（右座）资质。如缺失 RH 资质则告警。

**注意**：`seat_position` 字段目前不在 `PairingInput` 模型中，需在 `PairingInput` 中新增该字段，同时在 live-server `loadPairingInput` SQL 中查询 `pairing_segment.seat_pos` 或相关字段。

**告警消息**：`Crew {crewId} acting as FO but lacks right-hand (RH) qualification for fleet {fleet}`

---

### 1.12 `max_consecutive_duty_days` — 最大连续值勤天数

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.4（最多 18 个工作日/排班周期，隐含连续限制） |
| 实现类型 | Roster-level checker |
| Python 文件 | `rule-engine/src/core/checkers_roster/consecutive_duty_checker.py`（已存在 stub） |
| DB template_code | `max_consecutive_duty_days` |
| F8 限制 | params["max_days"]，默认无硬性规定，参考 6 天（CBA §8.13） |

**业务逻辑**：从 `RosterContext._duty_days` 计算连续值勤天数（含地面任务天），超过 `params["max_days"]` 则告警。

**告警消息**：`{n} consecutive duty days exceeds maximum of {max}`

---

### 1.13 `min_weekly_rest_days`（roster-level stub）

| 项 | 值 |
|----|----|
| Python 文件 | `rule-engine/src/core/checkers_roster/min_weekly_rest_checker.py` |
| DB template_code | `min_weekly_rest_days` |

**注意**：与 §1.7 `min_rest_weekly` 功能重叠，建议合并为同一实现，使用 `min_rest_weekly` 作为统一 template_code，将 `min_weekly_rest_days` 废弃或指向相同逻辑。

---

## 2. Phase 1 — 在 DB 中存在但缺少 Python checker

---

### 2.1 `max_fdp_extension` — FDP 延长后的上限

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.1；CAR 700.28 |
| 实现类型 | Pairing-level checker |
| Python 文件 | 新建 `rule-engine/src/core/checkers/max_fdp_extension_checker.py` |
| DB template_code | `max_fdp_extension` |

**业务逻辑**：当配对包含 FDP 结束后的 Deadhead（DHD）时，检查 `FDP时间 + DHD时间` 是否超过 `FDP上限 + 延长限制`。延长上限从 `params["max_extension_minutes"]` 读取（默认 180 分钟 = 3 小时，飞行员同意下最多 420 分钟 = 7 小时）。

**输入数据**：`DutyPeriod` 内的 segment 类型（需区分飞行段和 DHD 段）。

**告警消息**：`Duty {seq}: FDP with extension {actual}min exceeds limit {limit}min`

---

### 2.2 `max_fdp_split` — Split Duty FDP 上限

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.1（Split Duty 延长规则） |
| 实现类型 | Pairing-level checker |
| Python 文件 | 新建 `rule-engine/src/core/checkers/max_fdp_split_checker.py` |
| DB template_code | `max_fdp_split` |

**业务逻辑**：当配对中某个 DP 包含 Split Duty（DP 内有 ≥60 分钟休息）时，FDP 上限可按 Split Duty 规则延长。检查实际 FDP 时间是否超过延长后的上限。

**告警消息**：`Duty {seq}: Split duty FDP {actual}min exceeds extended limit {limit}min`

---

### 2.3 `min_rest_post_night` — 夜班后最低休息时间

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.6、§4.8；CAR 700.29(1) §4.36 |
| 实现类型 | Roster-level checker |
| Python 文件 | 新建 `rule-engine/src/core/checkers_roster/min_rest_post_night_checker.py` |
| DB template_code | `min_rest_post_night` |

**业务逻辑**：当某次 FDP 落入 WOCL（02:00–05:59 适应时区），且 FDP 结束于本部基地（`crewBase` 匹配 `arr_port`），检查下次 FDP 报到前的休息时间是否满足加强休息要求。加强休息时长从 `params["min_rest_minutes"]` 读取（默认 780 分钟 = 13 小时）。

**告警消息**：`Rest after night FDP: {actual}min below required {required}min`

---

## 3. Phase 1 — 新规则（需新增 DB 条目 + Python checker）

---

### 3.1 GDO 保障计数（FD）

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.4；ALPA FLE CBA No.1 §8.13 |
| 实现类型 | Roster-level checker |
| 新增 DB | `rule_template.template_code = "min_gdo_count"` |
| Python 文件 | 新建 `rule-engine/src/core/checkers_roster/min_gdo_checker.py` |
| F8 要求 | 30天月份：≥12 GDO；31天月份：≥13 GDO |

**业务逻辑**：统计 roster 排班周期内 `assignment = 'DO'` 的地面任务天数（从 `RosterInput.ground_duties`），与 `params["min_gdo"]` 比较。排班周期定义见 F8-rule.md §2。

**告警消息**：`Only {n} GDOs in bid period, minimum required: {min}`

---

### 3.2 GDO 保障计数（CC）

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §5.3；CUPE §5.01.10 |
| 实现类型 | Roster-level checker |
| 新增 DB | `rule_template.template_code = "min_gdo_count_cc"` 或复用 `min_gdo_count`（role 区分） |
| 适用角色 | CC |

**业务逻辑**：逻辑与 §3.1 相同；CC 特有差异：CC 勤务不得延伸进 GDO（FD 允许），需额外检查是否有 FDP 侵入 DO 日。

**告警消息**：`Duty extends into GDO day {date}（CC rule violation）`

---

### 3.3 Single Daily Check-in（FD）

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.9 |
| 实现类型 | Roster-level checker |
| 新增 DB | `rule_template.template_code = "single_daily_checkin"` |
| Python 文件 | 新建 `rule-engine/src/core/checkers_roster/single_daily_checkin_checker.py` |
| F8 要求 | 每个日历日最多 1 次 FDP 报到 |

**业务逻辑**：以 UTC 日历日（00:00–23:59）分组所有 FDP 的 `report_utc`，若同一日历日出现 ≥2 次报到则告警。需考虑时区偏移（`DutyPeriod.base_utc_offset`）。

**告警消息**：`Multiple check-ins on same calendar day {date}`

---

### 3.4 Single Daily Check-in（CC）

同 §3.3，适用于 CC，法规依据 F8-rule.md §5.5；CUPE §5.01.15。可复用同一 checker，通过 `CrewInfo.division` 区分 FD/CC 参数。

---

### 3.5 最大工时 — 7/28/365 天（FD）

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.3；CAR 700.29(1) |
| 实现类型 | Roster-level checker |
| 新增 DB | `rule_template.template_code = "max_duty_hours_7d"` / `"max_duty_hours_28d"` / `"max_duty_hours_365d"` |
| Python 文件 | 新建 `rule-engine/src/core/checkers_roster/max_duty_hours_checker.py` |
| F8 限制 | 7d: 3600 分钟（60h）；28d: 11520 分钟（192h）；365d: 132000 分钟（2200h） |

**业务逻辑**：使用 `RosterContext.get_duty_minutes_in_window(end_dt, days)` 计算滚动窗口内的总工时（pairing duty + 非 free-from-duty 地面任务时长），超限则告警。

**告警消息**：`Duty hours {actual}h in last {n}d exceeds {limit}h limit`

---

### 3.6 WOCL 连续夜勤限制（FD）

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.8；CAR 700.51(1) |
| 实现类型 | Roster-level checker |
| 新增 DB | `rule_template.template_code = "max_consecutive_wocl"` |
| Python 文件 | 新建 `rule-engine/src/core/checkers_roster/consecutive_wocl_checker.py` |
| F8 限制 | 默认最多 3 个连续 WOCL FDP |

**业务逻辑**：  
判断 FDP 是否为 WOCL 勤务：`report_utc`（转换为适应时区本地时间）落入 [02:00, 05:59]。  
按时间序扫描 pairing timeline，统计连续 WOCL FDP 计数，超过 `params["max_consecutive"]`（默认 3）则告警。  
**Phase 1 简化**：适应时区直接用 `DutyPeriod.base_utc_offset`（本部基地时区），Phase 2 再接入 acclimatization 计算。

**告警消息**：`{n} consecutive WOCL duty periods exceeds maximum of {max}`

---

### 3.7 年龄限制（FD）

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §4.11 |
| 实现类型 | Pairing-level checker |
| 新增 DB | `rule_template.template_code = "age_restriction"` |
| Python 文件 | 新建 `rule-engine/src/core/checkers/age_restriction_checker.py` |

**业务逻辑**：  
若 `CrewInfo.age > 65`（或 DOB 字段计算，需在 CrewInfo 中新增 `date_of_birth`），检查配对是否包含加拿大境外机场（dep/arr 非加拿大 ICAO 前缀）。

**输入数据**：`CrewInfo` 需新增 `date_of_birth: Optional[date]` 字段，live-server 从 `crew.birth_dt` 查询并填充。

**告警消息**：`Crew {crewId} (age {age}) not eligible for international flights`

---

### 3.8 CC 月度学分小时上限

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §5.1；CUPE §5.01.12 |
| 实现类型 | Roster-level checker |
| 新增 DB | `rule_template.template_code = "cc_monthly_credit_hours"` |
| Python 文件 | 新建 `rule-engine/src/core/checkers_roster/cc_credit_hours_checker.py` |
| F8 限制 | 每排班周期 85 学分小时（5100 分钟）；上限 95（5700 分钟）须飞行员同意 |
| 适用角色 | CC（`CrewInfo.division == 'CC'`） |

**Credit Hours 计算**（F8-rule.md §1.8）：每个 pairing 取以下最大值：
- 4.0 小时保底（240 分钟）
- 实际飞行时间（`sum(seg.block_minutes)`）
- 勤务时间 ÷ 2（`dp_duration_minutes / 2`）

累加 roster 内所有 pairing 的 credit hours，与 `params["limit_minutes"]`（默认 5100）比较。

**告警消息**：`CC credit hours {actual}h exceeds monthly limit {limit}h in bid period`

---

### 3.9 CC 连续待命天数

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §5.6；CUPE §5.07.04 |
| 实现类型 | Roster-level checker |
| 新增 DB | `rule_template.template_code = "cc_max_consecutive_reserve"` |
| Python 文件 | 新建 `rule-engine/src/core/checkers_roster/cc_reserve_checker.py` |
| F8 限制 | 最多 6 个连续待命天（`assignment = 'SBY'`）；每月最多 20 天待命 |
| 适用角色 | CC |

**业务逻辑**：从 `RosterInput.ground_duties` 中筛选 `assignment = 'SBY'`，统计连续天数及月度总天数，超限则告警。

**告警消息**：
- `CC consecutive reserve days: {n} days, maximum is 6`
- `CC total reserve days: {n} in bid period, maximum is 20`

---

### 3.10 CC Green on Green

| 项 | 值 |
|----|----|
| 法规依据 | F8-rule.md §5.7 |
| 实现类型 | Pairing-level checker（需多机组成员共享同一配对） |
| 新增 DB | `rule_template.template_code = "cc_green_on_green"` |
| Python 文件 | 新建 `rule-engine/src/core/checkers/cc_green_checker.py` |
| F8 要求 | 同一航班中 Green 乘务员 ≤2（Green = 累计飞行航段数 < 8） |
| 适用角色 | CC |

**输入数据**：`CrewInfo.total_segments`（累计完成航段数），需在 `CrewInfo` 中新增该字段，live-server 从 `crew_qualification` 或类似表查询。

**注意**：此规则需同一配对内所有乘务员的 CrewInfo，属于"多人共同检查"场景。建议在 roster-level checker 实现，按 pairing 分组后检查组内 Green 人数。

**告警消息**：`Pairing {pairingId}: {n} Green cabin crew on same flight, maximum is 2`

---

## 4. 数据模型变更汇总

实现上述规则需对以下数据模型做扩展：

| 字段 | 模型 | 用途 | 来源 |
|------|------|------|------|
| `date_of_birth` | `CrewInfo` | 年龄限制 §3.7 | `crew.birth_dt` |
| `total_segments` | `CrewInfo` | CC Green on Green §3.10 | `crew_qualification` 或日志表 |
| `seat_position` | `PairingInput` | Acting Rank §1.11 | `pairing_segment.seat_pos` |

Python `CrewInfo` 模型文件：`rule-engine/src/core/types/input.py`  
TypeScript `CrewInfo` 类型文件：`live-server/src/types/rule-engine.ts`  
序列化函数：`live-server/src/services/rule-engine-client.ts` `serializeCrew()`  
数据查询：`live-server/src/services/rule-check/rule-check-data-service.ts` `loadCrewInfo()`

---

## 5. 实施优先级

| 优先级 | 条目 | 理由 |
|--------|------|------|
| P0（阻断） | §0.1 template_code mismatch | 当前所有飞行时间计算不生效 |
| P0（阻断） | §0.2 roster 28d template_code | roster 级别检查完全死代码 |
| P1（核心） | §1.3 max_ft_28d, §1.4 max_ft_365d | CAR 法规强制要求 |
| P1（核心） | §3.1 GDO FD, §3.3 Single Check-in FD | ALPA CBA 核心条款 |
| P1（核心） | §3.8 CC credit hours | CUPE 核心条款 |
| P2（合规） | §2.3 min_rest_post_night, §3.6 WOCL | CAR 700.51 |
| P2（合规） | §1.5 max_dp, §3.5 max_duty_hours | CAR 700.29 |
| P3（完整性） | §1.8–1.10 qual_* | 资质校验 |
| P3（完整性） | §3.9 CC reserve, §3.10 CC green | CUPE §5.07 |
| P4（Phase 2） | §4.10 acclimatization, extended rest | 复杂度高，依赖时区适应逻辑 |

---

## 6. Phase 2（规划中，不在本 spec 范围）

- 适应时区（Acclimatization）完整计算（FD + CC）
- 返回本部基地附加休息（CAR 700.42(2)）
- Positioning 后特殊休息计算（CAR 700.43(1)）
- 工时 70h/7d 选项（FD，严格条件）
- 24 小时内最大航段数（CC §5.2）
- Green on Green — FD 版本（§4.12）
- Prohibited Crew Pairs（CC，含 FD×CC 禁止同飞）
- Language Qualification（CC）
