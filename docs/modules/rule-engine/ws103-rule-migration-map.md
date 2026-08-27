# Workset 103 法规迁移对照表

迁移来源：旧 `rule_set`（workset_id = 103，名称 "New Scenario"，filiale = F8，division = P）  
迁移目标：新 `rule_instance`（14 条，division = P，filiale = F8，**未加入任何 rule_group，需手动加入集合**）

---

## 14 条法规对照

| # | 旧 function/instance | 旧描述 | 旧 class | → 新 template_code | → 新 instance_code | 备注 |
|---|---|---|---|---|---|---|
| 1 | 8002/006 | Maximum Flight Time | B | `max_ft` | `max_ft_flair_f8_p` | 28d 112h · 90d 300h · 365d 1000h (BH) |
| 2 | 8002/009 | Maximum Hours of Work | B | `max_duty_hours` | `max_duty_hours_flair_f8_p` | 7d 60h · 28d 192h · 365d 2200h (DP) |
| 3 | 7272/001 | Calculate DP of the Reserves | R | `duty_period_calculator` | `dp_calc_reserves_f8_p` | 计算器类，无参数 |
| 4 | 7500/002 | Basic definition of Acc State | R | `acc_state` | `acc_state_f8_p` | 新建模板；时区差/停留时长驱动习服状态 |
| 5 | 7501/004 | Single Day Free from Duty in Rolling Hours | R | `min_gdo_count` | `min_gdo_rolling_f8_p` | 168h/1 GDO · 672h/4 GDOs 滚动窗口 |
| 6 | 7502/002 | The Calculation of Credit Hours | R | `credit_hours_calc` | `credit_hours_calc_f8_p` | 新建模板；FLY×1.0 BH · GND×0.5 DP · DO/SBY 最少 4h |
| 7 | 7503/003 | Limits of Consecutive WOCLs | R | `max_consecutive_wocl` | `max_consec_wocl_f8_p` | WOCL 02:00-05:59，最多连续 3 次 |
| 8 | 7504/003 | Spacing Rule - WOCL | R | `wocl_spacing` | `wocl_spacing_f8_p` | 新建模板；FLY→FLY WOCL→WOCL 最少 55h |
| 9 | 7505/002 | Min # GDOs in a RP | R | `min_gdo_count` | `min_gdo_rp_f8_p` | 参数空（待补 RP 窗口值） |
| 10 | 7506/002 | One Checkin Per Day | R | `single_daily_checkin` | `single_checkin_f8_p` | 每天只允许一次签到 |
| 11 | 8004/004 | Basic Competency-F8 | R | `qual_fleet` | `qual_competency_f8_p` | BASE check=Y；RANK/FLEET=N |
| 12 | 8030/004 | Age Restriction | R | `age_restriction` | `age_restriction_f8_p` | P division，≥65 岁不可执飞，每环最多 1 人 |
| 13 | 8056/006 | Roster Spacing | R | `roster_spacing` | `roster_spacing_f8_p` | 新建模板；FLY → FLY\|SBY\|SIM 最少 13h |
| 14 | 2014/014 | Local Night Definition | B | `local_night_def` | `local_night_f8_p` | 新建模板；夜间 22:00-08:00，最少 8h |

---

## 模板合并变更（本次同步完成）

| 旧模板（已删除） | 旧 instance（已软删除） | → 新模板 | → 新合并 instance | 影响 group |
|---|---|---|---|---|
| `max_ft_7d` | `max_ft_7d_std` | `max_ft` | `max_ft_ccar_std` | ccar121_po/ro/pbs, flair_gantt_rule_fd/cc |
| `max_ft_28d` | `max_ft_28d_std` | ↑ | ↑ | ↑ |
| `max_ft_365d` | `max_ft_365d_std` | ↑ | ↑ | ↑ |
| `max_duty_hours_7d` | `f8_max_dh_7d` | `max_duty_hours` | `max_duty_hours_f8_std` | flair_gantt_rule_fd/cc |
| `max_duty_hours_28d` | `f8_max_dh_28d` | ↑ | ↑ | ↑ |
| `max_duty_hours_365d` | `f8_max_dh_365d` | ↑ | ↑ | ↑ |

`min_gdo_count` 模板 param_schema 已更新为 `windows` 数组格式（兼容旧 instance `f8_min_gdo_count`，旧参数 `{"min_gdo":12}` 保持不变，引擎侧需兼容处理）。

---

## 新建模板清单

| template_code | 对应旧 function | check_type | 说明 |
|---|---|---|---|
| `max_ft` | 8002/006 | CHECK | 多窗口飞行时间，params.periods 数组 |
| `max_duty_hours` | 8002/009 | CHECK | 多窗口值勤时间，params.periods 数组 |
| `acc_state` | 7500/002 | CALC | 习服状态计算（时区差/停留时长表） |
| `wocl_spacing` | 7504/003 | CHECK | WOCL 间隔检查，params.rules 数组 |
| `local_night_def` | 2014/014 | CALC | 本地夜间时段定义 |
| `roster_spacing` | 8056/006 | CHECK | 排班层级间隔检查，params.rules 数组 |
| `credit_hours_calc` | 7502/002 | CALC | 信用小时计算配置（FT/DP 比例） |

---

## 待处理事项

1. ~~**`min_gdo_rp_f8_p` 参数待补**~~ ✅ 已补全：7d→2 GDOs / 14d→3 GDOs / 30d→5 GDOs；含 F8 自定义 RP 定义（Jan 01-30 / Jan 31-Mar 01 / Mar 02-31 / Apr-Dec 自然月）。
2. ~~**引擎适配**~~ ✅ 已完成：`AccStateCalculator`（calculators/）、`WoclSpacingChecker`、`RosterSpacingChecker`、`CreditHoursCalcChecker`（checkers_roster/）全部实现并注册。
3. ~~**`max_ft` / `max_duty_hours` 引擎适配**~~ ✅ 已完成：`MaxFtChecker`（多周期 periods 数组）、`MaxDutyHoursMultiChecker` 新增并注册；旧单周期 checker 保留向后兼容。
4. ~~**`min_gdo_count` 引擎适配**~~ ✅ 已完成：`MinGdoChecker` / `MinGdoCcChecker` 同时支持 `params.windows`（滚动窗口）和旧 `params.min_gdo`（bid period 全量），向后兼容。
5. ~~**加入法规集合**~~ ✅ 已完成：14 条 instance 全部加入 `flair_gantt_rule_fd`（默认 GANTT 集合），sort_order 32-45，全部 enabled=true。
