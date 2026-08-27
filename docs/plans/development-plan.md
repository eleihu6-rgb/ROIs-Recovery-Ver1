# ROIS-AI 开发计划

> 1人 + 多Agent并行模式 | 预计 12-16周 | 起始日期: 2026-03-24

## 阶段总览

| 阶段 | 内容 | 周期 | 可并行度 |
|------|------|------|----------|
| P0 | 基础设施 & 数据层 | 1.5周 | 高 |
| P1 | 核心后端（live-server + rule-engine） | 3-4周 | 中 |
| P2 | 排班前端（gantt） | 2-3周 | 与P3并行 |
| P3 | 优化引擎（PO + RO） | 3-4周 | 与P2并行 |
| P4 | PBS 系统（server + web + app） | 3-4周 | 内部可并行 |
| P5 | 集成联调 & E2E | 2周 | 低 |

## 时间线

```
Week:  1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16
P0:   ████████
P1a:       ████████████
P1b:           ████████████
P2:                    ████████████████
P3:                    ████████████████████
P4:                                ████████████████████
P5:                                                ████████████
```

---

## P0：基础设施 & 数据层（1.5周）

目标：让所有模块有数据可用、有基础可依赖

| 任务 | 说明 | Agent并行 |
|------|------|-----------|
| seed 脚本 | dictionary、rule_template、rank、assignment 等基础数据 | Agent A |
| @rois/ui 搭建 | shadcn + Tailwind 组件库初始化，基础组件 | Agent B |
| Drizzle schema 生成 | 从 SQL 建表脚本生成 live-server 的 Drizzle ORM 模型 | Agent C |
| Docker Compose | PostgreSQL + Redis + 各服务编排 | Agent D |

交付物：`sql/seed/` 完整、`packages/ui` 可用、Drizzle models 就绪、一键启动环境

---

## P1：核心后端（3-4周）

依赖：P0 完成

### P1a：live-server CRUD（2周）

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 基础数据 API | airport/aircraft/fleet/base/rank CRUD | 高 |
| 机组管理 API | crew + 资质/证照/基地/rank 历史 | 高 |
| 航班管理 API | flight + flight_composition | 高 |
| Pairing API | pairing + pairing_segment 读写 | 高 |
| Roster API | roster_flight 读写 + 发布流程 | 高 |
| 缓存层 | Redis cache-aside 模式接入 | 中 |
| BullMQ 任务队列 | 异步任务框架（归档、导出） | 中 |
| 权限系统 | users/profile/menu 鉴权中间件 | 中 |

Agent策略：按领域拆分，2-3个Agent并行写不同 service/route

### P1b：rule-engine 实现（2周，与P1a后半段并行）

| 任务 | 说明 |
|------|------|
| 核心框架 | rule loader + 两阶段执行（calc → check） |
| 计算类规则 | FDP计算、飞行时间累计、值勤时间 |
| 检查类规则 | 最大FDP、最小休息、连续值勤天数 |
| npm包导出 | @rois/rule-engine 包，live-server 直接 import |
| HTTP服务 | Fastify 包装，供 PO/RO 调用 |

交付物：live-server 全部 CRUD API、rule-engine 核心法规可运行

---

## P2：排班前端 gantt（2-3周）

依赖：P1a（API 就绪）

| 任务 | 说明 | Agent并行 |
|------|------|-----------|
| 甘特图核心 | Canvas 渲染引擎、时间轴、crew行 | Agent A |
| 数据层 | Zustand store + API 对接 + WebSocket 实时 | Agent B |
| 交互操作 | 拖拽排班、右键菜单、任务编辑弹窗 | Agent A |
| 查询过滤 | 标签筛选、crew 搜索、高级查询 | Agent B |
| 法规校验展示 | 实时调用 rule-engine 显示违规 | Agent A |

---

## P3：优化引擎（3-4周，与P2并行）

依赖：P1b（rule-engine HTTP 服务就绪）

| 任务 | 说明 | Agent并行 |
|------|------|-----------|
| PO 引擎骨架 | FastAPI + OR-Tools 环境搭建 | Agent A |
| PO 约束建模 | CCAR-121 转 CP-SAT 约束 | Agent A |
| PO 求解 + 结果 | pairing 生成 + scenario 管理 | Agent A |
| RO 引擎骨架 | FastAPI 搭建 + crew 数据对接 | Agent B |
| RO 分配算法 | crew-pairing 匹配 + 资质约束 | Agent B |
| RO 公平性优化 | 工时均衡、偏好权重 | Agent B |
| BullMQ 集成 | 异步任务提交 + 进度回调 | 共用 |

