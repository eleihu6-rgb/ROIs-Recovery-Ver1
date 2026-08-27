# RO 引擎算法设计

> 对应规范文档：`docs/superpowers/specs/2026-04-17-ro-engine-design.md`
> 标注 `[DEFERRED]` 的功能已在规范中设计，当前版本尚未实现。

---

## 一、算法总览

RO 引擎采用四阶段算法：

```
阶段 1 — 预过滤（eligibility.py）
    消除 60-80% 不可行的 crew-pairing 组合

阶段 2 — Lagrangian 松弛（lagrangian.py + crew_scheduler.py）
    松弛"配对必须由足够数量机组覆盖"的约束
    subgradient 法迭代更新 λ，每轮并行求解每机组独立 DP 子问题

阶段 3 — 原始恢复（primal_recovery.py）
    从对偶解恢复满足 FTL 约束的原始可行方案（2 轮贪心）

阶段 4 — CP-SAT 精修（cpsat_polish.py）
    Phase A：修复任何残余 FTL 违规
    Phase B：LNS 交换，提升工时公平性
    Phase C：全局跨 Rank 公平调整 [DEFERRED]
```

---

## 二、预过滤（eligibility.py）

### 2.1 目标

构建 `dict[crew_idx, list[pairing_idx]]`，将每机组的候选配对从 P 个压缩至 P × 0.2~0.4。

### 2.2 当前实现的 8 条消除规则

| 规则 | 条件 | 淘汰原因 |
|------|------|---------|
| 1 | `crew.division ≠ pairing.division` | 飞行员/客舱不可互换 |
| 2 | `crew.rank ∉ pairing.eligible_ranks` | 职级不满足配对用人需求 |
| 3 | `pairing.fleet ≠ "" and pairing.fleet ∉ crew.fleet_codes` | 机型资质不符 |
| 4 | `pairing.tafb_min > ftl.max_tafb_minutes` | 离基时间超限（来自 JOB_PARAMS） |
| 5 | `pairing.total_flt_min > 月剩余额度` | 月累计飞时超限 |
| 6 | `pairing.total_flt_min > 季剩余额度` | 季度累计飞时超限 |
| 7 | `pairing.total_flt_min > 年剩余额度` | 年度累计飞时超限 |
| 8 | 配对时间段与机组任何锁定事项重叠 | 时间冲突 |

### 2.3 规范中设计但当前未实现的规则

| 规范规则 | 说明 | 状态 |
|---------|------|------|
| 机场资质检查 | pairing 途经受限机场但机组无 airport_quals | [DEFERRED] |
| 最小休息前置检查 | `pairing.start_min < crew.last_rest_end_min + min_rest`（排班窗口起始状态检查） | [DEFERRED] |

> 注：最小休息在 DP 的 `can_add()` 中基于动态状态检查，覆盖了排班过程中的情况。
> 静态预过滤中缺少对窗口起始历史休息状态的检查。

### 2.4 复杂度

O(C × P)，C = 机组数，P = 配对数。1,000 机组 × 2,000 配对约 2M 次比较，< 1 秒。

---

## 三、每机组 DP（crew_scheduler.py）

### 3.1 Lagrangian 子问题

给定机组 c 和 Lagrange 乘数 λ，求解独立最大化问题：

```
max  Σ_{p ∈ eligible(c)} x_{c,p} · profit(c, p, λ, state)
s.t. FTL 约束（最小休息、累计飞时、连续值勤天数）
     时间顺序约束（配对不重叠）
```

### 3.2 DPState 结构

```python
@dataclass(frozen=True)
class DPState:
    last_end_min: int          # 最后一次值勤/活动结束时刻（epoch 分钟）
    last_rest_end_min: int     # 最后一次休息结束（当前实现中 = last_end_min）
    month_flt_min: int         # 当月累计飞行分钟（含历史）
    quarter_flt_min: int       # 当季累计飞行分钟
    year_flt_min: int          # 当年累计飞行分钟
    consecutive_duties: int    # 连续值勤天数（duty_count 累计）
```

时间单位：epoch 分钟（自 2000-01-01 00:00 UTC 起的分钟数）。

### 3.3 FTL 可行性检查（can_add）

`can_add(state, pairing, ftl)` 当前检查 5 项约束：

| 约束 | 检查内容 |
|------|---------|
| 最小休息 | `pairing.start_min < state.last_rest_end_min + ftl.min_rest_minutes` → 拒绝 |
| 月飞时 | `state.month_flt_min + pairing.total_flt_min > ftl.max_month_flt_min` → 拒绝 |
| 季度飞时 | `state.quarter_flt_min + pairing.total_flt_min > ftl.max_quarter_flt_min` → 拒绝 |
| 年度飞时 | `state.year_flt_min + pairing.total_flt_min > ftl.max_year_flt_min` → 拒绝 |
| 连续值勤 | `state.consecutive_duties + pairing.duty_count > ftl.max_consecutive_duty_days` → 拒绝 |

> [DEFERRED] FDP 上限（`fdp_limit_func`）当前未在 `can_add` 中检查。FDP 约束已编译进 `CompiledFTL` 但仅用于规划，尚未集成到 DP 可行性判断。

### 3.4 利润函数（compute_profit）

```python
profit = λ[pairing_id][crew.rank]           # Lagrange 项（主驱动）
       - base_penalty                        # 基地不匹配惩罚（来自 preferred_base_weight）
       - fairness_penalty                    # 工时偏差惩罚（×0.1 系数）
```

