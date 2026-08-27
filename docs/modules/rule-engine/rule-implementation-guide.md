# 法规实现指南 — 检查类 vs 计算类

## 两类法规的本质区别

| | 检查类 (CHECK) | 计算类 (CALC) |
|---|---|---|
| **职责** | 判断"是否合规"，输出 pass/fail | 算出一个值，供其他法规或业务使用 |
| **输出** | `{ pass: boolean, message: string }` | `{ value: number/object }` |
| **举例** | FDP 是否超限？休息是否够？ | 这个 duty 的 FDP 是多少分钟？ |
| **依赖关系** | 检查类通常依赖计算类的结果 | 计算类独立，不依赖其他法规 |
| **执行顺序** | 后执行（先有计算结果才能检查） | 先执行（提供数据给检查类） |

**核心关系：计算类先算出值，检查类拿值去比对阈值。**

```
计算类：fdp_calculator → 输出 fdp_minutes = 745
检查类：max_fdp → 输入 fdp_minutes = 745, 阈值 780 → pass: true

计算类：rest_calculator → 输出 rest_minutes = 480
检查类：min_rest → 输入 rest_minutes = 480, 阈值 600 → pass: false, "休息不足"
```

---

## 执行流程

```
┌─────────────────────────────────────────────────┐
│              法规引擎执行流程                      │
│                                                 │
│  输入: ruleSetId + 业务数据                       │
│                                                 │
│  Step 1: 加载法规集合配置                         │
│          ↓                                      │
│  Step 2: 按依赖排序（计算类优先）                  │
│          ↓                                      │
│  Step 3: 执行计算类法规，生成中间结果               │
│          │                                      │
│          │  fdp_calculator → 745 min             │
│          │  rest_calculator → 480 min            │
│          │  flight_hour_calculator → 32.5 h      │
│          │  manday_calculator → 8.2 h            │
│          ↓                                      │
│  Step 4: 执行检查类法规，使用中间结果               │
│          │                                      │
│          │  max_fdp: 745 ≤ 780 → ✓ pass         │
│          │  min_rest: 480 < 600 → ✗ fail        │
│          │  max_flight_7d: 32.5 ≤ 60 → ✓ pass   │
│          ↓                                      │
│  Step 5: 汇总输出                                │
│          - 检查结果: [{rule, pass, level, msg}]  │
│          - 计算结果: [{rule, value, unit}]       │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 计算类法规详解

### 用途

计算类法规不做判断，只输出数值。有两个使用场景：

1. **供检查类法规使用** — 算出 FDP 值 → 交给 max_fdp 检查
2. **供业务展示使用** — 算出工时 → Gantt 界面显示、薪酬计算

### 实现模板

```typescript
// 计算类法规接口
interface CalcRule {
  code: string
  calculate(input: CalcInput): CalcOutput
}

interface CalcInput {
  duty: {                          // 当前执勤期
    report_time: string            // 报到时间 (UTC)
    release_time: string           // 收尾时间 (UTC)
    segments: Segment[]            // 航段列表
  }
  crew: {                          // 机组信息
    base_airport: string
    rank: string
  }
  params: Record<string, any>      // 法规参数 (JSONB)
  context?: Record<string, any>    // 上下文（其他计算类的输出）
}

interface CalcOutput {
  value: number | Record<string, number>
  unit: string                     // minutes / hours / count / score
  details?: Record<string, any>    // 明细（可选，用于界面展示）
}
```

### 计算类法规清单及实现逻辑

#### 1. fdp_calculator — 飞行执勤期计算

**CCAR 条款**: 121.489

```
输入: duty.report_time, duty.release_time, duty.segments
输出: { value: 745, unit: 'minutes', details: { report: '06:00', release: '18:25' } }

计算逻辑:
  fdp = release_time - report_time

  注意事项:
  - report_time = 首航段计划起飞时间 - 报到提前量（国内60min/国际90min）
  - release_time = 末航段实际落地时间 + 收尾时间（通常15-30min）
  - 参数 report_advance_domestic / report_advance_international / debrief_minutes 可配
```

#### 2. rest_calculator — 休息时间计算

**CCAR 条款**: 121.493

```
输入: prev_duty.release_time, next_duty.report_time, crew.base_airport, actual_airport
输出: { value: 600, unit: 'minutes', details: { location: 'outstation', type: 'standard' } }

计算逻辑:
  rest = next_report_time - prev_release_time

  需区分:
  - 基地休息 vs 外站休息（外站可能有交通时间扣减）
  - 标准休息 vs 缩短休息
  - 参数 outstation_transport_minutes 可配
