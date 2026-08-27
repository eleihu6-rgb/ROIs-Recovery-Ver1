# 约束编译器设计 — Rule Engine → Python 约束函数

---

## 一、核心问题澄清

**不需要人工介入。**

约束编译器是全自动流程：
1. Optimizer Manager 在写入 `input.gz` 前调用一次 Rule Engine HTTP API，将规则配置嵌入 `RULES` 节
2. PO Engine 启动时从 `input.gz` 解析 `RULES` 节，获得 `ResolvedRule[]`，其中 `template_code` 是**桥接键**
3. 编译器按 `template_code` 映射到对应的 Python 解析逻辑
4. 输出 `CompiledConstraints`，供图搜索阶段直接调用

**引擎运行时不发出任何 HTTP 请求**。规则参数在 `input.gz` 写入时已完整内嵌。

唯一需要人工介入的情况：新增 CCAR 法规 `template_code`（如国家新出的飞行时间规定），需在编译器里新增一个 handler — 这是代码变更，不是运行时配置。

---

## 二、Rule Engine 的 JSON 结构（实际格式）

调用 `GET /api/rules/groups/CAAC_FTL` 返回：

```json
{
  "group": {
    "groupCode": "CAAC_FTL",
    "usage": "PO",
    "filiale": "F8",
    "division": "P"
  },
  "rules": [
    {
      "templateCode": "fdp_calculator",
      "instanceCode": "FDP_STD",
      "category": "FDP",
      "checkType": "CALC",
      "params": {
        "fdp_table": [
          {
            "minSegments": 1, "maxSegments": 1,
            "windows": [
              {"startLocal": "06:00", "endLocal": "13:59", "limitMinutes": 780},
              {"startLocal": "14:00", "endLocal": "17:59", "limitMinutes": 750},
              {"startLocal": "18:00", "endLocal": "21:59", "limitMinutes": 720},
              {"startLocal": "22:00", "endLocal": "05:59", "limitMinutes": 660}
            ]
          },
          {
            "minSegments": 2, "maxSegments": 2,
            "windows": [
              {"startLocal": "06:00", "endLocal": "13:59", "limitMinutes": 750}
            ]
          }
        ]
      }
    },
    {
      "templateCode": "rest_calculator",
      "instanceCode": "REST_STD",
      "category": "REST",
      "checkType": "CALC",
      "params": {
        "minRestMinutes": 600
      }
    },
    {
      "templateCode": "duty_time_calculator",
      "instanceCode": "DUTY_STD",
      "category": "DUTY",
      "checkType": "CALC",
      "params": {
        "maxDutyMinutes": 840,
        "maxConsecutiveDutyDays": 7
      }
    },
    {
      "templateCode": "flight_time_calculator",
      "instanceCode": "FLT_STD",
      "category": "FLIGHT_TIME",
      "checkType": "CALC",
      "params": {
        "maxFlightTimePerDutyMinutes": 600,
        "cumulativeLimits": {
          "7": 2400,
          "28": 6000,
          "90": 16200,
          "365": 60000
        }
      }
    }
  ]
}
```

---

## 三、templateCode → 编译策略映射表

| templateCode | 对应约束 | 参数键名 | 编译输出 |
|---|---|---|---|
| `fdp_calculator` | 值勤期最大 FDP | `params.fdp_table`（数组，含时间窗） | `fdp_limit_func(segments, report_local_hhmm) → int` |
| `rest_calculator` | 值勤间最小休息 | `params.minRestMinutes` | `min_rest_minutes: int` |
| `duty_time_calculator` | 最大值勤时长 + 连续值勤天数 | `params.maxDutyMinutes`, `params.maxConsecutiveDutyDays` | `max_duty_minutes: int`, `max_consecutive_days: int` |
| `flight_time_calculator` | 单次 + 累计飞行时间 | `params.maxFlightTimePerDutyMinutes`, `params.cumulativeLimits` | `max_flt_per_duty: int`, `cumulative_limits: dict` |
| `fatigue_calculator` | 疲劳风险（Phase 2） | `params.fatigueThreshold` | 暂忽略（软约束） |
| `qualification_checker` | 资质检查（RO 用，PO 可忽略） | — | PO 阶段不需要 |

---

## 四、实现步骤

### Step 1：从 `input.gz` 的 `RULES` 节解析规则配置

