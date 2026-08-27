# ROIS-AI 技术架构方案

> 基于 Claude Code AI 辅助开发，TypeScript 全栈 + Python 优化引擎

---

## 系统架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        前端层                                        │
│  ┌──────────────┐              ┌──────────────────┐                 │
│  │ Live Gantt   │              │ PBS Web/App      │                 │
│  │ React + TS   │              │ React + TS       │                 │
│  └──────┬───────┘              └────────┬─────────┘                 │
└─────────┼──────────────────────────────────┼─────────────────────────┘
          │                                  │
┌─────────┼──────────────────────────────────┼─────────────────────────┐
│         ▼           服务层                  ▼                         │
│  ┌──────────────┐              ┌──────────────────┐                  │
│  │ Live Server  │◄────────────►│ PBS Server       │                  │
│  │ Node.js + TS │              │ Node.js + TS     │                  │
│  └──┬───────┬───┘              └────────┬─────────┘                  │
│     │       │                           │                            │
│     ▼       ▼                           ▼                            │
│  ┌──────────────────┐    ┌──────────────────────────────┐            │
│  │ Connector Server │    │    Rule Engine（法规引擎）    │            │
│  │ 外部系统对接 3004 │    │    Node.js + TS（独立服务）   │            │
│  └──┬───────────────┘    └──────────────┬───────────────┘            │
│     │                                  │                             │
│     │  BullMQ 队列                      │                             │
│     ▼                                  ▼                             │
│  ┌─────────────┐              ┌─────────────┐                        │
│  │ 外部航司系统 │              │ PO Engine   │                        │
│  │ API/推送     │────┘─────────│ RO Engine   │                        │
│  └─────────────┘              │ Python      │                        │
│                               └─────────────┘                        │
└───────────────────────────────────────────────────────────────────────┘
          │
┌─────────┼────────────────────────────────────────────────────────────┐
│         ▼           数据层                                            │
│  ┌──────────────┐  ┌───────┐  ┌────────────────────┐                 │
│  │ PostgreSQL   │  │ Redis │  │ BullMQ（任务队列）  │                 │
│  │ Schema隔离   │  │ 缓存   │  │                    │                 │
│  └──────────────┘  └───────┘  └────────────────────┘                 │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 各端技术推荐

### 1. Live Server（实时排班服务）

| 项目 | 推荐 | 理由 |
|------|------|------|
| 运行时 | Node.js + TypeScript | AI 生成质量高，你可跟学 |
| 框架 | **Fastify** | 性能优于 Express，插件生态成熟，类型支持好 |
| ORM | **Drizzle ORM** | 类型安全，SQL-like 写法适合你的 SQL 背景 |
| 缓存 | Redis 7 | 排班数据热缓存、用户会话 |
| 队列 | BullMQ | 异步任务（归档、导出、通知） |

### 2. Live Gantt（排班前端）

| 项目 | 推荐 | 理由 |
|------|------|------|
| 框架 | **React 19 + TypeScript** | 复杂交互场景 React 生态最强 |
| 构建 | Vite | 快速开发体验 |
| 状态管理 | Zustand | 轻量，适合排班数据的复杂状态 |
| Gantt 渲染 | Canvas/自研 | 航空排班的 Gantt 需求很特殊，现成组件难满足 |
| 法规隔离 | 每用户独立法规上下文 | 前端传 `ruleSetId`，法规引擎按用户维护独立实例 |

### 3. Rule Engine（法规引擎）— 独立微服务

| 项目 | 推荐 | 理由 |
|------|------|------|
| 语言 | **TypeScript** | 与主服务统一，便于维护 |
| 框架 | Fastify | 独立部署，通过 HTTP/gRPC 被各端调用 |
| 设计模式 | 规则链 + 策略模式 | 每条法规独立实现，可灵活组合 |
| 法规集合 | 配置化 | 每个调用方（Gantt用户/PO/RO/PBS）绑定独立法规集 |
| 隔离方式 | **实例级隔离** | 每个用户请求携带 ruleSetId，引擎内部按 ruleSetId 缓存法规配置，计算过程无状态互不影响 |

### 4 & 5. PO/RO 优化引擎 — **推荐 Python**

| 项目 | 推荐 | 理由 |
|------|------|------|
| 语言 | **Python** | 优化/AI/ML 生态无可替代 |
| 优化求解 | **Google OR-Tools** | 开源成熟，专为排班/路径优化设计 |
| AI 能力 | Claude API / LLM | 参数调优、历史数据学习、智能推荐 |
| 通信 | REST API + BullMQ | Live Server 提交优化任务，异步返回结果 |
| 部署 | 独立容器 | CPU 密集计算，与其他服务隔离 |

**为什么 PO/RO 用 Python 而不是 TypeScript：**
- OR-Tools、scipy、numpy 等优化库只在 Python 生态成熟
- 机器学习（历史数据学习）需要 scikit-learn、PyTorch 等
- Claude 生成 Python 优化代码的质量同样极高

### 6. PBS（机组申请系统）— 独立部署

| 项目 | 推荐 | 理由 |
|------|------|------|
| 前端 | React + TypeScript | 与 Gantt 统一技术栈，组件可复用 |
| 后端 | **Fastify + TypeScript** | 独立服务，与 Live Server 完全解耦 |
| 数据库 | **独立 PostgreSQL 连接池** | 不与 Live Server 争抢连接 |
| 缓存 | 独立 Redis 实例 | 5000 人并发，session 和热数据需隔离 |
| 认证 | JWT + bcrypt | 独立用户体系，与内部 users 分开 |