```

#### 3. flight_hour_calculator — 飞行小时累计

**CCAR 条款**: 121.487

```
输入: crew_id, date_range, roster_data
输出: {
  value: {
    rolling_7d: 2160,     // 7天累计（分钟）
    rolling_28d: 5400,    // 28天累计
    rolling_90d: 14500,   // 90天累计
    rolling_365d: 52000   // 年度累计
  },
  unit: 'minutes'
}

计算逻辑:
  对每个滚动窗口:
    sum(block_time) for flights in window

  注意:
  - block_time = 轮挡时间（撤轮挡→到轮挡）
  - 参数 count_deadhead / count_positioning 控制是否计入调机
```

#### 4. duty_period_calculator — 执勤期计算

**CCAR 条款**: 121.489

```
输入: duty 数据
输出: { value: 840, unit: 'minutes', details: { includes_ground: true } }

计算逻辑:
  duty_period = duty_end - duty_start

  含地面任务时:
    duty_period = max(flight_duty_end, ground_duty_end) - min(flight_duty_start, ground_duty_start)
```

#### 5. manday_calculator — 工时计薪计算

```
输入: crew, roster_data, date_range
输出: {
  value: {
    actual_hours: 8.2,
    pay_hours: 9.5,
    overtime_hours: 1.3,
    night_hours: 2.0
  },
  unit: 'hours',
  details: { breakdown: [...] }
}

计算逻辑:
  各航司薪酬规则差异大，完全参数化:
  - 参数 base_rate / night_multiplier / overtime_threshold / holiday_multiplier 等
  - 计薪规则由 params 控制，不硬编码
```

#### 6. fatigue_risk_calculator — 疲劳风险评分

**CCAR 条款**: 121.495 (FRMS)

```
输入: duty, crew_recent_history (近期排班)
输出: { value: 72.5, unit: 'score', details: { sleep_pressure: 45, circadian: 27.5 } }

计算逻辑:
  fatigue_score = sleep_pressure_score + circadian_disruption_score

  sleep_pressure: 基于最近 N 小时的睡眠机会估算
  circadian: 基于执勤时间与生物钟的偏离程度

  参数: sleep_opportunity_model / circadian_model / thresholds
```

#### 7. consecutive_days_calculator — 连续工作天数计算

```
输入: crew_id, date, roster_data
输出: { value: 5, unit: 'days' }

计算逻辑:
  从 date 往前/往后数连续有执勤的天数
```

---

## 检查类法规详解

### 用途

拿计算类的输出值与阈值比对，判断合规/违规。

### 实现模板

```typescript
// 检查类法规接口
interface CheckRule {
  code: string
  check(input: CheckInput): CheckOutput
}

interface CheckInput {
  calcResults: Record<string, CalcOutput>  // 计算类法规的输出
  duty?: DutyData
  crew?: CrewData
  roster?: RosterData
  params: Record<string, any>              // 法规参数 (JSONB)
  conditions?: Record<string, any>         // 生效条件
}

interface CheckOutput {
  pass: boolean
  level: 'ERROR' | 'WARNING' | 'INFO'
  rule_code: string
  message: string                          // 人类可读消息
  actual_value?: number                    // 实际值
  limit_value?: number                     // 阈值
  overridable: boolean                     // 是否可豁免
  details?: Record<string, any>            // 附加信息
}
```

### 检查类法规清单及实现逻辑

#### 1. max_fdp — 最大飞行执勤期检查

**CCAR 条款**: 121.489

```
依赖计算: fdp_calculator
参数 (JSONB):
{
  "base_limit_minutes": 780,
  "segment_adjustments": [
    { "min_segments": 1, "max_segments": 3, "limit_minutes": 780 },
    { "min_segments": 4, "max_segments": 5, "limit_minutes": 720 },
    { "min_segments": 6, "max_segments": 99, "limit_minutes": 660 }
  ],
  "time_of_day_adjustments": [...]
}

检查逻辑:
  1. 取 fdp_calculator 的输出值 fdp_minutes
  2. 根据航段数查 segment_adjustments 得到 limit
  3. 根据报到时间查 time_of_day_adjustments 取较小值
  4. fdp_minutes ≤ limit → pass
  5. fdp_minutes > limit → fail, message: "FDP {fdp_minutes}min exceeds limit {limit}min"