```python
# src/optimizer/pipeline.py（现有代码）
rule_config = self._parse_rule_config(sections)
# sections["RULES"] 是 list[dict]，每行含 template_code + params_json
# params_json 由 Optimizer Manager 在写入 input.gz 时从 Rule Engine 获取并嵌入
```

### Step 2：ConstraintCompiler 解析 JSON → 编译为 Python 函数

```python
# src/constraints/compiler.py

from dataclasses import dataclass, field
from typing import Callable
from src.models.rule_config import RuleConfig

@dataclass
class CompiledConstraints:
    """编译后的约束函数集合，供图搜索阶段直接调用"""

    # FDP: 给定航段数 + 汇报时刻 → 最大 FDP 分钟数
    # report_local: "HH:MM" 格式，当地时间
    fdp_limit_func: Callable[[int, str], int] = field(repr=False)

    # 休息时间
    min_rest_minutes: int = 600

    # 值勤期
    max_duty_minutes: int = 840
    max_consecutive_duty_days: int = 7

    # 飞行时间
    max_flt_per_duty_minutes: int = 600
    cumulative_flt_limits: dict[int, int] = field(default_factory=lambda: {
        7: 2400, 28: 6000, 90: 16200, 365: 60000
    })

    # 运营参数
    mct_by_airport: dict[str, int] = field(default_factory=dict)
    default_mct_minutes: int = 60
    brief_minutes: int = 60
    debrief_minutes: int = 30
    base_airports: frozenset[str] = field(default_factory=frozenset)
    max_pairing_days: int = 5
    max_tafb_minutes: int = 72 * 60


class ConstraintCompiler:
    """将 RuleConfig JSON 编译为 CompiledConstraints"""

    def compile(
        self,
        rule_config: RuleConfig,
        base_airports: list[str],
        operational_params: dict | None = None,
    ) -> CompiledConstraints:
        params = operational_params or {}

        fdp_func = self._compile_fdp(rule_config)
        min_rest = self._compile_rest(rule_config)
        max_duty, max_consec = self._compile_duty(rule_config)
        max_flt_duty, cum_limits = self._compile_flight_time(rule_config)

        return CompiledConstraints(
            fdp_limit_func=fdp_func,
            min_rest_minutes=min_rest,
            max_duty_minutes=max_duty,
            max_consecutive_duty_days=max_consec,
            max_flt_per_duty_minutes=max_flt_duty,
            cumulative_flt_limits=cum_limits,
            mct_by_airport=params.get("mctByAirport", {}),
            default_mct_minutes=params.get("defaultMctMinutes", 60),
            brief_minutes=params.get("briefMinutes", 60),
            debrief_minutes=params.get("debriefMinutes", 30),
            base_airports=frozenset(base_airports),
            max_pairing_days=params.get("maxPairingDays", 5),
            max_tafb_minutes=params.get("maxTafbMinutes", 72 * 60),
        )

    # ── FDP ────────────────────────────────────────────────

    def _compile_fdp(self, rule_config: RuleConfig) -> Callable[[int, str], int]:
        """
        编译 fdp_calculator 规则 → fdp_limit_func(segments, report_local_hhmm) → int

        完全镜像 TypeScript 的 lookupFdpLimit 逻辑：
          - 按 minSegments/maxSegments 匹配行
          - 在匹配行内按 startLocal/endLocal 时间窗匹配
          - 返回 limitMinutes
        """
        fdp_table = None
        for rule in rule_config.rules:
            if rule.template_code == "fdp_calculator":
                raw_table = rule.params.get("fdp_table")
                if isinstance(raw_table, list):
                    fdp_table = raw_table
                    break

        if fdp_table is None:
            # 无配置时使用 CCAR-121 默认表（与 rule-engine DEFAULT_FDP_TABLE 一致）
            fdp_table = _DEFAULT_FDP_TABLE

        # 编译为 Python 函数（闭包，持有 fdp_table）
        def fdp_limit_func(segments: int, report_local: str) -> int:
            return _lookup_fdp_limit(fdp_table, segments, report_local)

        return fdp_limit_func

    # ── REST ───────────────────────────────────────────────

    def _compile_rest(self, rule_config: RuleConfig) -> int:
        for rule in rule_config.rules:
            if rule.template_code == "rest_calculator":
                val = rule.params.get("minRestMinutes")
                if val is not None:
                    return int(val)
        return 600  # CCAR-121 默认 10h

    # ── DUTY ───────────────────────────────────────────────

    def _compile_duty(self, rule_config: RuleConfig) -> tuple[int, int]:
        max_duty = 840
        max_consec = 7
        for rule in rule_config.rules:
            if rule.template_code == "duty_time_calculator":
                max_duty = int(rule.params.get("maxDutyMinutes", 840))
                max_consec = int(rule.params.get("maxConsecutiveDutyDays", 7))
                break
        return max_duty, max_consec

    # ── FLIGHT TIME ────────────────────────────────────────

    def _compile_flight_time(self, rule_config: RuleConfig) -> tuple[int, dict[int, int]]:
        max_flt_duty = 600
        cum_limits: dict[int, int] = {7: 2400, 28: 6000, 90: 16200, 365: 60000}
        for rule in rule_config.rules:
            if rule.template_code == "flight_time_calculator":
                max_flt_duty = int(rule.params.get("maxFlightTimePerDutyMinutes", 600))
                raw_cum = rule.params.get("cumulativeLimits")
                if isinstance(raw_cum, dict):
                    cum_limits = {int(k): int(v) for k, v in raw_cum.items()}
                break
        return max_flt_duty, cum_limits
```

