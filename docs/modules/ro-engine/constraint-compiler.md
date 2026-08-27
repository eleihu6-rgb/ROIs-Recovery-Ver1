# FTL 约束编译器

> `src/constraints/compiler.py`

---

## 一、设计目标

将 Rule Engine 提供的 `RuleConfig`（JSON 法规配置）编译为 Python 参数对象 `CompiledFTL`，供 DP 调度器直接使用，**无需在求解过程中发起 HTTP 调用**。

```
RuleConfig（JSON，来自 input.gz RULES 节）
    ↓  FTLCompiler.compile()
CompiledFTL（Python 数据类，含所有 FTL 数值参数）
    ↓  传入 eligibility + DP + Polish
所有法规约束内嵌求解流程，100% 合规
```

---

## 二、CompiledFTL 结构

```python
@dataclass
class CompiledFTL:
    # 硬约束（违反 → 不可分配）
    fdp_limit_func: Callable[[int], int]   # (num_sectors) → max_fdp_minutes
    min_rest_minutes: int                  # 最小休息时间（分钟）
    max_duty_flt_min: int                  # 单次值勤最大飞行时间
    max_month_flt_min: int                 # 月累计飞时上限
    max_quarter_flt_min: int               # 季度累计飞时上限
    max_year_flt_min: int                  # 年累计飞时上限
    max_consecutive_duty_days: int         # 最大连续值勤天数
    max_tafb_minutes: int                  # 最大离基时间（来自 JOB_PARAMS）

    # 软约束权重（用于 DP 利润评分）
    preferred_base_weight: float           # 基地不匹配惩罚
    fairness_target_hours: float           # 工时公平目标（小时）
```

---

## 三、编译逻辑

`FTLCompiler.compile(rule_config, job_params)` 从两个来源读取参数：

| 参数 | 来源 | 法规类别/参数名 |
|------|------|--------------|
| `fdp_limit_func` | RULES 节，category=`FDP` | `fdpTable` 或 `maxFdpMinutes` |
| `min_rest_minutes` | RULES 节，category=`REST` | `minRestMinutes` |
| `max_duty_flt_min` | RULES 节，category=`FLIGHT_TIME` | `maxFlightTimePerDutyMinutes` |
| `max_month_flt_min` | RULES 节，category=`FLIGHT_TIME` | `cumulativeLimits["28"]` |
| `max_quarter_flt_min` | RULES 节，category=`FLIGHT_TIME` | `cumulativeLimits["90"]` |
| `max_year_flt_min` | RULES 节，category=`FLIGHT_TIME` | `cumulativeLimits["365"]` |
| `max_consecutive_duty_days` | RULES 节，category=`DUTY` | `maxConsecutiveDutyDays` |
| `max_tafb_minutes` | JOB_PARAMS | `max_tafb_hours` × 60 |
| `preferred_base_weight` | JOB_PARAMS | `preferred_base_weight`（默认 50.0） |
| `fairness_target_hours` | JOB_PARAMS | `fairness_target_hours`（默认 80.0） |

---

## 四、FDP 限制函数

CCAR-121 的 FDP 上限随航段数变化，通过闭包封装：

```python
def _fdp_func(rule_config: RuleConfig) -> Callable[[int], int]:
    def fdp_limit(num_sectors: int) -> int:
        return rule_config.get_fdp_limit_minutes(num_sectors)
    return fdp_limit
```

`get_fdp_limit_minutes` 优先从 `fdpTable`（字典 `{sector_count: limit_minutes}`）读取，回退到 `maxFdpMinutes`，最终回退到保守默认值 780 分钟（13 小时）。

---

## 五、回退默认值

当 RULES 节缺失对应法规时，使用 CCAR-121 保守默认值，确保系统不会因配置缺失而崩溃：

| 参数 | 默认值 | 说明 |
|------|-------|------|
| `min_rest_minutes` | 600 | 10 小时 |
| `max_duty_flt_min` | 600 | 10 小时 |
| `max_month_flt_min` | 6000 | 100 小时 |
| `max_quarter_flt_min` | 16200 | 270 小时 |
| `max_year_flt_min` | 60000 | 1000 小时 |
| `max_consecutive_duty_days` | 7 | 7 天 |
| `fdp_limit_func` | 返回 780 | 13 小时 |