```

#### 2. min_rest_between_duty — 最小休息时间检查

**CCAR 条款**: 121.493

```
依赖计算: rest_calculator
参数:
{
  "standard_minutes": 600,
  "reduced_minimum_minutes": 540,
  "after_extended_fdp_minutes": 720,
  "consecutive_reduced_max": 2
}

检查逻辑:
  1. 取 rest_calculator 输出 rest_minutes
  2. 如果前一个 duty 是延伸FDP → limit = after_extended_fdp_minutes
  3. 否则 limit = standard_minutes
  4. rest_minutes ≥ limit → pass
  5. rest_minutes < limit 但 ≥ reduced_minimum_minutes → WARNING（缩短休息需审批）
  6. rest_minutes < reduced_minimum_minutes → ERROR
```

#### 3. max_flight_time_cumulative — 累计飞行时间检查

**CCAR 条款**: 121.487

```
依赖计算: flight_hour_calculator
参数:
{
  "limits": [
    { "period_days": 7, "max_minutes": 3600 },
    { "period_days": 28, "max_minutes": 6000 },
    { "period_days": 90, "max_minutes": 16200 },
    { "period_days": 365, "max_minutes": 60000 }
  ]
}

检查逻辑:
  对每个 period:
    actual = flight_hour_calculator.value[period_key]
    actual ≤ max_minutes → pass
    actual > max_minutes → fail

  任一 period 违规 → 整体 fail（返回所有违规项）
```

#### 4. max_consecutive_duty_days — 连续工作天数检查

**CCAR 条款**: 121.491

```
依赖计算: consecutive_days_calculator
参数:
{
  "max_days": 7,
  "rest_after_max_days_hours": 36
}

检查逻辑:
  consecutive_days ≤ max_days → pass
  consecutive_days > max_days → fail
```

#### 5. min_rest_weekly — 每周最小休息检查

**CCAR 条款**: 121.493

```
参数:
{
  "period_days": 7,
  "min_consecutive_rest_hours": 36
}

检查逻辑:
  在任意连续7天窗口中:
    找出最长连续休息时段
    ≥ min_consecutive_rest_hours → pass
    < min_consecutive_rest_hours → fail
```

#### 6. fdp_extension_check — FDP延伸合规检查

**CCAR 条款**: 121.489

```
依赖计算: fdp_calculator
参数:
{
  "max_extension_minutes": 120,
  "requires_commander_approval": true,
  "max_total_with_extension": 840,
  "min_rest_after_extension": 720,
  "max_extensions_in_period": { "days": 7, "count": 2 }
}

检查逻辑:
  1. fdp_minutes > base_limit → 进入延伸检查
  2. fdp_minutes ≤ max_total_with_extension → 允许延伸
  3. 检查7天内延伸次数 ≤ max_extensions_in_period.count
  4. 标记需要 commander_approval
  5. 延伸后下一个休息 ≥ min_rest_after_extension
```

#### 7. aircraft_type_rating — 机型资质检查

**CCAR 条款**: 121.453

```
参数:
{
  "check_mode": "strict"
}

检查逻辑:
  crew 持有的机型资质 ∋ flight.aircraft_type → pass
  否则 → fail, "机组缺少 {aircraft_type} 机型资质"
```

#### 8. recency_check — 近期经历检查

**CCAR 条款**: 121.457

```
依赖计算: （需查询近期飞行记录）
参数:
{
  "period_days": 90,
  "min_landings": 3,
  "aircraft_type_specific": true
}

检查逻辑:
  过去 90 天内在同机型的着陆次数 ≥ 3 → pass
  否则 → fail, "近期经历不足，需模拟机训练"
```

#### 9. fatigue_risk_check — 疲劳风险检查

**CCAR 条款**: 121.495

```
依赖计算: fatigue_risk_calculator
参数:
{
  "thresholds": {
    "low": { "max_score": 40, "level": "INFO" },
    "medium": { "max_score": 70, "level": "WARNING" },
    "high": { "max_score": 90, "level": "WARNING" },
    "critical": { "max_score": 100, "level": "ERROR" }
  }
}

检查逻辑:
  score = fatigue_risk_calculator.value
  根据 score 落入哪个区间，返回对应 level
```

#### 10. crew_composition_check — 机组编制检查

**CCAR 条款**: 121.463

```
参数:
{
  "min_captains": 1,
  "min_first_officers": 1,
  "new_captain_requires_experienced_fo": true,
  "new_captain_hour_threshold": 500
}

检查逻辑:
  captain_count ≥ min_captains → pass (否则 fail)
  fo_count ≥ min_first_officers → pass (否则 fail)
  如果 captain.total_hours < 500 → 检查 fo 是否有经验