### Step 3：FDP 时间窗查表（镜像 TypeScript `lookupFdpLimit`）

```python
# src/constraints/fdp_table.py

def _lookup_fdp_limit(fdp_table: list[dict], segments: int, report_local: str) -> int:
    """
    完全镜像 rule-engine TypeScript 的 lookupFdpLimit 逻辑。

    fdp_table 格式：
      [{"minSegments": 1, "maxSegments": 1, "windows": [
          {"startLocal": "06:00", "endLocal": "13:59", "limitMinutes": 780},
          ...
      ]}, ...]

    report_local: "HH:MM"（当地时间，由 UTC + 基地偏移量计算得到）
    """
    # 找到匹配的行
    row = next(
        (r for r in fdp_table if r["minSegments"] <= segments <= r["maxSegments"]),
        None,
    )
    if row is None:
        return 660  # 保守回退

    # 在时间窗中找到匹配的窗口
    report_min = _hhmm_to_minutes(report_local)
    for window in row["windows"]:
        start_min = _hhmm_to_minutes(window["startLocal"])
        end_min = _hhmm_to_minutes(window["endLocal"])
        if _in_time_window(report_min, start_min, end_min):
            return int(window["limitMinutes"])

    return 660  # 保守回退


def _hhmm_to_minutes(hhmm: str) -> int:
    """'HH:MM' → 分钟数（0–1439）"""
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m


def _in_time_window(report_min: int, start_min: int, end_min: int) -> bool:
    """
    判断时刻是否在时间窗内，支持跨午夜（如 22:00–05:59）。
    镜像 rule-engine 的 isInTimeWindow 逻辑。
    """
    if start_min <= end_min:
        return start_min <= report_min <= end_min
    else:
        # 跨午夜：22:00–05:59
        return report_min >= start_min or report_min <= end_min


# CCAR-121 默认 FDP 表（与 rule-engine DEFAULT_FDP_TABLE 完全一致，作为回退）
_DEFAULT_FDP_TABLE = [
    {"minSegments": 1, "maxSegments": 1, "windows": [
        {"startLocal": "06:00", "endLocal": "13:59", "limitMinutes": 780},
        {"startLocal": "14:00", "endLocal": "17:59", "limitMinutes": 750},
        {"startLocal": "18:00", "endLocal": "21:59", "limitMinutes": 720},
        {"startLocal": "22:00", "endLocal": "05:59", "limitMinutes": 660},
    ]},
    {"minSegments": 2, "maxSegments": 2, "windows": [
        {"startLocal": "06:00", "endLocal": "13:59", "limitMinutes": 750},
        {"startLocal": "14:00", "endLocal": "17:59", "limitMinutes": 720},
        {"startLocal": "18:00", "endLocal": "21:59", "limitMinutes": 690},
        {"startLocal": "22:00", "endLocal": "05:59", "limitMinutes": 630},
    ]},
    {"minSegments": 3, "maxSegments": 3, "windows": [
        {"startLocal": "06:00", "endLocal": "13:59", "limitMinutes": 720},
        {"startLocal": "14:00", "endLocal": "17:59", "limitMinutes": 690},
        {"startLocal": "18:00", "endLocal": "21:59", "limitMinutes": 660},
        {"startLocal": "22:00", "endLocal": "05:59", "limitMinutes": 600},
    ]},
    {"minSegments": 4, "maxSegments": 4, "windows": [
        {"startLocal": "06:00", "endLocal": "13:59", "limitMinutes": 690},
        {"startLocal": "14:00", "endLocal": "17:59", "limitMinutes": 660},
        {"startLocal": "18:00", "endLocal": "21:59", "limitMinutes": 630},
        {"startLocal": "22:00", "endLocal": "05:59", "limitMinutes": 570},
    ]},
    {"minSegments": 5, "maxSegments": 99, "windows": [
        {"startLocal": "06:00", "endLocal": "13:59", "limitMinutes": 660},
        {"startLocal": "14:00", "endLocal": "17:59", "limitMinutes": 630},
        {"startLocal": "18:00", "endLocal": "21:59", "limitMinutes": 600},
        {"startLocal": "22:00", "endLocal": "05:59", "limitMinutes": 540},
    ]},
]
```

