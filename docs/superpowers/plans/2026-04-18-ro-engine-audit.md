# RO Engine 代码审计报告

**日期**：2026-04-18  
**审计范围**：`ro-engine/src/` 全部模块  
**对照文档**：`docs/superpowers/specs/2026-04-17-ro-engine-design.md`  
**状态**：审计完成，待修复

---

## 总结

实现与规范高度一致，核心算法正确。发现 **2 个 P0 问题**（FTL 合规性风险）、**1 个 P1 问题**（对偶信息丢失）、**3 个 P2 问题**（质量与健壮性）。已记录在 `spec-gaps.md` 中的所有项均已交叉确认准确。

---

## P0 问题（必须修复）

### P0-1：FDP 上限检查缺失

**文件**：`src/algorithm/crew_scheduler.py:can_add()`  
**现状**：`CompiledFTL.fdp_limit_func` 已编译，但 `can_add()` 的 5 项约束检查中没有 FDP 上限检查。每个值勤期的飞行值勤期时长（`duty.fdp_min`）可能超限而不被发现。

规范要求：
```
fdp_min ≤ fdp_limit_func(seg_count)  每个值勤期均需校验
```

当前 `can_add()` 检查清单：
1. ✓ 最小休息间隔
2. ✓ 月累计飞行时间
3. ✓ 季度累计飞行时间
4. ✓ 年度累计飞行时间
5. ✓ 连续值勤天数
6. ✗ **FDP 上限（缺失）**

**影响**：可能生成 FDP 超限的分配方案。CP-SAT Phase A 理论上会修复，但 Phase A 也使用同一个 `can_add()`，因此 Phase A 同样无法检测 FDP 违规，最终输出可能包含不合规分配。

**修复位置**：`src/algorithm/crew_scheduler.py:can_add()`，需遍历 `pairing.duties` 检查各值勤期 FDP。

---

### P0-2：`cp_model` 死代码导入（Phase A/B 实际未使用 CP-SAT）

**文件**：`src/algorithm/cpsat_polish.py:1`

```python
from ortools.sat.python import cp_model  # 导入但从未使用
```

Phase A 是纯顺序重放（drop-on-violation），Phase B 是同职级贪心单次转移。两个阶段均无任何 CP-SAT 调用（无 `cp_model.CpModel()`、无 `cp_model.CpSolver()`）。

**影响**：
- 模块名称（"CP-SAT Polish"）与实际实现不符，容易造成误解
- 无用导入增加启动时间
- Phase A 无法真正"修复"违规（只能删除），Phase B 也是纯贪心非 CP-SAT 保证最优

**修复位置**：清除死导入；若规范 Phase A/B 的 CP-SAT 实现尚未计划，至少将模块注释更新为准确描述。

---

## P1 问题（高优先级）

### P1-1：`lag_result` 在 pipeline 中被丢弃

**文件**：`src/optimizer/pipeline.py`

`run_lagrangian()` 返回 `LagrangianResult`，其中包含：
- `total_iterations`
- `dual_bound`
- `best_primal_profit`

但 `_make_output()` 未接收 `lag_result` 参数，这三个字段永远不会写入 `RESULT_META`。

规范要求 `RESULT_META` 包含 `total_iterations`、`dual_bound`、`primal_obj`。这些值已经计算完毕，修复成本接近零（只需将 `lag_result` 传入 `_make_output`）。

**修复位置**：`src/optimizer/pipeline.py`，将 `lag_result` 传入 `_make_output`，并在输出行中引用对应字段。

---

## P2 问题（质量与健壮性）

### P2-1：Phase B 仅向末尾追加，FTL 检查不完整

**文件**：`src/algorithm/cpsat_polish.py:_phase_b_lns()`

```python
state = _state_before(least_crew, least_schedule, ftl)  # 最后一个配对末尾的状态
if can_add(state, p, ftl):  # 只检查能否追加到时间表末端
```

`_state_before` 计算的是最轻载机组当前所有配对末尾的状态，因此只允许将新配对插入时间表**末端**。如果要转移的配对时间早于既有配对，`can_add` 会以末尾状态检查，通过后插入，实际产生时间顺序错误的排班。

**修复**：在 `can_add` 前先用配对的 `start_min` 与既有配对做时间顺序检查，确保 p 可以插入到正确的位置，并在正确位置重算状态。

---

### P2-2：Lagrangian 收敛条件与规范不符

**文件**：`src/algorithm/lagrangian.py`

| | 收敛条件 |
|---|---|
| **代码** | `gap_norm_sq <= 0.25`（L2 范数平方） |
| **规范** | `‖gap‖∞ ≤ 0.5`（L∞，最大单分量绝对值） |

