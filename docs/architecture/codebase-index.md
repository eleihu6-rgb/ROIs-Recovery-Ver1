# 代码归属索引（Codebase Index）— 核心排班表

> 把"哪个表 → 哪段代码"映射出来，是 `data-model.md`（数据关系）的**代码侧对应物**。
>
> 想改/查某张核心表的逻辑时，先在这里找入口文件，不要从零 grep。**所有路径已核对存在（2026-06-12，逐条 `test -f` 验证）。** 路径相对仓库根。
>
> 覆盖范围：
> - §1–5：5 张核心排班表（`flight` / `pairing` / `pairing_segment` / `roster_flight` / `crew`）在 **live-server** 的归属。
> - §6 **scenario** 域（场景元数据 + .gz 快照 + KPI）。
> - §7 **rule-engine** 域（法规检查如何消费排班数据 + 规则配置表）。
> - §8 **pbs-server** 域（pbs_* 表 + 对核心表的只读跨域访问）。
>
> 数据关系与陷阱见 [`data-model.md`](./data-model.md)。

> **Current F8 Engine Scope:** optimization runs through `pbs-engine/`; legality runs through `rule-engine-rs/`. `ro-engine/` and `po-engine/` are temporarily retained legacy modules and baseline/reference material, not active F8 delivery development targets. `crewrule-dev/` is legacy C++ reference material for Rust rule ports. `ai-server/` is retained for future workflows but is outside the current F8 delivery scope.

---

## live-server/src 目录约定

```
live-server/src/
├── models/     # Drizzle 表定义（pgTable），按领域分子目录
├── services/   # 业务逻辑 + 数据访问（查询/事务/缓存都在这里，本项目无独立 repository 层）
├── routes/     # Fastify 路由处理器（HTTP 端点）
└── utils/      # 缓存、审计、分页、组合填充等公共工具
```

> 注意：本项目**没有单独的 repository 层**——Drizzle 查询直接写在 `services/` 里。所以"数据访问"和"业务逻辑"都看 service 文件。

---

## 1. `flight` 航班主表

| 层 | 文件 | 说明 |
|---|---|---|
| Schema | `live-server/src/models/flight/flight.ts` | pgTable，70+ 字段（fltDt/fltNum/depArp/arvArp/schDepDtUtc/fleet/fltSts…） |
| Service | `live-server/src/services/flight/flight-service.ts` | `listGrouped()` 分页、`naviCounts()`、`getCompositions()`、`getById()` + 增删改 |
| Routes | `live-server/src/routes/flight/flight.ts` | `GET /api/flight`、`/navi-counts`、`POST /compositions`、`GET /:id`、`GET /:id/crew`、`GET /:id/pairings`、CRUD + `/batch` |

`GET /api/flight/:id/crew` 和 `/:id/pairings` 是"从航班反查机组/环"的入口——正因为 `flight` 不直连 crew/pairing，这两个端点在服务端做 join。

---

## 2. `pairing` 环头表

| 层 | 文件 | 说明 |
|---|---|---|
| Schema | `live-server/src/models/pairing/pairing.ts` | pgTable，45+ 字段（pairingLabel/division/base/fleet/dutyCount/segCount/tafb…） |
| Service | `live-server/src/services/pairing/pairing-service.ts` | `list()`/`getById()`/`create/update/remove`/`swap`/`move`/`getCrewDetail()`/`getCoverageStats()`；批量取 compositions+segments+crew |
| Service | `live-server/src/services/pairing/pairing-duty-node-service.ts` | duty 级 brief/debrief 时间维护 |
| Routes | `live-server/src/routes/pairing/pairing.ts` | `GET /api/pairing`、`/:id`、`/:id/crew`、`/:id/crew-detail`、`create-from-flights`、`/:id/segment`、`/:id/composition`、`/:id/memo`、`import-from-scenario` 等 |

---

## 3. `pairing_segment` 环行宽表（1 行 = 1 航段）

