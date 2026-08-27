# RO 引擎 I/O 格式规范

> 通用格式规范详见 `docs/modules/po-engine/io-format.md`。本文档描述 RO 引擎实际实现的节格式。
> 标注 `[DEFERRED]` 的字段/节已在规范中设计，当前版本尚未实现。

---

## 一、物理格式（与 PO 相同）

- 外层：gzip 压缩
- 内层：UTF-8 文本，`## SECTION_NAME` 行分节，每节内为标准 CSV（含表头）
- 注释行：`# ...`（解析时跳过）
- 时间格式：**epoch 分钟**（自 2000-01-01 00:00 UTC 起的分钟数，`int`）
  - 转换：`minutes = (dt - datetime(2000,1,1,UTC)).total_seconds() // 60`

---

## 二、`input.gz` 节规范

### JOB_PARAMS（必须，一行）

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `workset_id` | int | 场景主键 | — |
| `run_id` | string | 运行序号（如 `001`） | — |
| `engine` | string | 固定为 `ro` | — |
| `airline` | string | 航司二字码 | — |
| `start_date` / `end_date` | YYYY-MM-DD | 排班日期范围 | — |
| `fleet` | string | 机型（空 = 全机型） | `""` |
| `division` | P/C | 飞行员 / 客舱 | — |
| `rule_group_code` | string | 法规集合代码 | `CAAC_FTL` |
| `time_limit_sec` | int | 总求解时间上限（秒） | 300 |
| `max_iterations` | int | Lagrangian 最大迭代次数 | 500 |
| `max_tafb_hours` | int | 最大离基时间（小时） | 72 |
| `preferred_base_weight` | float | 基地偏好软惩罚权重 | 50.0 |
| `fairness_target_hours` | float | 工时公平目标（小时/月） | 80.0 |
| `weights_unassigned` | float | 未覆盖配对代理惩罚权重 | 1000.0 |

### RULE_CONFIG_META（一行）

| 字段 | 说明 |
|------|------|
| `group_code` | 法规组代码（如 `CAAC_FTL`） |
| `group_name` | 法规组名称 |
| `usage` | 固定为 `RO` |
| `filiale` | 航司二字码（大写） |
| `division` | P 或 C |

### RULES（多行）

| 字段 | 说明 |
|------|------|
| `template_code` | 规则模板代码 |
| `instance_code` | 规则实例代码 |
| `name` | 规则名称 |
| `category` | `FDP` / `REST` / `DUTY` / `FLIGHT_TIME` |
| `check_type` | `CHECK` / `CALC` / `BOTH` |
| `severity` | `ERROR` / `WARNING` |
| `overridable` | `true` / `false` |
| `constraint_type` | `HARD` / `SOFT`（可空） |
| `params_json` | JSON 字符串（fdpTable, minRestMinutes 等具体参数） |

### CREWS（多行）

| 字段 | 类型 | 说明 |
|------|------|------|
| `crew_id` | string | 机组员唯一标识 |
| `first_name` | string | 名 |
| `last_name` | string | 姓 |
| `division` | string | P=飞行员, C=客舱 |
| `rank` | string | CA/FO/FP/CS/FA 等 |
| `base` | string | 基地机场 IATA 代码 |
| `fleet` | string | 主机型代码（同时作为 fleet_codes 兜底值） |
| `team` | string | 组别（可空） |
| `status` | int | 1=在职，默认 1 |
| `filiale` | string | 所属子公司（可空） |

### CREW_QUALIFICATIONS（多行，每机组员可有多行，可为空节）

| 字段 | 说明 |
|------|------|
| `crew_id` | 关联 CREWS.crew_id |
| `qual_type` | `FLEET`（机型资质）或 `AIRPORT`（特殊机场资质） |
| `qual_code` | 资质代码（机型如 `B738`，机场如 `LHR`） |

> 若某机组员无 FLEET 类型的行，系统将 `crew.fleet` 字段作为唯一机型资质。
> `AIRPORT` 类型当前解析后存入 `crew.airport_quals`，但**预过滤中的机场资质检查尚未实现** [DEFERRED]。

### CREW_FTL_STATE（多行）

