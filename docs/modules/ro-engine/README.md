# RO 排班分配优化引擎 — 设计总览

**版本**：1.0  
**日期**：2026-04-18  
**状态**：核心算法已实现，部分规范功能已推迟（见 spec-gaps.md）  
**规范文档**：`docs/superpowers/specs/2026-04-17-ro-engine-design.md`  
**作者**：yuan.zhu + Claude Sonnet 4.6

> **Current F8 scope:** `ro-engine/` is temporarily retained legacy/baseline material and is not an active F8 delivery development target. Current F8 optimization work uses `pbs-engine/`; current legality work uses `rule-engine-rs/`.

---

## 一、定位与目标

RO（Roster Optimizer）引擎是 ROIS-AI 排班系统的第二优化阶段，负责将 PO 引擎生成的飞行配对（Pairing）分配给合适的机组员。

### 1.1 规模要求

规范文档针对如下规模设计：

| 维度 | 典型规模 |
|------|---------|
| 机组人数 | 5,000+（如 TG 乘务员） |
| Pairing 数 | 3,000+ |
| 决策变量空间 | 最大 ~1,500 万个二值变量 |

当前版本算法正确性已验证，大规模性能依赖 Rank 级并行分解（见 spec-gaps.md）。

### 1.2 业务价值

| 目标 | 说明 | KPI |
|------|------|-----|
| 规则合规 | 所有分配结果 100% 满足 FTL 限制 | 违规率 = 0 |
| 公平分配 | 机组工时均衡，基地偏好满足 | 工时标准差 ≤ 行业基准 |
| 高覆盖率 | 尽量覆盖所有配对的用人需求 | 覆盖率 ≥ 95% |

### 1.3 与 PO 引擎的关系

```
PO Engine（配对优化）         RO Engine（分配优化）
    ↓ out.gz（配对池）              ↓ out.gz（分配方案）
    航班 → 配对                    配对 → 机组分配
    集合分割 / MIP                  Lagrangian 松弛 + DP
```

### 1.4 黑盒设计

**RO Engine 是纯文件黑盒计算进程**，不运行 HTTP 服务，不连接 Redis 或数据库。

```
Optimizer Manager（engine-server）
    ↓ 写入 input.gz
RO Engine（本仓库）
    ↓ 读取 input.gz → 优化 → 写出 out.gz → exit
Optimizer Manager
    ↓ 读取 out.gz → 回写 Live Server
```

---

## 二、文档索引

| 文档 | 内容 | 目标读者 |
|------|------|---------|
| [architecture.md](./architecture.md) | 整体架构、数据流、模块边界 | 后端工程师、架构师 |
| [algorithm.md](./algorithm.md) | Lagrangian 松弛 + 每机组 DP + 原始恢复 + CP-SAT 精修 | 算法工程师 |
| [constraint-compiler.md](./constraint-compiler.md) | RuleConfig → CompiledFTL 编译过程 | 后端工程师 |
| [io-format.md](./io-format.md) | input.gz / out.gz 节格式规范 | 全栈工程师 |
| [engine-interface.md](./engine-interface.md) | CLI 接口、退出码、进度协议 | 后端工程师 |
| [spec-gaps.md](./spec-gaps.md) | 规范中已设计但当前版本尚未实现的功能清单 | 开发者 |

---

## 三、核心设计原则

### 3.1 两阶段松弛 + 精修

```
Lagrangian 松弛（60% 时间预算）
    ↓  subgradient 迭代 → 每机组 DP 并行求解
原始恢复（快速）
    ↓  优先级取整 + 贪心补充
CP-SAT 精修（剩余 85% 时间）
    ↓  Phase A: FTL 违规修复
       Phase B: LNS 公平性改进
最终分配方案
```

### 3.2 资质驱动的预过滤

Lagrangian 迭代之前，先通过 7 条消除规则将 O(C×P) 的候选空间压缩 60-80%，大幅减少 DP 计算量。

### 3.3 FTL 约束内嵌 DP

FTL 约束不通过 HTTP 调用法规引擎校验，而是预先编译为 `CompiledFTL` 参数对象，直接嵌入每机组 DP 的状态转移中，确保 100% 合规同时避免网络开销。

---

## 四、性能目标

| 场景 | 目标 | 说明 |
|------|------|------|
| 小型（≤ 50 机组，≤ 100 配对） | ≤ 30 秒 | 序列 DP |
| 中型（≤ 200 机组，≤ 500 配对） | ≤ 5 分钟 | 并行 DP |
| 大型（≤ 1000 机组，≤ 2000 配对） | ≤ 15 分钟 | 并行 DP + LNS |
| 覆盖率目标 | ≥ 95% | 中型以上场景 |
