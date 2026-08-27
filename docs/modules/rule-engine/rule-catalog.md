# CCAR-121 法规条目目录

> 法规引擎所有计算类和检查类规则的详细说明
> 法规依据：CCAR-121-R5（中国民用航空规章第 121 部第 5 次修订）

---

## 概览

### 执行架构

```
输入: Pairing（duties + segments） + Crew（可选）+ 法规集合配置
  │
  ├─ Phase 1: Calculator（计算类，先执行，输出中间数值）
  │   ├── fdp_calculator         → FDP 分钟数
  │   ├── flight_hour_calculator → 飞行时间 + 滚动累计
  │   ├── duty_period_calculator → 值勤时间
  │   ├── rest_calculator        → 休息时间
  │   └── fatigue_risk_index     → 疲劳分数（依赖 rest_calculator）
  │
  └─ Phase 2: Checker（检查类，后执行，使用计算结果比对阈值）
      ├── max_fdp                → FDP 上限
      ├── max_ft_24h/7d/28d/365d → 飞行时间累计上限
      ├── max_dp                 → 单次值勤上限
      ├── max_dp_7d              → 7天值勤累计上限
      ├── min_rest               → 最小休息时间
      ├── min_rest_weekly        → 周休息
      ├── qual_airport            → 机场资质
      ├── qual_fleet              → 机型资质
      └── qual_recency            → 近期经历
```

### 依赖关系

```
fdp_calculator ─────────────────→ max_fdp（独立查表，不依赖 calc）
flight_hour_calculator ─────────→ max_ft_24h, max_ft_7d, max_ft_28d, max_ft_365d
duty_period_calculator ─────────→ max_dp_7d
rest_calculator ────────────────→ min_rest, min_rest_weekly
rest_calculator ──→ fatigue_risk_index
```

---

## 一、计算类规则（Calculator）

计算类规则只输出数值，不做 pass/fail 判断。其输出存入 ExecutionContext，供检查类规则使用。

---

### CALC-01: fdp_calculator — FDP 计算器

| 属性 | 值 |
|------|-----|
| 模板编码 | `fdp_calculator` |
| 类型 | CALC |
| 法规依据 | CCAR-121-R5-121.489 |
| 输出单位 | 分钟 (minutes) |

**计算逻辑：**

1. 遍历 pairing 中的每个 duty
2. 对每个 duty：
   - `fdpMinutes = releaseUtc - reportUtc`（分钟）
   - 获取航段数 `segmentCount = duty.segments.length`
   - 获取当地报到时刻 `reportLocal`（优先使用 reportLocal 字段，否则 UTC+baseUtcOffset，默认 UTC+8）
   - 查 FDP 限制表：`lookupFdpLimit(fdpTable, segmentCount, reportLocal)` → `limitMinutes`
3. 取所有 duty 中的最大 FDP 作为输出值

**FDP 限制表（CCAR-121 默认值）：**

| 航段数 | 06:00-13:59 | 14:00-17:59 | 18:00-21:59 | 22:00-05:59 |
|--------|-------------|-------------|-------------|-------------|
| 1 | 780 min (13h) | 720 min (12h) | 660 min (11h) | 600 min (10h) |
| 2 | 750 min | 690 min | 630 min | 570 min |
| 3 | 720 min | 660 min | 600 min | 570 min |
| 4 | 690 min | 630 min | 570 min | 540 min |
| 5+ | 660 min | 600 min | 570 min | 540 min (9h) |

**可配置参数：**

| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `fdp_table` | FdpTableRow[] | 上表 | FDP 限制表，可按航司自定义 |

**输出示例：**
```json
{
  "ruleCode": "fdp_calculator",
  "value": 720,
  "unit": "minutes",
  "details": {
    "duties": [
      { "dutySeq": 1, "fdpMinutes": 720, "segmentCount": 2, "reportLocal": "06:00", "limitMinutes": 750 }
    ]
  }
}
```

---

### CALC-02: flight_hour_calculator — 飞行时间计算器

| 属性 | 值 |
|------|-----|
| 模板编码 | `flight_hour_calculator` |
| 类型 | CALC |
| 法规依据 | CCAR-121-R5-121.487 |
| 输出单位 | 分钟 (minutes) |