记录排班窗口**开始时刻**的 FTL 累计状态，**时间字段单位为 epoch 分钟**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `crew_id` | string | 关联 CREWS.crew_id |
| `month_flt_min_used` | int | 本月已用飞行分钟 |
| `quarter_flt_min_used` | int | 本季度已用飞行分钟 |
| `year_flt_min_used` | int | 本年度已用飞行分钟 |
| `last_duty_end_min` | int | 最后值勤结束（epoch 分钟，0=无历史） |
| `last_rest_end_min` | int | 最后休息结束（epoch 分钟，0=无历史） |
| `consecutive_duty_days` | int | 当前连续值勤天数 |

### LOCKED_ASSIGNMENTS（多行，可为空节）

| 字段 | 说明 |
|------|------|
| `crew_id` | 关联 CREWS.crew_id |
| `entry_type` | `LEAVE` / `TRAINING` / `LOCKED_PAIRING` / `GROUND_DUTY` |
| `ref_id` | 锁定事项的外部 ID |
| `start_min` | 开始时刻（epoch 分钟） |
| `end_min` | 结束时刻（epoch 分钟） |
| `flt_min` | 飞行分钟贡献（休假/培训填 0） |

### PAIRINGS（多行）

| 字段 | 类型 | 说明 |
|------|------|------|
| `pairing_id` | int | 配对唯一标识 |
| `pairing_label` | string | 显示用标签（如 `PO-0001`） |
| `division` | string | P / C |
| `base` | string | 基地机场 IATA |
| `fleet` | string | 机型代码（空 = 不限） |
| `start_min` | int | 第一个值勤期开始（epoch 分钟） |
| `end_min` | int | 最后一个值勤期结束（epoch 分钟） |
| `tafb_min` | int | 离基时间（分钟） |
| `total_flt_min` | int | 全程总飞行时间（分钟） |
| `duty_count` | int | 值勤期数量 |
| `seg_count` | int | 总航段数量 |

### PAIRING_DUTIES（多行）

| 字段 | 类型 | 说明 |
|------|------|------|
| `pairing_id` | int | 关联 PAIRINGS.pairing_id |
| `duty_seq` | int | 值勤期序号（从 1 开始，按此排序） |
| `duty_start_min` | int | 值勤期开始（epoch 分钟） |
| `duty_end_min` | int | 值勤期结束（epoch 分钟） |
| `fdp_min` | int | 飞行值勤期时长（分钟） |
| `flt_min` | int | 本值勤期飞行时间（分钟） |
| `rest_after_min` | int | 本值勤期后计划休息时间（末个值勤期填 0） |

### PAIRING_COMPOSITIONS（多行）

| 字段 | 说明 |
|------|------|
| `pairing_id` | 关联 PAIRINGS.pairing_id |
| `rank` | 职级代码（CA / FO / FP 等） |
| `required_count` | 该职级的需求人数 |

---

## 三、`out.gz` 节规范

### RESULT_META（一行）

| 字段 | 说明 |
|------|------|
| `status` | `DONE` / `INFEASIBLE` / `TIMEOUT` / `FAILED` |
| `solve_time_sec` | 总耗时（秒，保留 2 位小数） |
| `total_assignments` | 分配记录总数 |
| `total_pairings` | 输入配对数 |
| `total_crews` | 输入机组员数 |
| `total_iterations` | Lagrangian 实际迭代次数 |
| `dual_bound` | 最优对偶界（4 位小数） |
| `primal_obj` | 原始目标值（4 位小数） |
| `error` | 错误描述（成功时为空字符串） |
| `generated_at` | ISO 8601 UTC 时间戳 |

### KPI（一行）

当前实现的字段：

| 字段 | 说明 |
|------|------|
| `total_pairings` | 总配对数 |
| `fully_covered` | 所有职级需求均满足的配对数 |
| `coverage_pct` | `fully_covered / total_pairings × 100`（保留 1 位小数） |
| `total_crews` | 总机组员数 |
| `total_assignments` | 总分配记录数 |
| `total_flt_min` | 所有分配的总飞行分钟数 |

