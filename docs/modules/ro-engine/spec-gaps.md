# RO 引擎规范差距（Spec Gaps）

本文档列出规范文档（`docs/superpowers/specs/2026-04-17-ro-engine-design.md`）中已设计、
但当前版本（v1.0）尚未实现的功能，及其优先级建议。

---

## 优先级定义

- **P0**：影响正确性或合规性，必须在 v1.1 中修复
- **P1**：影响大规模性能，5,000+ 机组场景下需要
- **P2**：提升解的质量，建议 v1.1~v1.2 实现
- **P3**：完善度/可观测性，v2.0 前完成

---

## 算法层

### [P1] Rank 级并行分解（Stage 4）

**规范**：按 Rank 拆分为完全独立的 Lagrangian 子问题，用 `multiprocessing.Pool` 并行执行。  
**现状**：所有 Rank 在同一 Lagrangian 循环中处理，ProcessPoolExecutor 仅在迭代内的机组 DP 层并行。  
**影响**：5,000 名机组场景中，单轮迭代时间可能超过 5 秒目标。  
**实现位置**：`algorithm/lagrangian.py`，需增加 Rank 分组 + Pool 调度逻辑。

---

### [P0] 预过滤缺少：机场资质检查（规范规则 ④）

**规范**：消除"配对途经受限机场但机组无对应 airport_quals 资质"的组合。  
**现状**：`airport_quals` 字段已解析并存入 `crew.airport_quals`，但 `build_eligibility` 中未使用。  
**影响**：可能将无资质机组分配到需要特殊机场资质的配对，导致合规问题。  
**实现位置**：`algorithm/eligibility.py`，需要在 PAIRING_DUTIES 中记录途经机场字段（当前 duty 模型未含机场信息）。  
**依赖**：需先在 `PairingDuty` 模型中增加 `dep_arp`/`arv_arp` 字段，并在 input.gz 中携带。

---

### [P2] 预过滤缺少：窗口起始最小休息前置检查（规范规则 ⑥）

**规范**：`pairing.start_min < crew.last_rest_end_min + min_rest` → 在预过滤阶段提前消除。  
**现状**：该检查在 DP 的 `can_add()` 中动态执行（基于当前 DPState），因此不会导致违规，
但预过滤阶段遗漏会增加 DP 的候选集，降低效率。  
**影响**：预过滤消除率略低，迭代速度稍慢，无正确性问题。  
**实现位置**：`algorithm/eligibility.py`，增加第 9 条规则。

---

### ~~[P0] DP `can_add` 缺少 FDP 上限检查~~ ✅ 已修复（2026-04-18）

`can_add()` 新增第 6 项检查：遍历 `pairing.duties`，以 `pairing.seg_count // duty_count` 为近似值调用 `fdp_limit_func`，拒绝任一值勤期 FDP 超限的配对。

---

### [P2] Primal Recovery Round 1 应为 LP 松弛取整

**规范**：Round 1 先用 OR-Tools LP Solver 求解松弛版本（x ∈ [0,1]），得到分数解后按分数降序取整。  
**现状**：直接用 Lagrange 乘数 λ 值作为优先级排序，跳过 LP 松弛步骤。  
**影响**：解的质量稍低（λ 排序 vs LP 分数排序），但不影响可行性。  
**实现位置**：`algorithm/primal_recovery.py`，需增加 LP 构建和求解逻辑。

---

### [P2] CP-SAT Phase B 应为滑动窗口 LNS（完整 FTL 检查已修复）

**规范**：对 Top-K 最不均衡机组，用 CP-SAT 重新优化滑动时间窗口内的分配。  
**现状**：v1 实现为简化的同职级贪心配对交换。FTL 检查已于 2026-04-18 升级为全程重放
（`_is_insertable` 函数），可正确处理插入任意位置的场景，不再局限于末尾追加。  
**残余差距**：CP-SAT 窗口建模部分仍未实现，工时均衡改善幅度低于规范目标。  
**实现位置**：`algorithm/cpsat_polish.py:_phase_b_lns()`。

---

### [P3] CP-SAT Phase C：全局公平性调整

**规范**：计算全局飞时分布，对超出均值 ±σ 的机组做双向 swap（释放 + 接收），CP-SAT 验证 FTL 可行性。  
**现状**：Phase C 留有占位注释但未实现。  
**影响**：不影响正确性，提升跨 Rank 工时均衡质量。  
**实现位置**：`algorithm/cpsat_polish.py:polish()`，增加 Phase C 逻辑。

---

## I/O 层

### [P2] 输出节 UNASSIGNED_PAIRINGS

**规范**：`out.gz` 包含 `UNASSIGNED_PAIRINGS` 节，记录每个未完全覆盖配对的职级缺口和原因。  
**现状**：pipeline 不输出此节，未覆盖配对信息仅通过 `KPI.fully_covered` 聚合上报。  
**影响**：Optimizer Manager 无法细粒度展示哪些配对缺人、缺的是哪个职级。  
**实现位置**：`optimizer/pipeline.py:_make_output()`。

---

### ~~[P3] RESULT_META 增加对偶信息字段~~ ✅ 已修复（2026-04-18）

`lag_result` 已传入 `_make_output`，RESULT_META 新增 `total_iterations`、`dual_bound`、`primal_obj` 三个字段。

---

### [P3] KPI 增加质量指标字段

**规范**：`flight_hours_std_dev`、`base_match_rate`、`crews_used`、`avg_flight_hours`、`cpsat_polish_rounds`  
**现状**：当前 KPI 只有 6 个基础字段。  
**实现位置**：`optimizer/pipeline.py:_make_output()`，增加统计计算。

---

## 质量验收标准（规范）

| 指标 | 目标 | 当前状态 |
|------|------|---------|
| assignment_rate（覆盖率） | ≥ 95% | 已检查，输出为 `coverage_pct` |
| FTL 违规 | = 0 | Phase A 保证，但 FDP 检查缺失（见 P0 上方） |
| flight_hours_std_dev 改善 | ≥ 20%（vs 纯贪心） | 未度量 [P3] |
| dual_gap（对偶界差距） | ≤ 5% | 未输出 [P3] |
