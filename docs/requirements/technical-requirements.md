# ROIS-AI 技术需求文档

> 航空机组排班系统 — 技术架构与规范
> 版本：1.0 | 更新日期：2026-03-31

---

## 目录

1. [系统架构](#1-系统架构)
2. [技术栈](#2-技术栈)
3. [数据库设计](#3-数据库设计)
4. [模块间通信](#4-模块间通信)
5. [缓存策略](#5-缓存策略)
6. [前端架构](#6-前端架构)
7. [后端架构](#7-后端架构)
8. [法规引擎架构](#8-法规引擎架构)
9. [优化引擎架构](#9-优化引擎架构)
10. [安全架构](#10-安全架构)
11. [部署架构](#11-部署架构)
12. [编码规范](#12-编码规范)
13. [测试策略](#13-测试策略)
14. [数据分层设计](#14-数据分层设计)

---

## 1. 系统架构

### 1.1 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                     前端层 (Frontend)                     │
│  ┌──────────────┐    ┌──────────────┐   ┌─────────────┐ │
│  │ Live Gantt   │    │ PBS Web      │   │ PBS App     │ │
│  │ React 19     │    │ React 19     │   │ RN + Expo   │ │
│  │ :5566        │    │ :5174        │   │ Mobile      │ │
│  └──────┬───────┘    └──────┬───────┘   └──────┬──────┘ │
└─────────┼────────────────────┼──────────────────┼────────┘
          │                    │                  │
┌─────────┼────────────────────┼──────────────────┼────────┐
│         ▼       服务层 (Service)      ▼         ▼        │
│  ┌──────────────┐    ┌──────────────┐                    │
│  │ Live Server  │    │ PBS Server   │                    │
│  │ Fastify+TS   │    │ Fastify+TS   │                    │
│  │ :8899        │    │ :3002        │                    │
│  └──┬───────┬───┘    └──────┬───────┘                    │
│     │       │               │                            │
│     ▼       ▼               ▼                            │
│  ┌──────────────────────────────────┐                    │
│  │   Rule Engine (TS + Fastify)     │                    │
│  │   npm包 + HTTP :7789             │                    │
│  └──────────┬───────────────────────┘                    │
│             │                                            │
│  ┌──────────┼────────┐   ┌─────────────┐                │
│  │ PO Engine │        │   │ RO Engine   │                │
│  │ Python    │        │   │ Python      │                │
│  │ :8000     │        │   │ :8001       │                │
│  └───────────┘        │   └─────────────┘                │
└───────────────────────┼──────────────────────────────────┘
                        │
┌───────────────────────┼──────────────────────────────────┐
│                    数据层 (Data)                           │
│  ┌──────────────┐ ┌───────┐ ┌───────┐ ┌──────────────┐  │
│  │ PostgreSQL16 │ │ Redis │ │ Redis │ │   BullMQ     │  │
│  │ Schema隔离   │ │ :6379 │ │ :6380 │ │  任务队列    │  │
│  │ :5432       │ │ Live  │ │ PBS   │ │              │  │
│  └──────────────┘ └───────┘ └───────┘ └──────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 1.2 端口分配

| 服务 | 端口 | 说明 |
|------|------|------|
| Live Server | 8899 | 排班后端 API |
| Rule Engine HTTP | 7789 | 法规引擎 HTTP 服务 |
| PBS Server | 3002 | PBS 后端 |
| PO Engine | 8000 | 配对优化 |
| RO Engine | 8001 | 排班分配优化 |
| Gantt Frontend | 5566 | 排班前端 (Vite dev) |
| PBS Web | 5174 | PBS 前端 (Vite dev) |
| PostgreSQL | 5432 | 数据库 |
| Redis (Live) | 6379 | Live 缓存 |
| Redis (PBS) | 6380 | PBS 专用缓存 |

---

## 2. 技术栈

### 2.1 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19 | UI 框架 |
| Vite | 6 | 构建工具 |
| TypeScript | 5.7+ | 类型安全 |
| Zustand | 5 | 状态管理 |
| Canvas 2D | - | Gantt 甘特图自研渲染引擎 |
| @rois/ui | - | 共享组件库（shadcn/ui + Tailwind CSS） |
| Tailwind CSS | 4 | 原子化样式 |
| Radix UI | - | 无头组件（Dialog、Select、Tooltip 等） |
| date-fns | - | 日期处理 |
| Lucide React | - | 图标库 |
| axios | - | HTTP 请求 |
| React Hook Form + Zod | - | 表单校验（与后端共享 schema） |
| TanStack Table | - | 数据表格 |
| sonner | - | Toast 通知 |

### 2.2 后端（TypeScript）

| 技术 | 版本 | 用途 |
|------|------|------|
| Fastify | 5 | HTTP 框架 |
| TypeScript | 5.7+ | 类型安全 |
| Drizzle ORM | 0.38+ | 数据库 ORM |
| pg | 8 | PostgreSQL 驱动 |
| Redis | 4.7+ | 缓存客户端 |
| BullMQ | 5 | 任务队列 |
| Zod | 3 | 运行时数据校验 |
| dotenv | - | 环境变量 |

### 2.3 后端（Python）

| 技术 | 版本 | 用途 |
|------|------|------|
| Python | 3.12+ | 语言 |
| FastAPI | 0.115+ | HTTP 框架 |
| OR-Tools | 9.11+ | CP-SAT 约束求解 |
| numpy | 2.0+ | 数值计算 |
| Pydantic | 2.10+ | 数据模型 |
| pydantic-settings | 2.7+ | 配置管理 |
| httpx | 0.27+ | 异步 HTTP 调用 |

### 2.4 数据库与基础设施

| 技术 | 版本 | 用途 |
|------|------|------|
| PostgreSQL | 16 | 主数据库 |
| Redis | 7 | 缓存 |
| Docker + Docker Compose | - | 容器化部署 |
| Nginx | - | 反向代理 |

---

## 3. 数据库设计

### 3.1 多航司 Schema 隔离

- 每家航司 = 独立 PostgreSQL Schema（schema 名 = 航司二字码小写）
- 所有表在各 schema 下完全复制
- 通过 `search_path` 切换，SQL 中不带 schema 前缀
- 示例：`f8` schema、`tg` schema

### 3.2 表命名规范

- **全部小写** + 下划线（`snake_case`）
- 禁止大写、禁止双引号包裹
- 主键：`bigint GENERATED ALWAYS AS IDENTITY`
- `is_deleted`：**取消状态标记**（0=正常，1=已取消），不是软删除——删除操作执行真实 DELETE
- 审计字段（每张表必须有）：
  ```sql
  created_by varchar(30) NOT NULL DEFAULT 'system'
  created_at timestamptz NOT NULL DEFAULT now()
  updated_by varchar(30) NOT NULL DEFAULT 'system'
  updated_at timestamptz NOT NULL DEFAULT now()
  ```

### 3.3 表结构概览

| 分类 | 文件 | 表数 | 说明 |
|------|------|------|------|
| 基础数据 | 01-base_pg.sql | ~72 | 机场/机型/航线/法规/权限/字典/预警/标签 |
| 排班数据 | 02-crew_roster_pg.sql | ~32 | 机组/航班/配对/排班/场景/工时归档 |
| PBS 数据 | 03-pbs_pg.sql | ~12 | 竞标/分配/用户/审计 |
| **合计** | | **~116** | |

### 3.4 核心表设计

#### Pairing 双表设计

```
pairing（头表）: 1 行 = 1 个配对
  - pairing_days, total_segments, total_blh, avg_fdp ...

pairing_segment（宽表）: 1 行 = 1 个航段
  - duty 级字段冗余存储（duty_seq, duty_fdp, duty_start, duty_end）
  - 唯一约束: (pairing_id, duty_seq, seg_seq)
```

#### Roster 统一宽表

```
roster_flight: 1 行 = 1 个任务分配
  - pairing_id IS NOT NULL: 飞行任务（flt_id, duty_seq 有值）
  - pairing_id IS NULL:     地面任务（OFF, SL, SBY 等，无需关联配对）
  - 统一时间: sch_str_dt_utc / sch_end_dt_utc
```

#### Manday 三级归档

```
crew_manday_fd_daily   → 最近 N 月
crew_manday_fd_monthly → 之前至 M 年
crew_manday_fd_yearly  → 更早
参数化: MANDAY_DAILY_KEEP_MONTHS, MANDAY_MONTHLY_KEEP_YEARS
```

### 3.5 JSONB 使用场景

| 表 | 字段 | 用途 |
|----|------|------|
| rule_instance | params | 法规参数（FDP 查表、阈值等） |
| scenario | filter_params | 优化场景筛选参数（合并 31 个旧字段） |
| calc_result | calc_data | 多层计算结果（pairing/duty/rest/cumulative） |
| tag_definition | conditions | 标签匹配条件表达式 |

### 3.6 废弃表清单（不要创建）

- `system_parameter` → 用 `dictionary` 替代
- `schedule_*` 系列快照表 → 用 `.schedule.gz` 文件替代
- `*_export` 导出表 → 用 BullMQ 应用层事件替代

### 3.7 外键约束（FK RESTRICT）

核心业务表已在 DB 层建立外键约束，策略统一为 `ON DELETE RESTRICT`（禁止删除有子记录的父行）。

| 子表 | 外键字段 | 父表 | 说明 |
|------|---------|------|------|
| `pairing_segment` | `pairing_id` | `pairing` | 配对段必属于配对 |
| `pairing_segment` | `flt_id` | `flight` | 可为 NULL（地面段） |
| `pairing_composition` | `pairing_id` | `pairing` | 组成必属于配对 |
| `pairing_template_item` | `template_id` | `pairing_template` | 模板项必属于模板 |
| `roster_flight` | `pairing_id` | `pairing` | 可为 NULL（地面任务） |
| `roster_publish` | `pairing_id` | `pairing` | 弱引用，无 FK；可为 NULL（地面任务），也允许发布快照保留已被清理的 pairing_id |
| `flight_composition` | `flt_id` | `flight` | 编组必属于航班 |

**应用层配合规则：**
- 删除 `pairing` 前：先检查 `roster_flight.pairing_id` 是否有引用，有则 409 报错
- 删除 `flight` 前：先检查 `pairing_segment.flt_id` 和 `flight_composition.flt_id`，有则 409
- `pairing` 删除在一个事务中完成：DELETE compositions → DELETE segments → DELETE pairing
- `pairingId = 0`（旧哨兵值）已**废弃**，地面任务用 `pairingId = NULL` 表示

### 3.8 is_deleted 查询规范

`is_deleted` 列均带 `NOT NULL DEFAULT 0` 约束，但直接导入数据库的数据可能存在 NULL。所有涉及 `is_deleted` 的查询必须使用 `notDeleted()` 工具函数（`live-server/src/utils/db.ts`），等价于 `is_deleted = 0 OR is_deleted IS NULL`，防止直接导入数据不可见。

```typescript
// ✅ 正确
.where(and(notDeleted(flight.isDeleted), between(...)))

// ❌ 禁止
.where(and(eq(flight.isDeleted, 0), between(...)))
```

原生 SQL 中使用 `COALESCE(is_deleted, 0) = 0`。

### 3.9 航班数据加载策略

`GET /api/flight` 按日期范围**全量返回**，不分页。理由：
- Gantt Canvas 渲染需要完整数据集才能进行 bin-pack 排列
- 单次全量加载比多次翻页更简单可靠，且在日期范围内数据量可控
- 若未来单日航班超过 1 万条，再考虑按 `depArp` 分片加载

响应格式：`{ items: Flight[], total: number }`（无 `page`/`pageSize`/`totalPages`）。

---

## 4. 模块间通信

### 4.1 通信方式

| 调用方 | 被调用方 | 方式 | 说明 |
|--------|---------|------|------|
| Gantt → Live Server | HTTP REST | API 调用 |
| Live Server → Rule Engine | npm import | 零延迟，直接函数调用 |
| PBS Server → Rule Engine | npm import | 零延迟 |
| PO Engine → Rule Engine | HTTP REST | 一次性获取法规配置 |
| RO Engine → Rule Engine | HTTP REST | 一次性获取法规配置 |
| PO/RO → Live Server | HTTP REST | 获取航班/机组数据、回写结果 |
| Live Server → BullMQ | 消息队列 | 异步任务（归档、导出） |

### 4.2 API 响应统一格式

```json
// 成功
{ "code": 200, "data": T, "message": "ok" }
// 失败
{ "code": number, "data": null, "message": "error description" }
```

---

## 5. 缓存策略

### 5.1 Cache-Aside 模式

**写操作**：
1. 开启数据库事务
2. 执行写操作
3. 提交事务
4. 删除/更新 Redis 缓存
5. 缓存更新失败 → TTL 自动兜底

**读操作**：
1. 查询 Redis
2. 命中 → 返回
3. 未命中 → 查询数据库 → 写入 Redis（设 TTL）→ 返回

### 5.2 TTL 分类

| 数据类型 | TTL | 说明 |
|---------|-----|------|
| 基础数据（机场/机型/航线） | 24h | 低频变更，高频读取 |
| 机组信息 | 4h | 中频变更 |
| 排班数据（roster/pairing） | 10min | 高频变更，短 TTL |
| 法规配置 | 1h | 变更不频繁 |
| 用户会话 | 按 JWT 有效期 | 登出时删除 |

### 5.3 Redis 实例隔离

- **Redis :6379** — Live Server + Rule Engine 共用
- **Redis :6380** — PBS Server 独立使用

---

## 6. 前端架构

### 6.1 概览

- **渲染引擎**：Canvas 2D 虚拟化渲染 + RAF + dirty flag → 详见 [docs/modules/gantt/tech-canvas.md](../modules/gantt/tech-canvas.md)
- **状态管理**：Zustand（16 个 Store） → 详见 [docs/modules/gantt/tech-stores.md](../modules/gantt/tech-stores.md)
- **草稿模式**：本地操作日志 + Redis 锁 + WebSocket → 详见 [docs/modules/gantt/draft-mode.md](../modules/gantt/draft-mode.md)
- **法规检查**：批量 API + 增量检查 + 违规展示 → 详见 [docs/modules/gantt/rule-check.md](../modules/gantt/rule-check.md)
- **任务类型**：数据库驱动颜色 + 参数化 → 详见 [docs/modules/gantt/assignment-types.md](../modules/gantt/assignment-types.md)
- **缩放/时间轴**：连续 pxPerHour + 拖拽选区 + 月份跳转 → 详见 [docs/modules/gantt/theme-zoom.md](../modules/gantt/theme-zoom.md)

### 6.2 共享组件库 @rois/ui

- shadcn/ui + Radix UI，10 个基础组件
- 5 种配色主题 × light/dark，CSS 变量 `@theme` 注册
- i18n 支持（英/中）

### 6.3 样式规范

- Tailwind CSS 原子类，禁止硬编码颜色
- 工具栏统一 `h-7` 按钮 + `active:scale-95` + `transition-all duration-100`
- Canvas 颜色通过 `getGanttColors()` 读 CSS 变量
- 任务块颜色从 `assignment_group.color` 数据库字段读取

---

## 7. 后端架构

### 7.1 Live Server 目录结构

```
live-server/src/
├── config/      # 环境变量 + 数据库配置
├── plugins/     # Fastify 插件（database、redis）
├── models/      # Drizzle ORM schema（64 个文件，按领域分组）
├── services/    # 业务逻辑（26 个 service）
├── routes/      # API 路由（27 个 route 文件）
├── utils/       # 工具（cache、pagination、audit、response）
└── index.ts     # 入口
```

### 7.2 API 路由规划

| 前缀 | 覆盖实体 |
|------|---------|
| `/api/base/*` | airport, aircraft, fleet, base, rank, division, department, dictionary, assignment, composition |
| `/api/crew/*` | crew CRUD + 历史(rank/base/fleet/status/team) + 证件/执照/资质/语言 + 假期/备注/资历 |
| `/api/flight/*` | flight CRUD + 批量导入 |
| `/api/pairing/*` | pairing + segment + composition + memo + template + 从场景导入 |
| `/api/roster/*` | roster 甘特图视图 + CRUD + swap/move + 发布/变更 |
| `/api/scenario/*` | scenario CRUD + 状态流转 + KPI 对比 |

### 7.3 BullMQ 异步任务

- 排班归档（定时将 daily → monthly → yearly）
- 数据导出
- PO/RO 优化任务提交
- PBS 竞标分配
- Oracle 触发器全部废弃，改为应用层事件

---

## 8. 法规引擎架构

### 8.1 双模式设计

```
┌─────────────────────────────────────────┐
│          @rois/rule-engine (npm包)       │
│                                         │
│  RuleEngine.check(input) → EngineResult │
│                                         │
│  ┌─ Calculator Phase ─┐                │
│  │ FDP / FlightTime   │                │
│  │ DutyTime / Rest    │→ 中间结果      │
│  │ Fatigue            │                │
│  └────────────────────┘                │
│            ↓                           │
│  ┌─ Checker Phase ────┐                │
│  │ MaxFDP / MaxFT     │                │
│  │ MinRest / Duty     │→ pass/fail     │
│  │ Qualification      │                │
│  └────────────────────┘                │
└──────────────┬──────────────────────────┘
               │
    ┌──────────┼──────────┐
    │          │          │
  import    import     HTTP
    │          │          │
live-server  pbs-server  PO/RO engines
```

### 8.2 无状态设计

- 每次请求携带 `ruleGroupCode`（法规集代码）
- 引擎加载法规配置（内存缓存 1 小时 TTL）
- 无用户状态持久化，完全按 ruleGroupCode 隔离

### 8.3 策略模式

- 每个 rule_template.code 映射到一个具体 Calculator/Checker 类
- 注册表模式，新增规则只需：新建类 + 注册到 registry

### 8.4 计算结果缓存

- calc_result 表存储完整计算结果（JSONB 多层结构）
- 脏标记（is_dirty）+ 按需计算
- 数据变更 → 标记脏 → 下次查询时重算

---

## 9. 优化引擎架构

### 9.1 约束求解方式（非生成-检查）

```
1. 优化开始前：HTTP 调法规引擎获取配置（一次性）
2. constraints/ 模块将法规配置 → OR-Tools CP-SAT 约束
3. 求解器运行，法规已内嵌为约束
4. 输出结果 100% 合规，无需事后检查
```

### 9.2 法规→约束映射

| 法规类型 | OR-Tools 处理 | 举例 |
|---------|--------------|------|
| 硬约束 | `model.Add()` — 违反则无解 | 最大FDP、最小休息 |
| 软约束 | 目标函数惩罚项 | 偏好基地、均衡工时 |
| 计算类 | 变量和表达式 | 值勤期计算、工时累计 |

### 9.3 所有时间用分钟（整数）

OR-Tools CP-SAT 是整数规划求解器，所有时间使用分钟作为内部单位。

---

## 10. 安全架构

### 10.1 Live Server 认证

- 内部用户（排班员）认证方式待定
- 权限模型：Profile → User 多对多绑定
- 数据权限按 Base/Fleet 范围控制

### 10.2 PBS 认证

- 独立用户系统（pbs_user 表）
- RSA 加密密码传输
- bcrypt 哈希存储
- JWT Token + token_version 管理密码失效
- 失败登录计数 + 账户锁定
- 独立连接池（pgBouncer）+ 独立 Redis

### 10.3 依赖安全策略

航空数据高度敏感，所有依赖必须满足以下安全要求：

**许可证合规**

| 允许 | 禁止 |
|------|------|
| MIT, Apache-2.0, ISC, BSD | GPL, LGPL, AGPL, 私有许可 |

**包来源白名单**

仅允许以下可信发布者的包：

| 发布者 | 代表项目 |
|--------|---------|
| Meta | React, React DOM |
| Microsoft | TypeScript, Playwright |
| Fastify 团队 | fastify, @fastify/* |
| WorkOS / Radix | @radix-ui/* |
| Vite 生态 | vite, vitest, @vitejs/* |
| Drizzle 团队 | drizzle-orm, drizzle-kit |
| Redis Ltd | redis (node client) |
| 其他知名开源 | axios, zod, date-fns, lucide, sonner, tailwindcss, clsx |

**禁止引入的包类型**

- 遥测/分析 SDK（Sentry, Segment, Amplitude, PostHog, Datadog）
- 广告 SDK
- 来源不明的小包（GitHub star < 1000，无组织背书）

**漏洞管理**

| 级别 | 生产依赖 | 开发依赖 |
|------|---------|---------|
| Critical | 立即修复 | 24h 内修复 |
| High | 24h 内修复 | 1 周内修复 |
| Moderate | 1 周内修复 | 评估影响 |
| Low | 下个迭代修复 | 可接受 |

CI/CD 门禁：`npm audit --omit=dev --audit-level=moderate` 不通过则阻止部署。

### 10.4 数据安全

- 密码、密钥、Token 禁止明文存储或出现在代码中
- 数据库连接串、Redis 密码通过 `.env` 环境变量注入
- `.env` 文件在 `.gitignore` 中，禁止提交到 Git
- 前端禁止在 console.log 输出敏感数据（机组个人信息、排班详情）
- API baseURL 动态获取，禁止硬编码外部地址

### 10.5 网络安全

- 生产环境 CORS 使用白名单域名（禁止 `origin: '*'`）
- WebSocket 连接需要认证后才允许订阅
- 生产环境强制 HTTPS / WSS
- PostgreSQL 和 Redis 仅监听内网地址，禁止暴露公网端口

### 10.6 安全审查记录

| 日期 | 范围 | 结果 |
|------|------|------|
| 2026-04-02 | 全项目 npm 依赖 | 生产 0 漏洞，dev 4 moderate (esbuild via drizzle-kit) |

---

## 11. 部署架构

### 11.1 基础设施

- GCP VM（asia-southeast1-a）
- Docker + Docker Compose 容器化
- Nginx 反向代理

### 11.2 Docker Compose 服务

```yaml
services:
  postgres:    # PostgreSQL 16, :5432
  redis:       # Redis 7, :6379 (Live)
  redis-pbs:   # Redis 7, :6380 (PBS)
  # 应用服务在开发阶段本地运行，生产环境容器化
```

### 11.3 数据库初始化

```bash
./sql/init-airline.sh <airline_code>
# 创建 schema → 建表 → 种子数据 → 配置参数
```

---

## 12. 编码规范

### 12.1 TypeScript

| 项目 | 规范 |
|------|------|
| 文件名 | `kebab-case`（crew-service.ts） |
| 变量/函数 | `camelCase` |
| 类/接口/类型 | `PascalCase` |
| 常量 | `UPPER_SNAKE_CASE` |
| DB 字段映射 | `snake_case` |
| import 顺序 | Node.js 内置 → 第三方 → 项目内部 → 类型 |
| 函数风格 | 箭头函数优先 |
| 类型 | 所有参数和返回值必须有类型，禁止 `any` |
| 异步 | `async/await`，不用 `.then()` |
| 校验 | Zod 做运行时数据校验 |

### 12.2 Python

| 项目 | 规范 |
|------|------|
| 文件名/模块名 | `snake_case` |
| 变量/函数 | `snake_case` |
| 类 | `PascalCase` |
| 常量 | `UPPER_SNAKE_CASE` |
| 类型 | type hints 类型注解 |
| 数据模型 | Pydantic v2 |
| 配置 | pydantic-settings |

### 12.3 Git 规范

**提交格式**：
```
<type>: <简要描述>

<详细说明（可选）>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

**类型**：feat / fix / refactor / style / docs / chore / test

**分支策略**：
- `main`：主分支，保持可部署
- `feat/<module>/<feature>`：功能分支
- `fix/<module>/<description>`：修复分支

---

## 13. 测试策略

### 13.1 测试矩阵

| 模块 | 单元测试 | 集成测试 | E2E 测试 |
|------|---------|---------|---------|
| live-server | Vitest（service 逻辑） | Vitest（API + DB + 缓存一致性） | — |
| rule-engine | Vitest（法规计算、组合） | — | — |
| po-engine | pytest（算法、约束） | — | — |
| ro-engine | pytest（分配、约束） | — | — |
| pbs-server | Vitest（校验、权限） | Vitest（API + DB + 缓存 + 并发） | — |
| gantt | — | — | Playwright（UI 流程） |
| pbs-portal/app | — | — | Playwright（UI 流程） |

### 13.2 覆盖率目标

- 后端 ≥ 80%
- 集成测试 ≥ 70%
- 新功能必须附带测试

### 13.3 缓存一致性专项测试

每个涉及缓存的 service 必须包含：
- 写入 DB 后缓存应被清除
- 缓存未命中应回填 Redis 并设置 TTL
- DB 事务回滚后缓存不应被更新
- 缓存删除失败时 TTL 应兜底
- 并发读写一致性
- 批量更新清除所有相关 key

---

## 14. 数据分层设计

### 14.1 三层数据分离

```
Live Data（数据库）
├── 实时 roster/pairing/flight/manday 表
├── 无 scenario_id 字段
└── 始终可变

Schedule Snapshots（文件）
├── .schedule.gz 压缩快照（发布时生成）
├── 元数据在 schedule_publish_record 表
└── 只读，用于变更对比

Optimization Scenarios（文件）
├── .scenario.gz（优化引擎输出）
├── 元数据在 scenario 表
└── 支持多个并行场景
```

### 14.2 文件存储

- 快照文件：`.schedule.gz`，含 SHA-256 校验
- 场景文件：`.scenario.gz`，含 SHA-256 校验
- 发布类型：Normal / Emergency / Correction

### 14.3 禁止事项

- 不在 live 业务表中加 `scenario_id` 字段
- 不创建 `schedule_*` 系列历史快照表
- 不创建 `system_parameter` 表（用 dictionary 替代）
- Oracle 触发器全部废弃，改为 BullMQ 应用层事件