两者语义不同。L2 对所有分量同时约束，L∞ 要求每个配对-职级组合的缺口都 ≤ 0.5。在大规模场景（3000+ 配对 × 多职级）下行为差异显著：L2 在分量多时更容易满足（大量小缺口的平方和可能 ≤ 0.25），L∞ 更严格。

**修复**：将收敛判断改为 `max(abs(gap)) <= 0.5`，或同时保留两者取更严格的条件。

---

### P2-3：Phase A 不检查 `time_budget`

**文件**：`src/algorithm/cpsat_polish.py:_phase_a_repair()`

函数接收 `time_budget` 参数但循环体内从未检查已用时间：

```python
for crew_id, crew_assignments in by_crew.items():
    # 没有 time.monotonic() 检查
    ...
```

大规模场景（5000+ 机组）Phase A 可能明显超出分配的 `phase_a_budget`（15% × total），占用后续 Phase B 的时间。

**修复**：在循环内每隔若干机组检查一次 `time.monotonic() - start >= time_budget`，超时则提前退出。

---

## 已确认符合规范的内容

| 模块 | 状态 |
|------|------|
| `io/job_io.py` — gzip + `## SECTION` CSV 格式 | ✓ 完全符合 |
| `utils/ftl_state.py` — DPState 结构、epoch 分钟转换 | ✓ 完全符合 |
| `utils/progress.py` — stdout JSON Lines 进度格式 | ✓ 完全符合 |
| `models/pairing.py` — PairingDuty/Pairing/PairingComposition | ✓ 完全符合（无 `dep_arp`/`arv_arp`，机场资质 gap 已记录于 spec-gaps） |
| `models/crew.py` — Crew/LockedAssignment | ✓ 完全符合 |
| `constraints/compiler.py` — FTLCompiler → CompiledFTL | ✓ 完全符合（含 fdp_limit_func 闭包） |
| `algorithm/eligibility.py` — 8 条消除规则 | ✓ 代码实际 8 个检查（docstring 将月/季/年预算合并写为 1 条，算法数量准确） |
| `algorithm/crew_scheduler.py` — O(P²) DP、利润函数 | ✓ 符合（缺 FDP 检查，见 P0-1） |
| `algorithm/lagrangian.py` — subgradient、Polyak 步长、并行 DP | ✓ 符合（收敛条件差异，见 P2-2） |
| `algorithm/primal_recovery.py` — 2 轮贪心恢复 | ✓ 符合（缺 LP 松弛 Round 1，已记录于 spec-gaps P2） |
| `optimizer/pipeline.py` — 7 阶段编排、时间预算分配 | ✓ 符合（lag_result 丢失，见 P1-1） |
| `__main__.py` — CLI 接口、SIGTERM、退出码 0/1/2/3 | ✓ 完全符合 |

---

## 已记录于 spec-gaps.md 的项（本次确认）

以下项已在 `docs/modules/ro-engine/spec-gaps.md` 正确记录，本次审计交叉确认：

| spec-gaps 条目 | 确认状态 |
|---|---|
| [P0] 机场资质检查缺失（规则 ④） | ✓ 确认：`PairingDuty` 无 `dep_arp`/`arv_arp`，eligibility.py 未实现 |
| [P0] DP `can_add` 缺少 FDP 上限检查 | ✓ 确认（本报告 P0-1） |
| [P1] Rank 级并行分解未实现 | ✓ 确认：所有 Rank 在同一 Lagrangian 循环中 |
| [P2] 预过滤缺 min_rest 前置检查 | ✓ 确认：eligibility.py 无此规则 |
| [P2] Primal Recovery Round 1 应为 LP 松弛取整 | ✓ 确认：直接用 λ 值排序 |
| [P2] CP-SAT Phase B 应为滑动窗口 LNS | ✓ 确认：v1 为贪心单次转移 |
| [P3] CP-SAT Phase C 全局公平性未实现 | ✓ 确认：仅有占位注释 |
| [P2/P3] UNASSIGNED_PAIRINGS 节未输出 | ✓ 确认：pipeline 未生成此节 |
| [P3] RESULT_META 缺 total_iterations/dual_bound | ✓ 确认（本报告 P1-1，修复成本低） |
| [P3] KPI 缺质量指标字段 | ✓ 确认：仅 6 个基础字段 |

---

## 建议修复顺序

1. **P0-1** — `can_add()` 增加 FDP 检查（核心合规性）
2. **P0-2** — 清除 `cp_model` 死导入，更新 cpsat_polish 注释
3. **P1-1** — 将 `lag_result` 传入 `_make_output`，输出对偶信息（改动极小）
4. **P2-3** — Phase A 增加时间检查（5 行代码）
5. **P2-2** — Lagrangian 收敛条件切换为 L∞
6. **P2-1** — Phase B 时间排序检查（需要较多重构，建议与 Phase B LNS 重写一起做）