| 层 | 文件 | 说明 |
|---|---|---|
| Schema | `live-server/src/models/pairing/pairing-segment.ts` | pgTable，125+ 字段；duty 级信息内嵌（dutySeq/dutyStrArp/brief-debrief mins）、首/次签到签退、航段航班信息（fltId/fltNum/depArp/arvArp/fleetSeg） |
| Service | `live-server/src/services/pairing/pairing-service.ts` | 取 pairing 详情时批量查 segment（`WHERE pairingId = ?`） |
| Service | `live-server/src/services/roster/roster-service.ts` | **核心 JOIN**：roster_flight LEFT JOIN pairing_segment ON (pairingId,dutySeq,segSeq) 给 gantt 补 duty 级时间 |
| Routes | 经 `pairing.ts` 的 `POST /api/pairing/:id/segment`；segment 也随 `GET /:id` 详情返回 | |

关系：`pairing_segment.pairingId → pairing.id`（FK `fk_ps_pairing`）、`pairing_segment.fltId → flight.id`（FK `fk_ps_flight`）。

---

## 4. `roster_flight` 排班宽表（1 行 = 机组 × 航段）

| 层 | 文件 | 说明 |
|---|---|---|
| Schema | `live-server/src/models/roster/roster-flight.ts` | pgTable；crewId/pairingId/liveId/fltId/dutySeq/segSeq/flightActingRank/rosterActingRank/起降时间/积分津贴/培训课程字段 |
| Service | `live-server/src/services/roster/roster-service.ts` | **主**：`getView()`（按 crew×日期分块缓存）、CRUD、`swap`/`move`/`swapWithPairing`/`assignPairing`/`assignFlight`/`createGroundTask`/`deletePairingCrew`/`bulkUpdate`/`undoDelete` |
| Service | `live-server/src/services/roster/roster-publish-service.ts` | 排班发布（写 roster_flight） |
| Service | `live-server/src/services/pairing/pairing-service.ts` | 取 roster_flight 拼某环的机组列表（LEFT JOIN crew 取名字） |
| Routes | `live-server/src/routes/roster/roster.ts` | `GET /api/roster`（gantt 数据）、`/:id`、CRUD、`swap`、`move`、`assign-pairing`、`assign-flight`、`create-ground-task`、`pairing/:pairingId/crew/:crewId/delete` |
| Routes | `live-server/src/routes/roster/roster-pairings-by-crew.ts` | 按机组反查其环 |
| Routes | `live-server/src/routes/roster/roster-publish.ts` / `roster-violations.ts` / `roster-event-routes.ts` | 发布 / 违规 / 事件 |

`roster-service.ts` 是整个"机组×航班执行级"逻辑的中心；改派班/换班/地面任务都从这里走。

---

## 5. `crew` 机组主表

| 层 | 文件 | 说明 |
|---|---|---|
| Schema | `live-server/src/models/crew/crew.ts` | pgTable，47 字段；crewId（唯一）/姓名/division/职级 grade/status/资历… |
| Service | `live-server/src/services/crew/crew-service.ts` | `list()` 分页过滤、`getById()`/`getDetail()`/`listHistorical()` + CRUD；slim 模式（gantt-panel）只返回当前生效的 rank/base/fleet |
| Service | `crew-rank-service.ts` / `crew-base-service.ts` / `crew-fleet-service.ts` | 职级 / 基地 / 机队**历史**维护（Base 来自 `crew_base`，不是 roster_flight.base） |
| Service | `crew-status-service.ts` / `crew-stats-service.ts` | 状态 / 统计 |
| Routes | `live-server/src/routes/crew/crew.ts` | `GET /api/crew`（分页 + 全局过滤 OR 组）、`/:id`、`/:id/detail`、CRUD、`/:crewId/kpi-adjust` |
| Routes | `crew-credential.ts` / `crew-history.ts` / `crew-other.ts` / `crew-quals-batch.ts` / `crew-stats.ts` | 证件 / 历史 / 其他 / 资质批量 / 统计 |