### Step 4：在图搜索中调用编译好的约束

```python
# src/optimizer/duty_generator.py（伪代码）

def can_extend_duty(state: DutyState, next_flight: Flight, cc: CompiledConstraints) -> bool:
    """判断是否可以将 next_flight 加入当前 duty"""

    # 1. 机场连接性
    if state.last_flight.arv_arp != next_flight.dep_arp:
        return False

    # 2. MCT
    mct = cc.mct_by_airport.get(next_flight.dep_arp, cc.default_mct_minutes)
    ground = (next_flight.sch_dep_dt_utc - state.last_flight.sch_arv_dt_utc).seconds // 60
    if ground < mct:
        return False

    # 3. FDP（核心：用编译好的函数，支持时间窗查表）
    new_fdp = compute_fdp(state.duty_start, next_flight.sch_arv_dt_utc, cc.debrief_minutes)
    report_local = utc_to_local_hhmm(state.duty_start, base_utc_offset)
    max_fdp = cc.fdp_limit_func(state.segment_count + 1, report_local)
    if new_fdp > max_fdp:
        return False

    # 4. 最大飞行时间/duty
    new_flt_min = state.flt_minutes + next_flight.blk_min
    if new_flt_min > cc.max_flt_per_duty_minutes:
        return False

    return True
```

---

## 五、约束编译全流程图

```
input.gz 的 RULES 节
（由 Optimizer Manager 预先从 Rule Engine 获取并嵌入）
         │
         ▼
   pipeline._parse_rule_config(sections)
   → RuleConfig（含 list[ResolvedRule]）
   ├── template_code: "fdp_calculator"        → params["fdp_table"] (数组)
   ├── template_code: "rest_calculator"       → params["minRestMinutes"]
   ├── template_code: "duty_time_calculator"  → params["maxDutyMinutes"]
   └── template_code: "flight_time_calculator"→ params["cumulativeLimits"]
         │
         ▼
   ConstraintCompiler.compile(rule_config, base_airports, op_params)
         │
         ▼
   CompiledConstraints
   ├── fdp_limit_func(segments, report_local) → int   ← 闭包，持有 fdp_table
   ├── min_rest_minutes: 600
   ├── max_duty_minutes: 840
   └── max_consecutive_duty_days: 7
         │
         ▼
   DutyGenerator / PairingGenerator
   （图搜索，每次扩展节点时直接调用上述函数，纳秒级响应）
```

---

## 六、需要人工介入的唯一场景

| 场景 | 是否需要人工介入 | 操作 |
|------|--------------|------|
| 现有法规阈值调整（如 FDP 上限改动） | **不需要** | 排班管理员在系统界面修改 rule_instance.params，PO Worker 下次任务自动读取新值 |
| 现有法规启用/禁用 | **不需要** | rule_group_item.enabled 改动，编译器自动感知 |
| **新增法规类型（新 templateCode）** | **需要** | 工程师在 `ConstraintCompiler` 中新增 handler，约 50 行 Python 代码 |
| 参数格式升级（如 fdp_table 新增字段） | **需要** | 工程师同步更新 Python 解析逻辑 |

> **结论**：日常运营（法规参数调整）完全无需人工介入。只有 CCAR 发布新法规类型时，工程师需一次性编写对应 Python handler，工作量约半天。