**计算逻辑：**

1. 遍历所有 duty → segments，累加 `blockMinutes` → `pairingBlockMinutes`
2. 合并 crew 的历史累计飞行时间（如提供）：
   - `last24h = crew.recentFlightHours.last24h + pairingBlockMinutes`
   - `last7d = crew.recentFlightHours.last7d + pairingBlockMinutes`
   - `last28d = crew.recentFlightHours.last28d + pairingBlockMinutes`
   - `last90d = crew.recentFlightHours.last90d + pairingBlockMinutes`
   - `last365d = crew.recentFlightHours.last365d + pairingBlockMinutes`
3. 无 crew 数据时，累计值 = 本次 pairing 的飞行时间

**输出示例：**
```json
{
  "ruleCode": "flight_hour_calculator",
  "value": 360,
  "unit": "minutes",
  "details": {
    "pairingBlockMinutes": 360,
    "cumulative": { "last24h": 360, "last7d": 960, "last28d": 3200, "last90d": 8400, "last365d": 42000 }
  }
}
```

---

### CALC-03: duty_period_calculator — 值勤时间计算器

| 属性 | 值 |
|------|-----|
| 模板编码 | `duty_period_calculator` |
| 类型 | CALC |
| 法规依据 | CCAR-121-R5-121.489 |
| 输出单位 | 分钟 (minutes) |

**计算逻辑：**

1. 遍历每个 duty，计算 `dutyMinutes = releaseUtc - reportUtc`
2. 累加所有 duty 的分钟数 → `totalDutyMinutes`

**输出：** pairing 内所有 duty 总值勤时间。

---

### CALC-04: rest_calculator — 休息时间计算器

| 属性 | 值 |
|------|-----|
| 模板编码 | `rest_calculator` |
| 类型 | CALC |
| 法规依据 | CCAR-121-R5-121.495 |
| 输出单位 | 分钟 (minutes) |

**计算逻辑：**

1. **单 duty pairing**：输出 `restAfterMinutes`（如有）或 0
2. **多 duty pairing**：
   - 遍历相邻 duty 对 (i, i+1)
   - 计算：`restMinutes = duty[i].restAfterMinutes ?? (duty[i+1].reportUtc - duty[i].releaseUtc)`
   - 取所有休息段中的**最小值** → `minRestMinutes`

**输出示例：**
```json
{
  "ruleCode": "rest_calculator",
  "value": 540,
  "unit": "minutes",
  "details": {
    "restPeriods": [
      { "afterDutySeq": 1, "beforeDutySeq": 2, "restMinutes": 540 },
      { "afterDutySeq": 2, "beforeDutySeq": 3, "restMinutes": 720 }
    ],
    "minRestMinutes": 540
  }
}
```

---

### CALC-05: fatigue_risk_index — 疲劳风险指数

| 属性 | 值 |
|------|-----|
| 模板编码 | `fatigue_risk_index` |
| 类型 | BOTH（既计算又检查） |
| 法规依据 | CCAR-121-R5-121.499 |
| 输出单位 | 分数 (score, 0-100) |
| 依赖 | rest_calculator |

**计算公式：**

```
score = min( baseline + dutyScore + nightScore + restPenalty, 100 )
```

| 组成部分 | 公式 | 上限 |
|----------|------|------|
| baseline | 固定基线值 | 默认 20 |
| dutyScore | `min(totalDutyMinutes × duty_weight, 50)` | 50 |
| nightScore | `min(nightDutyCount × night_weight, 30)` | 30 |
| restPenalty | `min((600 - minRest) × 0.05, 20)` （仅当 minRest < 600） | 20 |

**可配置参数：**

| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `duty_weight` | number | 0.05 | 值勤时间对疲劳的权重 |
| `night_weight` | number | 15 | 每个夜航 duty 增加的疲劳分 |
| `baseline` | number | 20 | 基线疲劳分 |
| `warning_threshold` | number | 70 | 警告阈值（作为检查器使用时） |
| `error_threshold` | number | 85 | 错误阈值 |