---

## 跨表装配（最高价值的 JOIN 入口）

这些是把 data-model.md 里"crew↔flight 间接关系"真正拼起来的地方：

| 场景 | 端点 / 方法 | JOIN 链 |
|---|---|---|
| **Gantt 排班视图** | `GET /api/roster` → `roster-service.getView()` | `roster_flight` LEFT JOIN `pairing_segment`(pairingId,dutySeq,segSeq) 取 duty 级时间；LEFT JOIN `crew` 取姓名 |
| **环的机组明细** | `GET /api/pairing/:id/crew-detail` → `pairing-service.getCrewDetail()` | `pairing` ← `roster_flight` LEFT JOIN `crew` + `crew_base`(取基地) + `crew_manday`(取月块时 MBH) |
| **航班反查机组** | `GET /api/flight/:id/crew` | 经 `roster_flight.fltId` / `pairing_segment` 在服务端 join（客户端算不出，见 data-model.md 陷阱 2） |
| **环覆盖状态** | `pairing-service` 列表 | `pairing` ← `roster_flight` → `crew` → `crew_rank` 判断各职级是否配满 |

---

## 缓存（改数据时记得失效，否则界面不更新）

工具：`live-server/src/utils/cache.ts`（cache-aside：`getOrSet` / `invalidate`）。

| 表 | 缓存前缀 | TTL | 失效时机 |
|---|---|---|---|
| flight | `flight` | 10min | flight 增删改 |
| pairing | `pairing`（含 `pairing:types`/`pairing:list:*`） | 10min | pairing 增删改 |
| roster_flight | `roster:chunk:<crewId>:<start>:<end>`（按 crew 分块）、`roster:<id>` | 10min | 对应 crew 块 / 单条 在 增删改/swap/move 时失效 |
| crew | `crew` | 4h | crew 增删改（列表缓存按搜索模式失效） |

> 本地调试看不到改动时，优先怀疑缓存——按上表前缀清对应 redis key（参考记忆 `live-server-hot-reload-cache-and-db-query`）。

---

## 6. scenario 域（优化场景：元数据 + .gz 快照 + KPI）

> **谁拥有 scenario 逻辑：live-server**（CRUD/导出/KPI/Gantt），engine-server 只负责跑优化。scenario 的排班数据是 **.gz 文件**，DB 里只存元数据（见 data-model.md §7）。
>
> ⚠️ scenario 镜像表（flight/pairing/roster_flight 等）与 live 同库同 schema，**靠 `scenario_id` 列隔离**，不是 search_path 切换——查 scenario 数据要带 `WHERE scenario_id = ?`。

| 层 | 文件 | 说明 |
|---|---|---|
| Schema (镜像表) | `sql/schema/scenario/01-scenario-tables.sql` | flight/pairing/pairing_segment/roster_flight + crew_manday_* 的场景隔离副本（结构须与 live 一致） |
| Model | `live-server/src/models/scenario/scenario.ts` | `scenario` / `scenario_group` / `schedule_publish_record` 元数据（status/filePath/checksum/taskId/filterParams） |
| Model | `live-server/src/models/scenario/scenario-kpi.ts` | `scenario_kpi`（KPI 名/值/type，按 (scenarioId,kpiNames) UPSERT） |
| Service | `live-server/src/services/scenario/scenario-service.ts` | 场景 CRUD、状态机（DRAFT→RUNNING→DONE/FAILED→PUBLISHED）、缓存失效 |
| Service | `live-server/src/services/scenario/scenario-export-service.ts` | `buildRoInputGz()`：按 filterParams 过滤 live 表导出为 ro_input.gz，喂给 engine-server |
| Service | `live-server/src/services/scenario/scenario-result-service.ts` | 存优化结果元数据；`computeAndPersistKpis()` 从 gz 解析算 KPI（commit 8c29b319） |
| Service | `live-server/src/services/scenario/scenario-gantt-service.ts` | 构建场景 Gantt 数据（快照 ro_output.gz 或 live 刷新两路） |
| Service | `live-server/src/services/scenario/scenario-patch-service.ts` | 用户编辑 patch 回写 ro_output.gz | 
| Service | `live-server/src/services/engine-server-client.ts` | 调 engine-server 的 RO 优化 HTTP（startRoTask / fetchResultFile / writeOutputFile） |
| Routes | `live-server/src/routes/scenario/scenario.ts` | CRUD + `/:id/run`（起优化）、`/export`（engine 拉 gz）、`/result`（engine 回写）、`/:id/gantt-data`、`/:id/kpi`、`/group` |
| Routes | `live-server/src/routes/admin/scenario-kpi-backfill.ts` | 给旧场景补算 KPI 的 admin 端点 |
| Frontend | `gantt/src/services/scenario-api.ts` / `gantt/src/stores/scenario-store.ts` | 前端 API 封装 + Zustand store |

