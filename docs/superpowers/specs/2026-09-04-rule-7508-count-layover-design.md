# Rule 7508 — COUNT LAYOVER 参数设计

日期：2026-09-04
状态：已确认（brainstorming 通过）

## 背景

Rule 7508（Single Day Free from Duty in Calendar Days）当前按 **duty 级**工作区间计算：
pairing 内部两个 duty 之间的 layover 日，如果满足"整日无工作 + 前后两个 local night 各凑满
最小休息"，会被计为一个 SDFD 自由日。

实际案例（ro_check.py，crew 274 ← pairing 43618 + 43886）：43886 自身含两段
duty（09-15 与 09-17/18），中间 09-16 整天是 YUL layover。该 layover 被计为自由日，
7 天窗口（168 RH，min=1）因此不报警——与规划员"两个配对之间没有整天休息应当报警"
的预期不符。

另有一个既有不一致：PBS solver 内部 Python prefilter（`internal/checker.py`
`check_calendar_day_free_from_duty`）按 pairing 整体区间（start→end）计算，
天然就是"不计 layover"语义。

7505/7507 已有同名 `Count Layover`（Y/N）参数先例，本参数与其命名、语义方向保持一致。

## 需求

7508 参数表在 `Unit` 之后新增列 `Count Layover`，取值 `Y` / `N`：

- **Y**（默认）：与目前逻辑完全一致。duty 级计算，pairing 内 layover 若满足
  SDFD 条件也算自由日。
- **N**：pairing 内 layover 不计。整个 pairing 熔合为一个工作块
  （起点 = 最早 duty 的 report 边界，终点 = 最晚 duty 的 release + Duty End Buffer 边界），
  SDFD 只可能出现在 pairing 之间（或 pairing 与 ground 任务之间）。

缺列 / 空值一律默认 **Y**（向后兼容）。

## 核心算法（Rust 内核，rule7508.rs）

`Rule7508Row` 增加 `count_layover: bool`。

`check_rule7508_structured_focused` 在 scope 检查之后、排序之前：
当 `!row.count_layover` 时，对 `work` 做一次合并变换 `merge_pairing_spans`：

- `is_rest == true` 或 `pairing_id == None` 的条目原样保留（ground 休息/非飞行地面任务不受影响）。
- 同一 `pairing_id` 的非 rest duty 合并为单个 `WorkPeriod7508`：
  - `start_utc = min(start_utc)`，`end_utc = max(end_utc)`
  - `first_flight_departure_utc = min(...)`，`last_flight_arrival_utc = max(...)`
    （`work_start_7508` / `work_end_7508` 随后照常应用 Duty Report / Duty Release /
    Buffer：buffer 只作用于合并块尾边界，内部 duty 的 buffer 被块吸收——正确）
  - `is_pre_assigned = all(duties)`（任一非 PA 则整块视为非 PA，optimizer PA-ignore 不误屏蔽）
  - `start_ref_tz_min` 取时间最早 duty、`end_ref_tz_min` 取时间最晚 duty（7500 acclimatisation）
- 单 duty pairing 合并结果与原条目相同，行为不变。

合并后的列表走原有全部逻辑（work_intervals / touched / prev-next / night-band fit /
window 计数），无需其他改动。

## 参数管道

| 环节 | 改动 |
|---|---|
| DB `rule.param_json.tables[0]` | 迁移：`Unit` 后插入 `Count Layover`，既有行填 `Y`（模式照抄 `2026-09-03-rule-8071-add-assignments-column.sql`，幂等 + advisory lock，不硬编码 schema） |
| pbs-engine `rules/rust/rule_params.py` | 按列名解析（`_col(header, "Count Layover")`，缺省 Y），追加进 `calendar_sdfd_rule_rows` 元组尾部 |
| PyO3 `CalendarSdfdRuleInput` | `(i64, String, bool, bool, i64, i64)` → 尾部加 `bool`。与 pbs-engine 同仓同步，无跨版本兼容问题 |
| `check-7508` 二进制 TSV `R` 行 | **尾部**追加可选列 `count_layover(0/1)`（照抄 check-7507 尾列先例；中间插列会破坏新旧二进制兼容，"Unit 之后"仅指 DB 表头布局） |
| live-server `legality-recheck-core.mjs` | `fieldRaw(row, H, 'Count Layover', 'Y')` → R 行尾部追加 0/1 |
| pbs-engine internal prefilter | params 解析 flag；**N 行**沿用整体-pairing veto（语义吻合），**Y 行跳过内部 veto**（记日志），由权威 Rust 检查兜底——solver Pairing 模型无 duty 时间段，无法表达 Y |
| engine-server/F8 | 无需改动（wrapper 只注入 extras，参数抽取在 pbs-engine） |
| gantt UI | 参数编辑为表头驱动通用组件，无代码改动；仅 help 文档加参数条目 |
| ro_check.py | `RUST_CHECK_LINE_FUNCTIONS` 补 7508/7507/7305（仅修正 "Enforced" 报告，不影响检查） |

## 测试与验收

1. `rule-engine-rs/tests/rule_7508_tests.rs`：
   - Y：单 pairing 两 duty 夹一个合规 layover 日 → 不报警（现状保持）。
   - N：同一数据 → 报警（窗口 0 自由日）——即 crew 274 场景的最小复现。
   - N：自由日位于两个独立 pairing 之间 → 仍不报警。
2. `rule-engine-rs/py/tests/test_engine_7508_calendar_sdfd.py`：7 元组接线（True/False 各覆盖）。
3. pbs-engine：`test_rust_rule_7508_params.py`（Y/N/缺列默认 Y）、
   `test_rule_checker_calendar_day_free.py`（N veto / Y 跳过）、接口回归。
4. live-server：`legality-recheck-core.test.mjs` R 行断言 + 默认 Y 用例。
5. 端到端：本地 ro_input（gitignore）把 7508 行改 `N` → `python3 ro_check.py`
   （crew 274 ← 43618,43886）预期 7508 报警（窗口 09-10→09-17，sdfd=0，触发 43886）；
   改回 `Y` → 维持不报警。

## 明确不做

- 不引入新规则/新表；不改 7501/7505/7507 语义。
- 不给 solver Pairing 模型加 duty 时间段（Y 行内部 prefilter 交给权威检查兜底）。
- 不 commit / push（用户显式要求）。