> [DEFERRED] 规范中还包含：`unassigned_pairings`、`assignment_rate`、`crews_used`、`avg_flight_hours`、`flight_hours_std_dev`、`base_match_rate`、`total_deadheads`、`cpsat_polish_rounds`。

### ASSIGNMENTS（多行）

每行表示一名机组员被分配到一个配对：

| 字段 | 说明 |
|------|------|
| `crew_id` | 机组员 ID |
| `pairing_id` | 配对 ID |
| `acting_rank` | 执行职级 |
| `base_match` | `1`=基地匹配，`0`=基地不匹配 |

### UNASSIGNED_PAIRINGS [DEFERRED]

规范中要求输出未能覆盖的配对及原因，当前版本未实现。设计字段：

| 字段 | 说明 |
|------|------|
| `pairing_id` | 未完全覆盖的配对 |
| `pairing_label` | 显示标签 |
| `rank` | 缺人的职级 |
| `required_count` | 需求人数 |
| `assigned_count` | 实际分配人数 |
| `reason` | `NO_QUALIFIED_CREW` / `FTL_EXHAUSTED` / `TIME_CONFLICT` / `PARTIAL` |

---

## 四、状态码含义与退出码对照

| `status` | 退出码 | 含义 | 触发条件 |
|---------|--------|------|---------|
| `DONE` | 0 | 成功，覆盖率 ≥ 99% | 所有配对的所有职级需求均满足 |
| `TIMEOUT` | 2 | 超时，部分覆盖 | 时间耗尽（≥ 95% 预算），覆盖率 < 99% |
| `INFEASIBLE` | 1 | 无解，覆盖率不足 | 未超时但覆盖率 < 99% |
| `FAILED` | 3 | 内部错误 | 异常崩溃，由 `__main__.py` 捕获后写入 |

---

## 五、示例

```
# RO Engine Input Snapshot
# Generated: 2026-04-18T10:00:00Z

## JOB_PARAMS
workset_id,run_id,engine,airline,time_limit_sec
101,001,ro,f8,300

## RULE_CONFIG_META
group_code,group_name,usage,filiale,division
CAAC_FTL,CCAR-121 飞行时间限制,RO,F8,P

## RULES
template_code,instance_code,name,category,check_type,severity,overridable,constraint_type,params_json
MIN_REST,MIN_REST_01,Minimum rest,REST,CHECK,ERROR,false,HARD,"{""minRestMinutes"":600}"
FDP_LIMIT,FDP_LIMIT_01,FDP limit,FDP,CHECK,ERROR,false,HARD,"{""maxFdpMinutes"":720}"

## CREWS
crew_id,first_name,last_name,division,rank,base,fleet
C001,Zhang,San,P,CA,PEK,B738

## CREW_QUALIFICATIONS
crew_id,qual_type,qual_code
C001,FLEET,B738

## CREW_FTL_STATE
crew_id,month_flt_min_used,quarter_flt_min_used,year_flt_min_used,last_duty_end_min,last_rest_end_min,consecutive_duty_days
C001,1200,4800,18000,13884000,13884600,0

## LOCKED_ASSIGNMENTS
crew_id,entry_type,ref_id,start_min,end_min,flt_min

## PAIRINGS
pairing_id,pairing_label,division,base,fleet,start_min,end_min,tafb_min,total_flt_min,duty_count,seg_count
1,PO-0001,P,PEK,B738,13884720,13885020,300,180,1,2

## PAIRING_DUTIES
pairing_id,duty_seq,duty_start_min,duty_end_min,fdp_min,flt_min,rest_after_min
1,1,13884720,13885020,300,180,0

## PAIRING_COMPOSITIONS
pairing_id,rank,required_count
1,CA,1
```

```
## RESULT_META
status,solve_time_sec,total_assignments,total_pairings,total_crews,error,generated_at
DONE,1.23,1,1,1,,2026-04-18T10:00:01Z

## KPI
total_pairings,fully_covered,coverage_pct,total_crews,total_assignments,total_flt_min
1,1,100.0,1,1,180

## ASSIGNMENTS
crew_id,pairing_id,acting_rank,base_match
C001,1,CA,1
```