---

## 7. rule-engine 域（法规检查：如何消费排班数据）

> 两套引擎：`rule-engine/`（TS，npm 包 `@rois/rule-engine`，入口 `dist/index.js`，HTTP 服务 :3001）与 `rois-rule-engine/`（Python，engine-server 内嵌）。**live-server 走 TS 引擎的 HTTP 接口**。
>
> 注意 `rule-engine/` 目录里 `src/` 是 **Python**，TS 产物在 `dist/`（`main` 指向 `dist/index.js`）；改 TS 引擎源码要找其 TS 源（编译进 dist），别误改 Python src。

### 法规检查如何读核心表 / 调引擎

| 层 | 文件 | 说明 |
|---|---|---|
| HTTP 客户端 | `live-server/src/services/rule-engine-client.ts` | live-server **唯一**调引擎的出口：POST `:3001/check/pairing`、`/check/roster`；入参类型见 `live-server/src/types/rule-engine.ts`（`PairingInput`/`CrewInfo`/`EngineResult`） |
| 触发 | `live-server/src/services/rule-check/rule-check-trigger.ts` | `enqueueRuleCheckForMutation()`：roster 增删改/swap/move 后入队（pairing + 受影响月份级联） |
| 数据装配 | `live-server/src/services/rule-check/rule-check-data-service.ts` | 从 `pairing_segment` 拼 PairingInput、`crew`+资质拼 CrewInfo、`roster_flight` 聚合飞行小时（24h/7d/28d/90d/365d 窗口） |
| Worker (环) | `live-server/src/workers/check-pairing-worker.ts` | 实时环级检查：装配→调引擎→UPSERT `rule_check_result_pairing`→WS 广播 |
| Worker (月) | `live-server/src/workers/check-roster-worker.ts` | 实时月级检查：→ `rule_check_result_roster` |
| Worker (全量) | `live-server/src/workers/violations-init-worker.ts` | 全航司初始化 `rule_violation`；按 pairing-id 哈希跳过未变机组 |
| 结果落库 | `live-server/src/services/rule-check/rule-check-result-service.ts` | UPSERT `rule_check_result_pairing` / `_roster`（check/calc 结果存 JSONB） |
| 查询 Routes | `live-server/src/routes/rule-check/rule-check-routes.ts` | `GET /api/rule-check/pairings` / `/roster`、`POST /on-demand`、`/batch` |

### 法规配置表（rule_* CRUD）