其中 `fairness_penalty = |projected_hours - fairness_target_hours| × 0.1`

### 3.5 DP 复杂度

O(P²)，P = 每机组候选配对数（预过滤后通常 < 200）。单机组 < 1ms，5,000 名机组并行 → 单轮迭代 < 5 秒。

---

## 四、Lagrangian 主循环（lagrangian.py）

### 4.1 松弛的约束

松弛 Composition 覆盖约束（C1），引入 Lagrange 乘数 `λ[p][r]`：

```
gap[p][r] = required(p, r) - Σ_c assigned(c, p, r)
```

gap > 0 → 人手不足，提高 λ；gap < 0 → 人手过多，降低 λ。

### 4.2 subgradient 更新（Polyak 步长）

```
α_k = ρ × (best_primal - L_k) / Σ gap²      # Polyak 步长
λ_{k+1}[p][r] = λ_k[p][r] + α_k × gap_k[p][r]
```

`ρ` 初始为 1.5，每连续 50 轮无对偶界改进则 `ρ *= 0.9`（几何衰减）。

### 4.3 Rank 独立性（并行基础）

不同 Rank 的机组之间完全解耦，各 Rank 的 Lagrangian 子问题可独立并行。

> [DEFERRED] 当前版本**未实现 Rank 级并行分解**，所有机组在同一 Lagrangian 循环中处理。规范中设计的 `multiprocessing.Pool` Rank 级并发尚未实现，大规模场景（1,000+ 机组）性能有提升空间。

### 4.4 收敛条件（满足任一停止）

| 条件 | 阈值 |
|------|------|
| 覆盖缺口的 L2 范数平方 | `Σ gap² ≤ 0.25` |
| 达到最大迭代次数 | `max_iterations`（默认 500） |
| 对偶界连续无改进 | 每 50 轮检查，`ρ` 缩减至趋近 0 |
| 时间预算耗尽 75% | `elapsed ≥ time_limit × 0.75` |
| SIGTERM 信号 | 立即退出当前迭代 |

### 4.5 并行策略

机组数 ≤ 50：每机组 DP 按序执行（避免进程启动开销）  
机组数 > 50：`ProcessPoolExecutor` 并行，每机组独立无共享状态

---

## 五、原始恢复（primal_recovery.py）

从 Lagrangian 对偶解恢复满足 FTL 约束的可行整数解。当前实现 **2 轮**（规范设计为 3 轮，LP 松弛取整步骤已推迟）：

### Round 1 — 优先级取整（基于 λ 值）

```
对每个配对 p，按 rank 分组：
    候选 = 在 Lagrangian 迭代中选择了 p 的机组
    按 λ[p][rank] 降序排列（λ 值高 = 覆盖该配对最有价值）
    取前 required(p, rank) 个满足 FTL 的机组
```

> [DEFERRED] 规范中 Round 1 应为 LP 松弛取整（用 OR-Tools LP 求解 x ∈ [0,1]，取分数解最高的机组）。当前直接用 λ 值代替 LP 分数，效果稍差但实现更简单。

### Round 2 — 贪心填充

```
对仍未满足覆盖需求的配对：
    扫描所有满足资质的机组（division, rank, fleet 匹配，未重复分配）
    检查 FTL 可行性后分配，直到 required_count 满足
```

---

## 六、CP-SAT 精修（cpsat_polish.py）

### Phase A — FTL 违规修复（已实现）

按时序回放每机组的分配方案，遇到 `can_add()` 返回 False 的配对直接丢弃：

```python
for assign in sorted_by_start_min:
    if can_add(state, pairing, ftl):
        state = next_dp_state(state, pairing)
        valid.append(assign)
    # else: 丢弃，消除违规
```

时间预算：`total_budget × 15%`，上限 30 秒。

### Phase B — LNS 公平性改进（已实现，v1 简化版）

同职级机组中，找出飞时差 ≥ 60 分钟的最过载/最轻载机组对，尝试转移一个配对：

```
循环最多 20 轮（或时间耗尽）：
    找 same-rank 最过载 & 最轻载机组对
    如飞时差 < 60 分钟：跳过
    尝试将最过载机组的配对移给最轻载机组
    验证 FTL 后执行交换，更新飞时记录
```

> 规范中 Phase B 为滑动窗口 LNS，对 Top-K 不均衡机组用 CP-SAT 重新优化窗口内分配。当前 v1 为简化的贪心交换。[DEFERRED for v1.1]

### Phase C — 全局公平性调整 [DEFERRED]

规范中设计的跨 Rank 工时均衡调整（计算全局飞时分布，对超出均值 ±σ 的机组做双向 swap 验证）。当前版本未实现。

---

## 七、目标函数参数化

| 参数 | JOB_PARAMS 字段 | 默认值 | 作用 |
|------|---------------|-------|------|
| 基地偏好惩罚 | `preferred_base_weight` | 50.0 | 基地不匹配时从利润中扣除 |
| 工时公平目标 | `fairness_target_hours` | 80.0 小时/月 | 偏差惩罚的目标值 |
| 未覆盖惩罚 | `weights_unassigned` | 1000.0 | Lagrangian 中未覆盖配对的代理成本 |
| 时间上限 | `time_limit_sec` | 300 | 总求解时间（秒） |
| 最大迭代 | `max_iterations` | 500 | Lagrangian 最大迭代次数 |

所有参数从 JOB_PARAMS 读取，无硬编码业务常量。
