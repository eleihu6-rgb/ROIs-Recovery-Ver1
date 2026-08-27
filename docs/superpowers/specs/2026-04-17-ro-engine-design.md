# RO Engine v2 设计文档

**日期**：2026-04-17  
**作者**：yuan.zhu-ai  
**状态**：已审核，待实施  

---

## 一、背景与目标

RO Engine（Roster Optimization Engine）是机组排班系统的**配对分配优化引擎**，负责将 PO Engine 生成的 Pairing 分配给合适的机组成员。

### 1.1 规模要求

| 维度 | 典型规模 |
|------|---------|
| 机组人数 | 5,000+ 名（如 TG 乘务员） |
| Pairing 数 | 3,000+ 条 |
| 变量空间 | 最大 1,500 万个二值变量 |
| 单 Rank 机组 | 1,000+ 名 |

直接使用 CP-SAT 对全量数据建模不可行，必须采用工业级大规模分解算法。

### 1.2 设计原则

- **质量优先，速度第二**：在时间预算内尽量提升解的全局质量
- **黑盒 CLI**：与 po-engine 架构完全一致，无 HTTP 服务、无数据库连接
- **两层并发**：引擎内部并发 + engine-server 外部并发
- **动态分解**：按 Base / Rank / Fleet / Team 等维度自适应分块
- **工业标准算法**：Lagrangian Relaxation（GENCOL/CARMEN 同类方法）

---

## 二、整体架构

### 2.1 黑盒 CLI 接口（与 po-engine 完全一致）

```
python -m src --input /path/input.gz --output /path/out.gz

stdout: JSON Lines 进度上报
exit:   0=DONE  1=INFEASIBLE  2=TIMEOUT  3=INTERNAL_ERROR
```

### 2.2 目录结构（全部重写）

```
ro-engine/
└── src/
    ├── __main__.py              # CLI 入口，SIGTERM 处理
    ├── io/
    │   └── job_io.py            # 读写 input.gz / out.gz（与 po-engine 同格式）
    ├── optimizer/
    │   └── pipeline.py          # AllocationPipeline — 总调度（9 个 Stage）
    ├── constraints/
    │   └── compiler.py          # Rule Config → CompiledFTL（FTL 约束函数集）
    ├── algorithm/
    │   ├── eligibility.py       # 预过滤：构建 crew-pairing 可行矩阵
    │   ├── crew_scheduler.py    # 每名机组独立子问题（DP，毫秒级）
    │   ├── lagrangian.py        # Lagrangian 主循环：乘子更新 + 收敛判断
    │   ├── primal_recovery.py   # 对偶解 → 原始可行解（LP + 贪心取整）
    │   └── cpsat_polish.py      # CP-SAT 三阶段精修
    └── utils/
        ├── progress.py          # stdout JSON Lines（与 po-engine 同格式）
        ├── ftl_state.py         # 每名机组 FTL 计数器状态
        └── logging.py
```

### 2.3 两层并发架构

| 层次 | 机制 | 粒度 |
|------|------|------|
| 外层（engine-server）| 多个 ro-engine 进程 | 不同 scenario / 日期范围 |
| 内层 L1（Rank 级）| `multiprocessing.Pool` | 每个 Rank 组独立 Lagrangian |
| 内层 L2（迭代内）| `ProcessPoolExecutor` | 每名机组独立 DP 子问题 |

进程隔离：使用 `spawn` 模式，避免 fork + OR-Tools 内部状态冲突。

---

## 三、优化 Pipeline（9 个 Stage）

```
Stage 1  ( 2%)  Parse + Validate         解析 input.gz 全部 section，校验必要字段
Stage 2  ( 5%)  Compile FTL              Rule Config → CompiledFTL 约束函数集
Stage 3  (10%)  Pre-filter               构建可行矩阵，消除 60-80% 不可能 crew-pairing 对
Stage 4  (12%)  Rank Decomposition       按 Rank 拆分为完全独立子问题
Stage 5  (15%)  Initialize λ             初始化 Lagrange 乘子（λ = 0）
Stage 6  (15%→75%)  Lagrangian Loop      子梯度迭代（最多 500 轮）
                    ├── 并行逐人 DP 求解
                    ├── 计算 coverage gap
                    └── 更新乘子 λ（Polyak 步长）
Stage 7  (80%)  Primal Recovery          LP 松弛取整 → 优先级取整 → 贪心补充
Stage 8  (85%→92%)  CP-SAT Polish        三阶段精修（违规修复 + LNS 改善 + 全局公平）
Stage 9  (95%)  Extract + Write out.gz
```