| 层 | 文件 | 说明 |
|---|---|---|
| Model | `live-server/src/models/rule/rule-template.ts` / `rule-instance.ts` / `rule-group.ts` / `workset.ts` / `calc-result.ts` | 模板 / 实例 / 集合 / 工作集 / 计算结果 |
| Service | `live-server/src/services/rule/rule-config-service.ts` | 规则组/实例/组成员 CRUD + 排序；改后 `invalidateRuleEngineCache()` 通知 :3001 清缓存 |
| Service | `live-server/src/services/rule/rule-loader-service.ts` | 按 groupCode+division 解析出 ResolvedRule[]（join template/instance/group_instance） |
| Routes | `live-server/src/routes/rule/rule-config.ts`、`routes/rule/workset.ts` | 规则配置 / 工作集端点 |

> pbs-server **不**调 CCAR-121 法规引擎；其 "rule" 是 PBS 投标算法约束，与法规检查无关。

---

## 8. pbs-server 域（pbs_* 表 + 对核心表的只读访问）

> PBS 独立库/连接池/Redis。pbs_* 表在**独立 schema**（默认 `f8_pbs`，`pgSchema(env.PBS_SCHEMA)`）。PBS 周期和系统参数统一读 live schema（`f8.roster_period` / `f8.dictionary`）；其它 live 核心表仍以业务号弱关联只读访问，不建立跨 schema FK。

### PBS 自有表（pbs-server/src/models/pbs/*.ts，每表一文件）

| 层 | 文件 | 说明 |
|---|---|---|
| Model | `pbs-server/src/models/pbs/pbs-bid.ts` | 投标主记录（`crewId` 按值对 live `crew.crew_id`，非 FK） |
| Model | `pbs-server/src/models/pbs/pbs-award-result.ts` / `pbs-award-item.ts` | 分配结果主/明细（`pairingId` 存 live `pairing.id`，只读给算法导出） |
| Model | `pbs-server/src/models/pbs/pbs-user.ts` | PBS 登录用户投影（与 live `users` 分开） |
| Model | `pbs-server/src/models/live/roster-period.ts` / `live/dictionary.ts` | PBS 周期窗口和业务时间配置读取源（live schema） |
| Service | `pbs-server/src/services/auth/auth-service.ts` | 登录/密码校验/token | 
| Service | `pbs-server/src/services/pairing/*`、`days-off/`、`line/`、`reserve/` | 四类投标各自的 service |
| Routes | `pbs-server/src/routes/pairing-bids.ts` / `days-off-bids.ts` / `line-bids.ts` / `reserve-bids.ts` | 各投标 CRUD（`/api/{type}/bid/current` 等） |
| Routes | `pbs-server/src/routes/auth.ts` / `algorithm-export.ts` / `bidding-calendar.ts` | 登录 / 算法导出 / 投标日历 |

### 对 5 张核心表的跨域只读（业务号关联，非 FK）

| 核心表 | 入口文件 | 怎么读 |
|---|---|---|
| `pairing` | `pbs-server/src/services/pairing-search/pairing-id-search-query.ts` | 裸 SQL 查 live schema；环号搜索 |
| `pairing_segment` | `pbs-server/src/services/pairing-search/pairing-search-preview-query.ts` | join 取航段/duty 时间/航班号做预览 |
| `crew` | `pbs-server/src/services/pairing-search/crew-id-search-query.ts` | 按 `crew_id` 字符串匹配搜索 |
| `roster_flight` | `pbs-server/src/services/calendar/bidding-calendar-service.ts` | **仅探测存在性**（`select 1 ... where false`），不读数据 |
| `flight` | （不直接读） | PBS 只经 `pairing_segment.fltId` 间接涉及，不独立查 flight |

---

## 维护说明

- 新增端点 / service / 表时，在对应小节追加一行；保持"路径 + 一句话"格式，不贴大段代码。
- 路径变更（重命名/迁移）后更新本文件，否则索引失效比没有更糟。
- 与 [`data-model.md`](./data-model.md) 配套：那份讲"表怎么连"，这份讲"代码在哪"。
- Current F8 optimization runs through `pbs-engine/` via engine-server integration scripts. `ro-engine/` and `po-engine/` remain in the repository as retained legacy modules and baseline/reference material, but they are not active F8 delivery development targets.
