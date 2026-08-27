# PO 配对优化引擎 — 设计总览

**版本**：2.0（架构重设计）  
**日期**：2026-04-16  
**状态**：设计中  
**作者**：yuan.zhu + Claude Sonnet 4.6

> **Current F8 scope:** `po-engine/` is temporarily retained legacy material and is not an active F8 delivery development target. Current F8 optimization work uses `pbs-engine/`; current legality work uses `rule-engine-rs/`.

---

## 一、定位与目标

PO（Pairing Optimizer）引擎是 ROIS-AI 排班系统的核心优化模块，负责将航班自动组成最优飞行配对（Pairing）。

### 1.1 业务价值

| 目标 | 说明 | KPI |
|------|------|-----|
| 规则合规 | 生成结果 100% 满足 CCAR-121 法规 | 违规率 = 0 |
| 成本优化 | 最小化空驶、值勤时间、配对数量 | 成本 vs. 手动基线 |
| 资源高效 | 最大化飞行时间利用率，均衡工时分布 | 利用率 ≥ 行业基准 |

### 1.2 行业现状

国际主流航班配对优化产品（SITA Altitude、Sabre AirCrews、Lufthansa Systems NetLine）均采用以下成熟架构：

```
航班网络图构建
    ↓
合规配对候选池生成（列枚举）
    ↓
集合分割 / 集合覆盖（整数规划）
    ↓
结果审核 + 回写
```

本次重设计对齐行业最佳实践，同时为 AI 演进预留完整接口。

### 1.3 重设计动因

| 现有问题 | 影响 | 解决方向 |
|---------|------|---------|
| CP-SAT 直接建模，变量数 O(n²) | 300+ 航班即超时 | 改为列生成 + 集合分割 |
| 同步 HTTP 接口，阻塞 5+ 分钟 | 前端无法响应 | 异步任务队列 |
| 无弹性伸缩，单进程 | 并发优化任务竞争 CPU | 无状态多 Worker |
| 规则硬编码在约束构建器中 | 新法规需改代码 | 可热更新规则编译器 |
| 无 AI 接口预留 | 后续 AI 引入成本高 | 设计时预留 ML 钩子 |

---

## 二、定位说明

**PO Engine 是一个纯文件黑盒计算进程**，不运行 HTTP 服务，不连接 Redis 或数据库。

```
Optimizer Manager（另一 Git 仓库）
    ↓ 写入 input.gz
PO Engine（本仓库）
    ↓ 读取 input.gz → 优化 → 写出 out.gz → exit
Optimizer Manager
    ↓ 读取 out.gz → 回写 Live Server
```

所有 HTTP API、生命周期管理、互斥锁、运行历史、结果对比、回写逻辑均由 Optimizer Manager 负责。
PO Engine 只负责：**给定 input.gz，生成 out.gz，然后退出**。

---

## 三、文档索引

| 文档 | 内容 | 目标读者 |
|------|------|---------|
| [architecture.md](./architecture.md) | 三层架构总览、引擎黑盒原则、完整生命周期时序 | 后端工程师、架构师 |
| [engine-interface.md](./engine-interface.md) | 引擎与 Optimizer Manager 的接口契约（CLI、退出码、进度协议） | 后端工程师 |
| [algorithm.md](./algorithm.md) | 列生成算法、集合分割、约束模型 | 算法工程师 |
| [constraint-compiler.md](./constraint-compiler.md) | Rule Engine JSON → Python 约束函数编译，含实现步骤 | 后端工程师 |
| [io-format.md](./io-format.md) | input.gz / out.gz 格式规范，多次运行存储结构，PO→RO 传递 | 全栈工程师 |
| [api-spec.md](./api-spec.md) | Optimizer Manager 对外的 HTTP API 规格（供参考） | 全栈工程师 |
| [ai-roadmap.md](./ai-roadmap.md) | AI 演进路线图（4 阶段） | 产品经理、技术负责人 |

---

## 三、核心设计原则

### 3.1 无状态 Worker 架构

```
┌─────────────┐    ┌──────────────┐    ┌─────────────────────┐
│ Live Server │───▶│  Redis Queue │◀───│  PO Worker × N      │
│ (触发优化)  │    │  (BullMQ)    │    │  (无状态 FastAPI)    │
└─────────────┘    └──────────────┘    └─────────────────────┘
                          │                      │
                          ▼                      ▼
                   ┌──────────────┐    ┌─────────────────────┐
                   │  Job Status  │    │  Rule Engine (HTTP) │
                   │  (Redis KV)  │    │  Flight Data (HTTP) │
                   └──────────────┘    └─────────────────────┘
```

- **无共享内存**：每个 Worker 独立，任务携带所有上下文
- **水平扩展**：增加 Worker 实例即可提升并发优化能力
- **故障隔离**：单 Worker 崩溃不影响其他任务

### 3.2 分阶段算法演进

```
Phase 1 (现在)     →    Phase 2 (6 月)    →    Phase 3 (12 月)
传统列生成 + MIP        ML 辅助暖启动           实时预测性规划
```

### 3.3 规则与算法解耦

规则引擎只负责提供规则配置，PO 引擎将规则**编译**为约束函数，在配对候选生成阶段直接剪枝，不在求解过程中频繁调用 HTTP。

---

## 四、模块边界

```
┌──────────────────────────────────────────┐
│              PO Engine (黑盒进程)           │
│                                           │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐ │
│  │   API   │  │ Optimizer │  │Services │ │
│  │ (入口)  │  │ (算法核心) │  │(外部调用)│ │
│  └─────────┘  └──────────┘  └─────────┘ │
│                                           │
│  ┌───────────────────────────────────┐   │
│  │         Constraint Compiler        │   │
│  │  (Rule Config → Python 约束函数)   │   │
│  └───────────────────────────────────┘   │
└──────────────────────────────────────────┘
         ↕ HTTP              ↕ HTTP
┌─────────────┐      ┌──────────────┐
│ Live Server │      │ Rule Engine  │
│  (数据源)   │      │  (规则配置)  │
└─────────────┘      └──────────────┘
```

---

## 五、性能目标

| 场景 | 目标 | 说明 |
|------|------|------|
| 单机型单基地（≤ 200 航班） | ≤ 2 分钟 | Phase 1 目标 |
| 全机队（≤ 500 航班） | ≤ 5 分钟 | 需列生成 |
| 多基地并发优化 | 支持 N 个独立任务同时运行 | 无状态 Worker |
| 结果质量 vs. 手动排班 | 成本降低 ≥ 8% | 配对数、死飞、值勤时间综合 |