```

---

## 调用方使用示例

### live-server / pbs-server 调用（HTTP）

```typescript
// 批量检查请求
POST /api/check
{
  "rule_group_code": "ccar121_full",
  "items": [{
    "crew": { "id": "C001", "rank": "captain", "base": "PEK", "qualifications": [...] },
    "duty": {
      "report_time": "2026-03-23T06:00:00Z",
      "release_time": "2026-03-23T18:25:00Z",
      "segments": [
        { "flight_no": "CA101", "dep": "PEK", "arr": "SHA", "std": "07:00", "sta": "09:15", "aircraft_type": "A320" },
        { "flight_no": "CA102", "dep": "SHA", "arr": "CAN", "std": "10:30", "sta": "13:00", "aircraft_type": "A320" },
        { "flight_no": "CA103", "dep": "CAN", "arr": "PEK", "std": "15:00", "sta": "18:00", "aircraft_type": "A320" }
      ]
    },
    "prev_duty_release": "2026-03-22T22:00:00Z",
    "recent_history": { "flight_hours_7d": 1800, "flight_hours_28d": 4200 }
  }]
}

// 响应
{
  "code": 200,
  "data": {
    "calc_results": [
      { "rule": "fdp_calculator", "value": 745, "unit": "minutes" },
      { "rule": "rest_calculator", "value": 480, "unit": "minutes" },
      { "rule": "flight_hour_calculator", "value": { "rolling_7d": 2160 }, "unit": "minutes" }
    ],
    "check_results": [
      { "rule": "max_fdp", "pass": true, "level": "INFO", "actual": 745, "limit": 780, "message": "FDP within limit" },
      { "rule": "min_rest_between_duty", "pass": false, "level": "ERROR", "actual": 480, "limit": 600, "message": "Rest 480min < required 600min" },
      { "rule": "max_flight_time_cumulative", "pass": true, "level": "INFO", "message": "All periods within limits" },
      { "rule": "aircraft_type_rating", "pass": true, "level": "INFO", "message": "A320 rating valid" }
    ]
  }
}
```

### PO/RO 引擎调用（读配置 → 转约束）

```python
# Step 1: 读取法规配置（一次性）
response = httpx.get("http://rule-engine:3001/api/rule-config/po_optimization")
rules = response.json()["data"]["rules"]

# Step 2: 转化为 OR-Tools 约束
for rule in rules:
    if rule["template_code"] == "max_fdp":
        params = rule["params"]
        for adj in params["segment_adjustments"]:
            # 当航段数在 [min, max] 范围时，FDP ≤ limit
            # 用布尔变量建模条件约束
            is_in_range = model.NewBoolVar(f'seg_{adj["min_segments"]}_{adj["max_segments"]}')
            model.Add(seg_count >= adj["min_segments"]).OnlyEnforceIf(is_in_range)
            model.Add(seg_count <= adj["max_segments"]).OnlyEnforceIf(is_in_range)
            model.Add(fdp_var <= adj["limit_minutes"]).OnlyEnforceIf(is_in_range)

    elif rule["template_code"] == "min_rest_between_duty":
        params = rule["params"]
        model.Add(rest_var >= params["standard_minutes"])

    elif rule["template_code"] == "max_flight_time_cumulative":
        for limit in rule["params"]["limits"]:
            model.Add(cumulative_var[limit["period_days"]] <= limit["max_minutes"])

# Step 3: 求解
solver = cp_model.CpSolver()
status = solver.Solve(model)
# 输出方案已 100% 满足所有约束
```

### Gantt 前端展示

```
Gantt 界面显示:
┌─────────────────────────────────────────┐
│ 机组 C001 | 2026-03-23                   │
│ ┌──────┐ ┌──────┐ ┌──────┐              │
│ │CA101 │ │CA102 │ │CA103 │              │
│ │PEK→SHA│ │SHA→CAN│ │CAN→PEK│            │
│ └──────┘ └──────┘ └──────┘              │
│                                         │
│ 法规检查结果:                             │
│ ✓ FDP: 745min / 780min                  │
│ ✗ 休息不足: 480min / 600min (需调整)      │
│ ✓ 7天飞行: 36h / 60h                    │
│ ✓ 机型资质: A320 ✓                       │
│                                         │
│ 计算值:                                  │
│ 工时: 8.2h | 薪时: 9.5h | 疲劳: 52/100  │
└─────────────────────────────────────────┘
```
