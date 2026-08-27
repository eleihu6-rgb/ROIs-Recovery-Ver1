# RO 引擎架构设计

> 标注 `[DEFERRED]` 的功能已在规范文档中设计，当前版本尚未实现。

---

## 一、模块结构

```
ro-engine/src/
├── __main__.py              # CLI 入口，SIGTERM 处理，退出码映射
├── io/
│   └── job_io.py            # input.gz / out.gz 读写（## SECTION CSV 格式）
├── models/
│   ├── crew.py              # Crew, LockedAssignment 数据类
│   ├── pairing.py           # Pairing, PairingDuty, PairingComposition 数据类
│   └── rule_config.py       # RuleConfig（Pydantic，与 po-engine 共享）
├── constraints/
│   └── compiler.py          # FTLCompiler → CompiledFTL
├── algorithm/
│   ├── eligibility.py       # 预过滤：8 条消除规则，构建 crew→pairing 索引
│   ├── crew_scheduler.py    # 每机组 DP 子问题（O(P²) Lagrangian 子问题求解器）
│   ├── lagrangian.py        # Lagrangian 主循环（subgradient 迭代 + 并行 DP）
│   ├── primal_recovery.py   # 对偶解 → 原始可行解（λ 优先级取整 + 贪心填充）
│   └── cpsat_polish.py      # CP-SAT 精修（Phase A: 违规修复, Phase B: 贪心 LNS）
├── optimizer/
│   └── pipeline.py          # AllocationPipeline — 总调度，解析输入，编排各阶段
└── utils/
    ├── progress.py          # stdout JSON Lines 进度上报
    ├── ftl_state.py         # DPState + epoch 时间工具
    └── logging.py           # 结构化日志
```

---

## 二、Pipeline 阶段（7 个 Stage）

```
Stage 1  ( 2%)  Parse + Compile FTL     解析 RULE_CONFIG_META/RULES → CompiledFTL
Stage 2  ( 5%)  Parse Crews             合并 CREWS + QUALIFICATIONS + FTL_STATE + LOCKED
Stage 3  ( 8%)  Parse Pairings          合并 PAIRINGS + PAIRING_DUTIES + PAIRING_COMPOSITIONS
Stage 4  (12%)  Pre-filter              构建可行矩阵，消除 60-80% 不可行 crew-pairing 对
Stage 5  (15%→75%)  Lagrangian Loop     子梯度迭代，每轮并行逐机组 DP
Stage 6  (75%→82%)  Primal Recovery     λ 优先级取整 Round 1 + 贪心补充 Round 2
Stage 7  (84%→97%)  CP-SAT Polish       Phase A（违规修复）+ Phase B（LNS 公平交换）
```

> [DEFERRED] 规范设计为 9 个 Stage，当前缺少：
> - **Stage 4 Rank Decomposition**（按 Rank 拆分为完全独立子问题，多 Rank 并行 Lagrangian）
> - **Stage 5 Initialize λ**（在规范中为独立阶段）
> 当前所有 Rank 在同一 Lagrangian 循环中处理。

---

## 三、数据流

```
input.gz（gzip 压缩的多节 CSV）
    │
    ▼ AllocationPipeline.run()
    │
    ├── [Stage 1] _parse_rule_config() → RuleConfig
    │            FTLCompiler.compile() → CompiledFTL
    │
    ├── [Stage 2] _parse_crews()       → list[Crew]
    │            （CREWS + QUALIFICATIONS + FTL_STATE + LOCKED_ASSIGNMENTS）
    │
    ├── [Stage 3] _parse_pairings()    → list[Pairing]
    │            （PAIRINGS + PAIRING_DUTIES + PAIRING_COMPOSITIONS）
    │
    ├── [Stage 4] build_eligibility()  → dict[crew_idx, list[pairing_idx]]
    │
    ├── [Stage 5] run_lagrangian()     → LagrangianResult
    │            时间预算：total_time × 0.60
    │
    ├── [Stage 6] recover_primal()     → list[Assignment]
    │
    └── [Stage 7] polish()             → list[Assignment]（精修后）
                 时间预算：remaining × 0.85
    │
    ▼ _make_output() → _determine_status()
    │
out.gz（RESULT_META + KPI + ASSIGNMENTS）
```

---

## 四、黑盒原则

| 原则 | 实现 |
|------|------|
| 无 HTTP 服务 | 纯 CLI 进程，无 FastAPI/Fastify |
| 无数据库连接 | 所有数据从 input.gz 读取 |
| 无 Redis 依赖 | 进度通过 stdout JSON Lines 上报 |
| 无状态 | 进程启动即运行，退出即完成 |
| 可取消 | SIGTERM → `_stop_requested=True` → 各阶段检查后优雅退出 |

---

## 五、时间预算分配

| 阶段 | 时间占比 | 说明 |
|------|---------|------|
| 解析 + 编译 | < 1% | 通常 < 1s |
| 预过滤 | < 1% | O(C×P) 线性扫描 |
| Lagrangian 主循环 | 60% | subgradient + 并行 DP |
| 原始恢复 | < 1% | 快速贪心，通常 < 1s |
| CP-SAT 精修 | 剩余 × 85% | Phase A + Phase B |
| 写出 | < 1% | gzip 压缩写文件 |

---

## 六、并行策略

| 层次 | 当前实现 | 规范设计 |
|------|---------|---------|
| 外层（engine-server） | 多个 ro-engine 进程（由 engine-server 管理） | ✓ |
| 内层 L1（Rank 级） | 未实现 [DEFERRED] | `multiprocessing.Pool` 多 Rank 并行 |
| 内层 L2（迭代内） | `ProcessPoolExecutor`（机组数 > 50 时启用） | ✓ |

---

## 七、规模背景

规范文档针对以下规模设计，当前实现算法正确性已验证，大规模性能受限于 Rank 级并行未实现：

| 维度 | 典型规模 | 当前状态 |
|------|---------|---------|
| 机组人数 | 5,000+（如 TG 乘务员） | 功能正确，性能待优化 |
| Pairing 数 | 3,000+ | 功能正确 |
| 决策变量空间 | ~1,500 万 | 依赖预过滤压缩 |
| 单轮迭代时间 | < 5 秒（5,000 机组并行） | 待实际验证 |