**夜航判定：** 当地报到时刻在 22:00-05:59 范围内。

---

## 二、检查类规则（Checker）

检查类规则比对计算结果与阈值，输出 pass/fail + severity + message。

---

### CHECK-01: max_fdp — 最大飞行执勤时间

| 属性 | 值 |
|------|-----|
| 模板编码 | `max_fdp` |
| 类型 | CHECK |
| 法规依据 | CCAR-121-R5-121.489 |
| 粒度 | 每个 duty 独立检查 |

**检查逻辑：**

对 pairing 中的每个 duty：
1. `fdpMinutes = releaseUtc - reportUtc`
2. 查 FDP 限制表（按航段数 + 当地报到时刻）
3. 查表失败时使用 `base_limit_minutes`（默认 780 分钟 = 13 小时）
4. **判定**：`fdpMinutes ≤ limitMinutes` → PASS，否则 FAIL

**可配置参数：**

| 参数名 | 默认值 | 说明 |
|--------|--------|------|
| `fdp_table` | CCAR-121 标准表 | FDP 限制查询表 |
| `base_limit_minutes` | 780 | 查表失败时的兜底限制 |

**违规消息示例：**
> Duty 1: FDP 800min exceeds limit 780min (2 segments, report 06:00)

---

### CHECK-02~05: max_ft_24h / max_ft_7d / max_ft_28d / max_ft_365d — 飞行时间累计

| 编码 | 法规 | 默认限制 | 说明 |
|------|------|---------|------|
| `max_ft_24h` | 121.487 | 540 min (9h) | 24 小时滚动窗口 |
| `max_ft_7d` | 121.487 | 2400 min (40h) | 7 天滚动窗口 |
| `max_ft_28d` | 121.487 | 6000 min (100h) | 28 天滚动窗口 |
| `max_ft_365d` | 121.487 | 60000 min (1000h) | 年度累计 |

**依赖：** `flight_hour_calculator` 的累计数据

**检查逻辑：**
1. 从 `flight_hour_calculator` 结果获取对应周期的累计值
2. `cumulative[period] ≤ limit_minutes` → PASS，否则 FAIL
3. 无计算数据时跳过（PASS）

**可配置参数：** `limit_minutes`（每个周期独立配置）

---

### CHECK-06: max_dp — 最大单次值勤时间

| 属性 | 值 |
|------|-----|
| 模板编码 | `max_dp` |
| 法规依据 | CCAR-121-R5-121.489 |
| 粒度 | 每个 duty 独立检查 |
| 默认限制 | 960 min (16h) |

**检查逻辑：**
- 对每个 duty：`dutyMinutes ≤ limit_minutes` → PASS，否则 FAIL
- 值勤时间包含地面任务和备飞

---

### CHECK-07: max_dp_7d — 7 天值勤累计

| 属性 | 值 |
|------|-----|
| 模板编码 | `max_dp_7d` |
| 法规依据 | CCAR-121-R5-121.489 |
| 默认限制 | 3600 min (60h) |
| 依赖 | `duty_period_calculator` |

**检查逻辑：**
- `totalDutyMinutes ≤ limit_minutes` → PASS，否则 FAIL

---

### CHECK-08: min_rest — 最小休息时间

| 属性 | 值 |
|------|-----|
| 模板编码 | `min_rest` |
| 法规依据 | CCAR-121-R5-121.495 |
| 依赖 | `rest_calculator` |

**三级判定逻辑：**

```
if (minRest ≥ base_rest_minutes)     → PASS "休息充足"
elif (minRest ≥ absolute_min_minutes) → FAIL "休息不足（缩减休息）"
else                                  → FAIL "低于绝对最低限"
```

**可配置参数：**

| 参数名 | 默认值 | 说明 |
|--------|--------|------|
| `base_rest_minutes` | 600 (10h) | 标准休息要求 |
| `absolute_min_minutes` | 600 (10h) | 绝对最低限 |

---

### CHECK-09: min_rest_weekly — 周休息

| 属性 | 值 |
|------|-----|
| 模板编码 | `min_rest_weekly` |
| 法规依据 | CCAR-121-R5 |
| 依赖 | `rest_calculator` |
| 默认要求 | 36 小时连续休息 / 7 天 |