Agent策略：PO 和 RO 完全独立，两个 Agent 全程并行

---

## P4：PBS 系统（3-4周）

依赖：P1（live-server + rule-engine）

| 任务 | 说明 | Agent并行 |
|------|------|-----------|
| pbs-server | 用户认证(JWT/bcrypt) + 竞标 CRUD + 分配算法 | Agent A |
| pbs-portal | React 竞标界面、层级偏好编辑器、结果查看 | Agent B |
| pbs-app | React Native Expo 移动端（复用 pbs-portal 逻辑） | Agent C |

Agent策略：server/web/app 三路并行，共享 Zod schema 验证

---

## P5：集成联调 & E2E（2周）

| 任务 | 说明 |
|------|------|
| 全链路测试 | gantt → live-server → rule-engine → PO/RO 完整流程 |
| PBS 端到端 | 开标 → 竞标 → 分配 → 发布 |
| Playwright E2E | gantt + pbs-portal 关键路径回归 |
| 性能调优 | 缓存命中率、N+1 查询、大数据量场景 |
| 部署脚本 | Docker 生产配置 + init-airline.sh 验证 |

---

## 多Agent并行策略

| 阶段 | 推荐同时Agent数 | 说明 |
|------|-----------------|------|
| P0 | 3-4 | 任务间几乎无依赖，最大化并行 |
| P1 | 2-3 | 按领域拆分（crew/flight/pairing 各一个Agent） |
| P2+P3 | 3 | gantt 1个 + PO 1个 + RO 1个 |
| P4 | 3 | server/web/app 各一个 |
| P5 | 1-2 | 联调需要串行思考，Agent辅助写测试 |

---

## 多Agent工作模式

### 方式一：多终端窗口（最简单，推荐）

直接开多个终端，每个终端启动一个 `claude` 实例，各自负责不同模块：

```bash
# 终端1 — 负责 seed 脚本
cd ~/rois-ai && claude

# 终端2 — 负责 @rois/ui
cd ~/rois-ai && claude

# 终端3 — 负责 Drizzle schema
cd ~/rois-ai && claude
```

### 方式二：tmux 多窗格

```bash
# 创建会话
tmux new-session -s agents
# Ctrl+B %  水平分割
# Ctrl+B "  垂直分割
# 每个窗格启动 claude
```

推荐布局示例（P0 阶段）：

```
┌─────────────────────┬─────────────────────┐
│  Agent A: sql/seed  │  Agent B: packages/ui│
├─────────────────────┼─────────────────────┤
│  Agent C: drizzle   │  Agent D: docker    │
└─────────────────────┴─────────────────────┘
```

### 方式三：`--print` 非交互模式（适合一次性批量任务）

```bash
# 一次性任务，不进入交互
claude --print "在 sql/seed/ 下创建 01-dictionary.sql 基础数据脚本"
```

### 方式四：Headless 后台模式（适合长任务）

```bash
# 后台执行，输出到文件
claude --print "为 live-server 生成所有 Drizzle schema" > output.log 2>&1 &
```

### 多Agent协作原则

1. **按目录隔离** — 避免两个 Agent 同时修改同一个文件
2. **明确上下文** — 每个 Agent 启动时给出明确职责（"你负责 xxx 模块"）
3. **共享类型先行** — 公共的类型定义、Zod schema 先由一个 Agent 完成，其他 Agent 再依赖
4. **定期同步** — 完成一个阶段后 git commit，其他 Agent 拉取最新代码再继续
5. **冲突预防** — 提前约定公共文件（package.json、tsconfig 等）的修改权归属

### 各阶段Agent分配

| 阶段 | Agent数 | 分工 |
|------|---------|------|
| P0 | 3-4 | A: seed脚本, B: @rois/ui, C: Drizzle schema, D: Docker |
| P1 | 2-3 | A: crew/flight API, B: pairing/roster API, C: rule-engine |
| P2+P3 | 3 | A: gantt前端, B: PO引擎, C: RO引擎 |
| P4 | 3 | A: pbs-server, B: pbs-portal, C: pbs-app |
| P5 | 1-2 | A: 全链路联调, B: E2E测试编写 |

---

## 关键风险点

1. **PO/RO 算法复杂度** — OR-Tools 约束建模可能需要反复调优，预留缓冲
2. **甘特图 Canvas 性能** — 大量 crew 渲染需要虚拟化，早期验证
3. **法规完整性** — CCAR-121 条款多，建议先实现核心 10-15 条，迭代补全
4. **PBS 分配公平性** — 5000人并发竞标的分配算法需要充分测试