---

## 四、核心算法：Lagrangian Relaxation

### 4.1 问题建模（GAP + FTL）

**决策变量：**
```
x[c, p] ∈ {0, 1}  — 机组 c 是否分配 pairing p
```

**目标函数（最小化）：**
```
w₁ × Σ_p (1 − Σ_c x[c,p] / required[p][rank])   # 未分配惩罚
+ w₂ × (max_load − min_load)                       # 工时均衡（同 Rank 内）
+ w₃ × Σ_{c,p} mismatch[c,p] × x[c,p]             # 基地/机型偏好
+ w₄ × Σ_{c,p} pref_penalty[c,p] × x[c,p]         # 机组偏好（PBS）
```

**硬约束：**
```
C1. Σ_c x[c,p] = required[p][rank]    # Composition（← 松弛为 Lagrangian 约束）
C2. 同一机组不飞时间重叠的 pairing    # per-crew（保留在 DP 中）
C3. 同一机组满足 FTL 规则             # per-crew（保留在 DP 中）
C4. 资质匹配（Rank/Fleet/Airport）     # per-crew（Pre-filter 消除）
C5. 锁定排班不可改动                  # per-crew（DP 固定路径段）
```

### 4.2 Lagrangian 松弛

松弛 Composition 约束 C1，引入乘子 `λ[p][r]`（pairing p，Rank r 的"价格"）：

```
L(λ) = Σ_p λ[p][r] × required[p][r]
      + Σ_c min{ Σ_p (cost[c,p] − λ[p][rank_c]) × x[c,p]
               subject to C2, C3, C4, C5 }
```

松弛后问题**完全按机组分解**，每名机组独立求解：

```
min Σ_p (cost[c,p] − λ[p][rank_c]) × x[c,p]
s.t. C2（时间不重叠）, C3（FTL）, C4（资质）, C5（锁定）
```

### 4.3 每机组 DP 子问题

**本质：** 带 FTL 资源约束的加权区间调度（Resource-Constrained Scheduling）

**DP 状态：**
```python
@dataclass(frozen=True)
class DPState:
    last_end_min: int          # 上次 pairing/locked 结束时间（分钟）
    last_rest_end_min: int     # 上次休息结束（用于 min_rest 检查）
    month_flt_min: int         # 当月累计飞行分钟（含历史）
    quarter_flt_min: int       # 当季累计飞行分钟
    consecutive_duties: int    # 连续执勤天数
```

**DP 转移（对时间排序的候选 pairing 列表）：**
```python
def can_add(state: DPState, pairing: Pairing, ftl: CompiledFTL) -> bool:
    # 1. 时间顺序：pairing.start >= state.last_end + MCT
    # 2. 最小休息：pairing.start − state.last_rest_end >= min_rest
    # 3. 月度飞行：state.month_flt_min + pairing.flt_min <= max_month
    # 4. 季度飞行：state.quarter_flt_min + pairing.flt_min <= max_quarter
    # 5. 连续执勤：state.consecutive_duties < max_consecutive
    # 6. FDP：各执勤期 fdp_min <= max_fdp（动态上限，含时区修正）

def profit(crew, pairing, λ, ftl) -> float:
    base_score    = ftl.preferred_base_weight if crew.base == pairing.base else 0
    fairness_score = −abs(crew.projected_hours + pairing.flt_min / 60
                          − ftl.fairness_target_hours)
    lagrange_price = λ[pairing.id][crew.rank]
    return base_score + fairness_score + lagrange_price
```

**复杂度：** `O(P² × S)`，P = 候选 pairing 数（< 200），S < 500 有效状态。单机组 < 1ms，5,000 名机组全部并行 → 单轮迭代 < 5 秒。

### 4.4 子梯度迭代