**5000 并发性能方案：**
- PBS Server 水平扩展（2-4 实例 + Nginx 负载均衡）
- Redis 缓存高频查询（排班周期、班表数据）
- PostgreSQL 连接池（pgBouncer）
- 静态资源 CDN
- 申请提交走队列削峰（BullMQ）

### 7. Connector Server（外部系统对接服务）— 独立部署

| 项目 | 推荐 | 理由 |
|------|------|------|
| 语言 | **TypeScript** | 与主服务统一，便于维护 |
| 框架 | Fastify | 独立部署，通过 BullMQ 与 live-server 解耦 |
| 数据库 | PostgreSQL（复用 rois 库） | 连接器配置和执行日志存储 |
| 缓存 | Redis | 连接器配置缓存、OAuth Token 缓存 |
| 队列 | BullMQ | 入向数据队列、出向推送队列 |

**核心功能：**
- 入向数据接收（航班、机组）：推送/轮询两种协议
- 出向数据发布（排班）：推送/查询两种协议
- 安全认证：API Key + HMAC 签名，OAuth 2.0 Client Credentials
- 数据转换：Transform 插件处理各航司格式差异

---

## 技术选型汇总

| 端 | 语言 | 框架 | 独立部署 | 端口 |
|----|------|------|---------|------|
| Live Server | TypeScript | Fastify + Drizzle | 是 | 3000 |
| Live Gantt | TypeScript | React 19 + Vite | 是 | 5173 |
| Rule Engine | TypeScript | Fastify | 是（微服务） | 3001 |
| PO Engine | Python | OR-Tools + FastAPI | 是 | 无常驻端口 |
| RO Engine | Python | OR-Tools + FastAPI | 是 | 无常驻端口 |
| Engine Server | Python | FastAPI | 是 | 3003 |
| PBS Server | TypeScript | Fastify + Drizzle | 是（独立实例） | 3002 |
| PBS Web | TypeScript | React + Vite + shadcn/ui | 是 | 5174 |
| PBS App | TypeScript | React Native + Expo + NativeWind | 是 | - |
| Connector Server | TypeScript | Fastify + Drizzle | 是 | 3004 |
| Grafana | - | Docker | 是（监控服务器） | 3001 |
| Prometheus | - | Docker | 是（监控服务器） | 9090 |
| Loki | - | Docker | 是（监控服务器） | 3100 |
| Windmill | - | Docker | 是（监控服务器） | 8000 |

## 基础设施

| 组件 | 技术 | 说明 |
|------|------|------|
| 数据库 | PostgreSQL 16 | Schema 隔离（每航司一个 schema） |
| 缓存 | Redis 7 | Live 和 PBS 各自独立实例 |
| 消息队列 | BullMQ | 异步任务、优化任务调度 |
| 监控日志 | Grafana + Prometheus + Loki | 日志采集、指标监控、告警 |
| 定时任务 | Windmill | Web UI配置，TS/Python脚本 |
| 部署 | Docker + Docker Compose | 全容器化 |

---

## 监控系统架构

详见 [监控系统架构文档](../modules/monitoring/README.md)。

```
┌─────────────────────────────────────────────────────────┐
│              监控服务器（独立部署）                        │
│  ┌──────────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Prometheus  │  │  Loki    │  │    Windmill      │  │
│  │  指标存储     │  │  日志存储 │  │   定时任务调度    │  │
│  └───────┬──────┘  └────┬─────┘  └──────────────────┘  │
│          │              │                               │
│  ┌───────▼──────────────▼──────────────────────────┐   │
│  │               Grafana :3001                     │   │
│  │         （日志 + 指标 + 告警 统一仪表盘）           │   │
│  └────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘

应用服务器每台运行：
  - Promtail（日志采集 → Loki）
  - Node Exporter（系统指标 → Prometheus）
  - prom-client /metrics（应用指标 → Prometheus）
```

---

## 核心设计原则

1. **微服务解耦**：各端独立部署，互不影响
2. **法规引擎共享**：统一法规服务，被 Gantt/PO/RO/PBS 多端调用
3. **PBS 性能隔离**：独立数据库连接池、独立 Redis，支撑 5000 并发
4. **AI 原生**：PO/RO 引擎支持 LLM 参数调优和历史数据学习
5. **TypeScript 为主**：业务服务统一语言，降低维护成本；Python 仅用于优化引擎
6. **外部系统解耦**：connector-server 通过 BullMQ 与 live-server 异步通信，避免直接写库
7. **全链路监控**：Prometheus 指标 + Loki 日志 + Grafana 可视化，所有服务暴露 `/metrics` 端点
8. **定时任务托管**：Windmill 统一管理业务定时任务，支持 Web UI 配置和执行历史追溯

---

## 相关文档

- [部署实施指南](../deployment/deployment-guide.md) — 生产环境部署完整流程
- [监控系统架构](../modules/monitoring/README.md) — 监控堆栈详细设计
- [功能需求文档](../requirements/functional-requirements.md) — 业务功能需求清单
- [开发计划](../plans/development-plan.md) — 分阶段开发计划