**检查逻辑：**
1. 从 rest_calculator 获取所有休息段
2. 取最大连续休息时间
3. `maxConsecutiveRest ≥ min_consecutive_hours × 60` → PASS，否则 FAIL

**可配置参数：** `min_consecutive_hours`（默认 36）

---

### CHECK-10: qual_airport — 机场资质

| 属性 | 值 |
|------|-----|
| 模板编码 | `qual_airport` |
| 法规依据 | CCAR-121-R5-Sec4.32 |
| 需要 | crew 数据 |

**检查逻辑：**
1. 无 crew 数据 → 跳过（PASS）
2. 收集 pairing 中所有出发/到达机场
3. 检查 crew.airportQuals 是否覆盖所有机场
4. 列出缺失资质的机场 → FAIL

---

### CHECK-11: qual_fleet — 机型资质

| 属性 | 值 |
|------|-----|
| 模板编码 | `qual_fleet` |
| 法规依据 | CCAR-121-R5-Sec4.33 |
| 需要 | crew 数据 |

**检查逻辑：**
1. 无 crew 数据 → 跳过（PASS）
2. 收集 pairing 中所有 segment 的 fleetCode
3. 检查 crew.fleetQuals 是否覆盖所有机型
4. 列出缺失资质的机型 → FAIL

---

### CHECK-12: qual_recency — 近期经历

| 属性 | 值 |
|------|-----|
| 模板编码 | `qual_recency` |
| 法规依据 | CCAR-121-R5-121.481 |
| 需要 | crew 数据 |
| 默认要求 | 90 天内 3 次着陆 |

**检查逻辑：**
1. 无 crew 数据 → 跳过（PASS）
2. `crew.recentLandings90d ≥ min_landings` → PASS，否则 FAIL

**可配置参数：** `min_landings`（默认 3）

---

## 三、Severity 级别定义

| 级别 | 数值 | 含义 | Gantt 行为 |
|------|------|------|-----------|
| INFO | 1 | 仅提示 | 黄色铃铛，不阻止操作 |
| WARNING | 2 | 警告 | 黄色铃铛，允许操作 |
| ERROR | 3 | 错误 | 红色铃铛，阻止操作 |

每条法规的 severity 可在 `rule_instance` 或 `rule_group_item.severity_override` 中配置。

---

## 四、参数化汇总

所有阈值均从数据库 `rule_instance.params` (JSONB) 读取，不硬编码。

| 法规 | 关键参数 | CCAR-121 默认值 |
|------|---------|----------------|
| max_fdp | fdp_table, base_limit_minutes | 查表（见上），780min |
| max_ft_24h | limit_minutes | 540 min (9h) |
| max_ft_7d | limit_minutes | 2400 min (40h) |
| max_ft_28d | limit_minutes | 6000 min (100h) |
| max_ft_365d | limit_minutes | 60000 min (1000h) |
| max_dp | limit_minutes | 960 min (16h) |
| max_dp_7d | limit_minutes | 3600 min (60h) |
| min_rest | base_rest_minutes, absolute_min_minutes | 600 min (10h) |
| min_rest_weekly | min_consecutive_hours | 36h |
| fatigue_risk_index | duty_weight, night_weight, baseline | 0.05, 15, 20 |
| qual_recency | min_landings | 3 次 / 90 天 |

新航司上线时，通过 `rule_instance.params` 调整阈值即可，**零代码修改**。

---

## 五、法规集合差异

| 集合 | 用途 | 与 GANTT 的区别 |
|------|------|----------------|
| `ccar121_gantt` | 排班实时检查 | 基准，全部启用，原始 severity |
| `ccar121_po` | 组环优化 | 资质类（airport/fleet/recency/composition）降级 WARNING |
| `ccar121_ro` | 分配优化 | 同 PO |
| `ccar121_pbs` | 机组竞标 | 疲劳检查禁用（不适用竞标场景） |

集合差异通过 `rule_group_item.severity_override` 和 `enabled` 字段实现，不创建重复实例。