```
每轮迭代 k：

1. 并行求解所有机组 DP → x_k[c, p]

2. 计算 coverage gap：
   gap_k[p][r] = required[p][r] − Σ_{c: rank_c=r} x_k[c, p]
   # gap > 0：人手不足（提价）  gap < 0：人手过多（降价）

3. Polyak 步长（自适应）：
   α_k = ρ × (f_primal_best − L_k) / ‖gap_k‖²
   ρ 初始 = 1.5；连续 50 轮无改善则 ρ *= 0.9

4. 更新乘子：
   λ_{k+1}[p][r] = λ_k[p][r] + α_k × gap_k[p][r]
   （允许 λ 为负，对过度覆盖的 pairing 降价）

5. 记录最优：
   L_best = max(L_best, L_k)
   每轮用贪心快照计算原始解，保留历史最优原始解
```

**收敛条件（满足任一停止）：**
```
‖gap_k‖∞ ≤ 0.5       # 所有 pairing coverage gap 近似满足
k ≥ max_iterations    # 默认 500 轮
对偶界连续 50 轮无改善
time_limit_sec 超出（或收到 SIGTERM）
```

### 4.5 Rank 独立性（并行基础）

| 约束类型 | 跨 Rank 耦合？ | 处理方式 |
|---------|--------------|---------|
| Composition | 否（per rank） | 每 Rank 独立 Lagrangian |
| 时间冲突 | 否（per crew） | DP 内处理 |
| FTL | 否（per crew） | DP 内处理 |
| 资质 | 否（per crew） | Pre-filter |
| 工时均衡 | 同 Rank 内 | Rank 内 fairness_target |
| 全局跨 Rank | 无（每名机组 Rank 唯一） | — |

→ **Rank 组间完全解耦，可 100% 并行。**

---

## 五、Primal Recovery（对偶解 → 可行原始解）

三轮逐步收紧，质量优先：

**Round 1 — LP 松弛取整：**
```
对 Lagrangian 最优对偶解，构建 LP 松弛（x ∈ [0,1]）
用 OR-Tools LP Solver 求解（秒级）
得到分数解 x̄[c,p] ∈ [0,1]
```

**Round 2 — 优先级取整（基于 LP 分数）：**
```
对每个 pairing p，按 x̄[c,p] 降序排列候选机组
依次取 required[p][r] 名（LP 分数最高的优先）
同时验证 FTL 可行性（不可行则跳过取下一名）
```

**Round 3 — 贪心补充（处理仍未覆盖的 pairing）：**
```
对 coverage < required 的 pairing，从剩余可用机组中按综合评分补充：
score = α × 基地匹配 + β × 工时均衡贡献 + γ × 机组偏好（PBS）
降级保障：若 LP Solver 失败，直接从 Round 2 开始（纯优先级取整）
```

---

## 六、CP-SAT Polish（三阶段质量精修）

时间占比约 45% 总预算，是质量提升的核心阶段。

**Phase A — 违规修复（硬约束，必须完成）：**
```
对取整后 FTL 违规 / 时间冲突的机组，
以其可行 pairing 子集建小规模 CP-SAT 严格修复
规模：< 300 crew × 100 pairings，耗时 < 30s
```

**Phase B — LNS 局部改善（软约束质量提升，主力）：**
```
对工时分布最不均衡的 Top-K 机组（K = 50~200），
用滑动窗口 LNS：
  ├── 固定窗口外所有分配不变
  ├── CP-SAT 重新优化窗口内分配（目标：降低 std_dev）
  └── Accept if improvement（目标函数下降）
多窗口在时间预算内尽量多轮，可并行
```

**Phase C — 全局公平性调整（跨 Rank 工时均衡）：**
```
计算所有机组当月飞行小时分布
对超出均值 ±σ 的机组，尝试 swap 操作：
  ├── 高负载机组释放一条 pairing
  └── 低负载机组接收该 pairing
CP-SAT 验证 swap 双向 FTL 可行性
贪心接受：双方均改善则执行
```

**质量优先时间分配：**
```
Stage 6  Lagrangian Loop      40% 时间预算
Stage 7  Primal Recovery      10% 时间预算
Stage 8  CP-SAT Polish
  Phase A  违规修复            5%
  Phase B  LNS 局部改善       30%
  Phase C  全局公平调整        10%
Stage 9  Extract + Write       5%
```

---

## 七、约束编译（CompiledFTL）

Rule Config section 在引擎启动时编译为 Python 函数，**运行时零 HTTP 调用**：

```python
@dataclass
class CompiledFTL:
    # 硬约束
    max_fdp_func: Callable            # FDP 上限（含报告时间、时区修正）
    min_rest_func: Callable           # 最小休息（基于前序执勤期时长）
    max_duty_flt_min: int             # 单次执勤最大飞行分钟
    max_month_flt_min: int            # 月度飞行上限
    max_quarter_flt_min: int          # 季度飞行上限
    max_year_flt_min: int             # 年度飞行上限
    max_consecutive_duty_days: int    # 最大连续执勤天数
    max_tafb_hours: int               # 最大离基时间（小时）

    # 软约束参数（影响 DP profit）
    preferred_base_weight: float
    fairness_target_hours: float      # 目标月飞行小时
```

---

## 八、Pre-filter 可行矩阵

Lagrangian 迭代前一次性构建，减少每轮 DP 候选空间。

**消除条件（任一满足即消除）：**
```
① crew.division ≠ pairing.division
② crew.rank ∉ pairing 的 PAIRING_COMPOSITIONS rank 列表
③ pairing.fleet ∉ crew.fleet_codes（机型资质不符）
④ pairing 途经受限机场但机组无对应资质
⑤ pairing 与任何 locked_assignment 时间重叠
⑥ pairing.start < crew.last_rest_end + min_rest（历史状态已超限）
⑦ pairing.flt_min > crew.remaining_month_flt_min（月度额度耗尽）
```

**预期消除率：60-80%**（大幅减少每轮 DP 的候选 pairing 数量）

---

## 九、I/O 格式

### 9.1 input.gz 各节

> 注：具体 CSV 字段名以 live-server / engine-server 实际 API 为准，以下为结构性设计，允许略微变化。

```
## JOB_PARAMS
time_limit_sec, division, weights_unassigned, weights_fairness,
weights_base_pref, weights_crew_pref, max_iterations, decomp_dims,
target_block_size

## CREWS
crew_id, first_name, last_name, division, rank, base, fleet, team,
status, filiale

## CREW_QUALIFICATIONS
crew_id, qualification, eff_dt, exp_dt, fleet_specific, ac_type,
is_valid, airport

## CREW_FTL_STATE
crew_id, month_flt_min_used, quarter_flt_min_used, year_flt_min_used,
last_duty_end_utc, last_rest_start_utc, last_rest_end_utc,
consecutive_duty_days, days_away_from_base

## LOCKED_ASSIGNMENTS
crew_id, entry_type, ref_id, start_utc, end_utc, flt_min, is_locked

## PAIRINGS
pairing_id, pairing_label, division, rank, base, fleet,
assignment_group, start_utc, end_utc, tafb_min, total_flt_min,
duty_count, seg_count

## PAIRING_DUTIES
pairing_id, duty_seq, duty_start_utc, duty_end_utc,
fdp_min, flt_min, rest_after_min

## PAIRING_COMPOSITIONS
pairing_id, rank, required_count

## RULE_CONFIG_META
group_code, group_name, usage, filiale, division

## RULES
template_code, instance_code, name, category, check_type,
severity, overridable, constraint_type, params_json
```

### 9.2 out.gz 各节

```
## RESULT_META
status, solve_time_sec, total_iterations, dual_bound,
primal_obj, generated_at

## KPI
total_pairings, assigned_pairings, unassigned_pairings,
assignment_rate, total_crews, crews_used, avg_flight_hours,
flight_hours_std_dev, base_match_rate, total_deadheads,
cpsat_polish_rounds

## ASSIGNMENTS
crew_id, pairing_id, acting_rank, base_match

## UNASSIGNED_PAIRINGS
pairing_id, pairing_label, rank, required_count,
assigned_count, reason
# reason: NO_QUALIFIED_CREW | FTL_EXHAUSTED | TIME_CONFLICT | PARTIAL
```

---

## 十、错误处理与可靠性

### 10.1 退出码 + SIGTERM

```
SIGTERM 触发后：
  - 完成当前 Lagrangian 迭代
  - 跳过剩余迭代，进入 Primal Recovery
  - 用当前最优对偶解生成原始解
  - 写入 out.gz（status=TIMEOUT），exit(2)
```

### 10.2 各阶段失败处理

| 阶段 | 失败场景 | 处理方式 |
|------|---------|---------|
| Parse | section 缺失/格式错误 | exit(3)，写 FAILED out.gz |
| Pre-filter | 所有对均被消除 | exit(1)，写 INFEASIBLE + 原因 |
| Lagrangian 迭代 | 单机组 DP 异常 | 跳过该机组本轮，记录警告，继续 |
| Lagrangian 迭代 | 乘子发散（\|λ\| > 1e8） | 重置步长，从当前最优重新启动 |
| Primal Recovery | LP solver 失败 | 降级为纯优先级取整，记录警告 |
| CP-SAT Polish | 超时未完成 | 返回 Phase A 结果，跳过 B/C |
| Write out.gz | 磁盘写入失败 | exit(3)，stderr 输出错误 |

### 10.3 stdout 进度上报格式

```jsonc
{"event":"progress","phase":"pre_filter","pct":10,"msg":"Eliminated 1.2M of 1.5M pairs (80%)"}
{"event":"progress","phase":"lagrangian","pct":35,"msg":"Iter 45/500: dual=−12450, gap=23.4"}
{"event":"progress","phase":"lagrangian","pct":60,"msg":"Iter 180/500: dual=−11820, gap=3.1, best_primal=−11750"}
{"event":"progress","phase":"primal_recovery","pct":80,"msg":"LP rounding: 2847/3000 pairings covered"}
{"event":"progress","phase":"cpsat_polish","pct":88,"msg":"Phase B LNS round 3: std_dev 42.1→38.6 min"}
{"event":"done","status":"DONE","pct":100,"msg":"Assigned 2981/3000 pairings, std_dev=36.2 flt_min"}
```

---

## 十一、测试策略

### 11.1 单元测试（pytest）

| 测试文件 | 覆盖内容 |
|---------|---------|
| `test_compiler.py` | Rule Config → CompiledFTL 参数正确性 |
| `test_eligibility.py` | 6 条消除规则各自正确触发，消除率合理 |
| `test_crew_scheduler.py` | DP 基本算例（已知最优解验证）、FTL 边界条件、锁定条目处理 |
| `test_lagrangian.py` | 乘子更新公式、Polyak 步长、收敛判断逻辑 |
| `test_primal_recovery.py` | LP 取整可行性、贪心补充覆盖率、降级路径 |
| `test_job_io.py` | input.gz / out.gz 读写往返一致性 |

### 11.2 集成测试

```
test_pipeline_small.py
  - 10 crew × 20 pairings，已知最优解验证
  - 全部 9 个 Stage 完整运行，out.gz 内容正确

test_pipeline_ftl_edge.py
  - 月度额度刚好耗尽的机组
  - 含锁定排班的机组（LEAVE / TRAINING）
  - 跨月执勤期 FTL 计数器计算

test_sigterm.py
  - 发送 SIGTERM，验证 out.gz 写入 status=TIMEOUT
  - 结果文件完整可解析

test_scale_benchmark.py
  - 500 crew × 200 pairings 基准测试
  - 记录各 Stage 耗时，Stage 6 单轮迭代 < 5s
```

### 11.3 质量验收标准

```
assignment_rate        ≥ 95%   （正常情况；人力不足时允许低于）
flight_hours_std_dev   改善 ≥ 20%（相比纯贪心基线）
dual_gap               ≤ 5%    （对偶界 vs 原始解差距）
FTL 违规               = 0     （硬约束，CP-SAT Polish Phase A 保证）
```

---

## 十二、与 po-engine 对照

| 维度 | po-engine v2 | ro-engine v2 |
|------|-------------|-------------|
| 问题类型 | Pairing 生成（Set Partitioning） | Pairing 分配（GAP + FTL） |
| 核心算法 | 列生成 + MIP 集合分割 | Lagrangian Relaxation + DP |
| 分解方式 | 按值勤期候选生成 | 按 Rank × 机组 |
| 每子问题 | 航班连接 DP | 机组 RCSP DP |
| CP-SAT 角色 | MIP 集合分割主力 | Polish 精修（质量提升） |
| CLI 接口 | 完全一致 | 完全一致 |
| I/O 格式 | `## SECTION` CSV-in-gzip | `## SECTION` CSV-in-gzip |
| 进度格式 | JSON Lines stdout | JSON Lines stdout |
