# PBS Dashboard Profile / Summary 二阶段性能优化设计

## 背景

本轮是在已有 `2026-08-20-pbs-dashboard-bootstrap-performance-design.md` 和
`perf: optimize pbs dashboard bootstrap paths` 之后继续检查优化空间。前一轮已经处理过部分 Dashboard / Bootstrap 路径，
但最新实测仍显示 `dashboard/profile` 和 `dashboard/summary` 有真实优化空间。

本轮调查只读代码、运行接口性能脚本和远端 PostgreSQL `EXPLAIN`，没有修改代码。

本地接口实测样本：

| 接口 | Min | P50 | Max | Avg | 结论 |
| --- | ---: | ---: | ---: | ---: | --- |
| `GET /api/dashboard/profile` | 1131.68ms | 1180.67ms | 1518.36ms | 1236.24ms | 稳定偏慢 |
| `GET /api/dashboard/summary` | 1471.68ms | 1551.66ms | 1857.73ms | 1597.51ms | 比 profile 多约 300-400ms |
| `GET /api/portal/bootstrap` | 1357.75ms | 1442.79ms | 4513.71ms | 1944.67ms | 常态约 1.4s，偶发尖峰 |

远端 PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` 结果显示 SQL 执行本身并不慢：

| 查询路径 | DB 执行时间 | 主要证据 |
| --- | ---: | --- |
| `resolveCrewIdentity` | 0.287ms | 已使用 crew/base/rank/airport 相关索引 |
| `loadLiveProfileRow` | 0.212ms | 已使用 crew、crew_fleet、crew_manday period 索引 |
| `loadPreAssignments` | 1.439ms | 使用 `roster_flight_crew_id_sch_str_dt_utc_idx`，返回行数小 |

因此本轮核心判断是：慢点主要来自远端数据库多次串行 round trip，而不是 SQL 计划本身。继续盲目加索引不是正确方向。

## 目标

- 降低 Dashboard 左侧个人信息和右侧 Message Center 依赖的后台读取耗时。
- 优先优化 `dashboard/profile` 与 `dashboard/summary` 的重复/串行远端访问。
- 保持现有 API contract 和业务语义完全不变。
- 不改变 Dashboard UI，不改变字段含义，不改变预占 duties 计算逻辑。
- 不改变 current period 选择规则、Business Time 规则、open/closed 逻辑。
- 用接口性能对比、后端测试和 Playwright Dashboard 回归证明优化有效且没有改坏功能。

## 非目标

- 不做 Dashboard 视觉重设计。
- 不把 Dashboard 前端强行切到 `GET /api/portal/bootstrap`。
- 不重写大 SQL，不合并成一个难维护的巨型查询。
- 不新增数据库 migration，除非后续 `EXPLAIN` 出现新的明确证据。
- 不缓存用户写操作、bid draft、draftVersion、保存状态或权限判断结果。
- 不改变 `Business Time` 的 60 秒配置缓存行为。

## 当前调用链

### `dashboard/profile`

入口：

- `pbs-server/src/routes/dashboard-profile.ts`
- `pbs-server/src/services/dashboard-profile/dashboard-profile-service.ts`

当前主要步骤：

1. 从 PBS schema 查询 `pbs_user`。
2. 从 live schema 通过 `resolveCrewIdentity` 查询当前 crew 的 base/rank/zone。
3. 根据 roster period 查询 live profile fields，包括 fleet、language、seniority、existing credit。
4. 格式化 last login。

当前没有 Redis cache，也没有 in-memory fallback cache。并且 `/api/dashboard/profile` 与 `/api/portal/bootstrap`
调用 profile 时不会显式传 `rosterPeriodKey`，但 `existingCreditLabel` 又依赖当前 roster period，因此如果要缓存
profile，必须先把“隐式 current period”解析成明确的 effective roster period key，不能简单用 `"-"` 作为缓存维度。

### `dashboard/summary`

入口：

- `pbs-server/src/routes/dashboard-summary.ts`
- `pbs-server/src/services/dashboard-summary/dashboard-summary-service.ts`

当前主要步骤：

1. `businessClock.getBusinessNow()`。
2. `resolveCurrentPeriod(db, actor, businessNow)`。
3. 调用 `dashboardProfileService.getCurrentProfile({ crewId, rosterPeriodKey })`。
4. 读取 pre-assigned duties。
5. 组装 bid package、message center、profile。

当前问题：

- `dashboard/summary` 自己没有 current period cache。
- `dashboard/profile` 没有 profile cache，所以 summary 每次都要重新跑 profile 链路。
- profile 读取完成后才读取 preAssignments；正常 period 已经有 `base` 和 `zoneId` 时，这两段可以并行。

### 已有可复用模式

Pairing、Days Off、Line、Reserve、Lineholder Summary 都已有 current period cache 模式：

- Redis cache 优先。
- 无 Redis 时使用 in-memory fallback。
- key 类似 `cache.key("period", "current", "v3", actor.crewId)`。
- TTL 为 60 秒。
- 使用 `serializeLineholderPeriodContext` / `deserializeLineholderPeriodContext` 保持 Date 和 context 结构安全。

Dashboard Summary 当前没有复用这套模式，属于一致性缺口。

## 方案比较

### 方案 A：短 TTL profile cache + summary current period cache + summary 并行化

做法：

- 给 `createPbsDashboardProfileService` 增加可选 `cache?: PbsCache`。
- 对 `getCurrentProfile` 增加短 TTL 私有缓存，key 至少包含：
  - `crewId`
  - effective `rosterPeriodKey`
- 给 `createPbsDashboardSummaryService` 增加 current period cache，复用 Lineholder Summary 的 60 秒模式。
- `dashboard/summary` 在 period 已有 `zoneId` 时，并行加载 profile 与 preAssignments；缺少 `zoneId` 时保留当前串行 fallback。
- `app.ts` 给 Dashboard Profile / Summary 注入现有 `pbsCache`。

优点：

- 针对当前真实瓶颈：减少重复远端 round trip。
- 不改变 SQL 语义和接口返回结构。
- 复用项目已有 cache 模式，维护成本低。
- 不需要数据库 migration。
- 对 `dashboard/profile`、`dashboard/summary`、`portal/bootstrap` 都有收益。

缺点：

- 对没有显式 `rosterPeriodKey` 的 profile 调用，需要先解析 current period，才能安全命中 profile cache。
- `lastLoginLabel` 可能在短 TTL 内最多延迟显示一次旧值。
- cache key 和 TTL 需要谨慎，避免 period 或 crew 维度串数据。

结论：推荐。

### 方案 B：把 profile 相关 SQL 合并成一个大查询

做法：

- 把 `pbs_user`、`resolveCrewIdentity`、`loadLiveProfileRow` 合并为更少的 SQL round trip。

优点：

- 理论上可以减少远端往返。
- 不依赖 cache。

缺点：

- 跨 PBS schema 与 live schema，SQL 更复杂。
- 容易把当前清晰的身份解析、profile 字段、credit period 逻辑揉在一起。
- 当前 SQL 执行时间已经很低，收益不一定比短 TTL cache 更好。

结论：暂不推荐，作为后续 fallback。

### 方案 C：改 Dashboard 前端统一调用 `portal/bootstrap`

做法：

- 前端 Dashboard 只调用组合接口，减少浏览器 round trip。

优点：

- 可能减少前端接口数量。

缺点：

- 当前 `portal/bootstrap` 不包含完整 Dashboard Summary 语义。
- 会改变前端数据契约，影响面大。
- 实测 `portal/bootstrap` 自身也有尖峰，不是当前最稳的第一步。

结论：本轮不做。

## 推荐设计

采用方案 A。

### 1. Dashboard Profile cache

新增 `PbsCache` 可选依赖：

```ts
type CreatePbsDashboardProfileServiceOptions = {
  db: Database;
  pgPool?: PgPool;
  liveSchema?: string;
  cache?: PbsCache;
};
```

缓存粒度：

- `crewId`
- effective `rosterPeriodKey`，因为 existing credit 依赖 roster period。

effective `rosterPeriodKey` 解析规则：

- 如果调用方显式传入 `actor.rosterPeriodKey`，使用该值。
- 如果调用方没有传入 `actor.rosterPeriodKey`，先通过 current period 解析得到当前 `rosterPeriodKey`。
- 该 current period 解析必须复用 60 秒 current period cache 语义，不能每次 profile cache lookup 都重新打复杂 period SQL。
- 不允许用 `"-"`、空字符串或 `crewId` 单独作为 existing-credit profile 的缓存 key，否则跨 period 时可能看到旧周期 credit。

建议 TTL：

- 60 秒。

缓存内容：

- `PbsDashboardUserProfile` response object。

缓存实现：

- 有 Redis `PbsCache` 时使用 Redis cache。
- 没有 Redis cache 注入时使用 service 内 in-memory fallback，行为对齐 current period cache 的本地 fallback。
- 每次返回 cache value 时 clone plain object，避免调用方意外修改缓存对象。

缓存边界：

- 只缓存 GET profile 结果。
- 不缓存登录认证、token、密码、权限。
- 不缓存任何 bid draft 写入状态。

`lastLoginLabel` 风险：

- 如果登录后立即刷新 Dashboard，60 秒内可能看到上一次缓存的 last login。
- 该字段不是权限字段，也不参与业务计算；本轮接受这个短暂展示延迟。
- 如果后续用户要求 last login 必须实时，则可以只缓存 live profile fields，保留 PBS user 查询实时，但这会少省一次 round trip。本轮先不采用该复杂方案。

隐式 period 风险：

- `/api/dashboard/profile` 和 `/api/portal/bootstrap` 没有显式 period 入参，因此 profile cache 的 period 维度来自 current period cache。
- Business Time 切换后，profile 的 existing credit 最多存在 60 秒 current-period cache 窗口；该语义必须与其他 Lineholder GET 模块一致。
- 如果后续要求 Business Time 切换后 profile credit 立即无缓存刷新，应单独统一 current period cache invalidation，而不是只改 Dashboard Profile。

### 2. Dashboard Summary current period cache

Dashboard Summary 增加与 Lineholder Summary 一致的 current period cache：

- Redis cache 优先。
- 无 Redis 时 in-memory fallback。
- TTL 60 秒。
- key：`period/current/v3/{crewId}`。
- serialize / deserialize 复用 `serializeLineholderPeriodContext` 与 `deserializeLineholderPeriodContext`。
- 每次返回 clone，避免调用方修改缓存对象。

行为边界：

- `computedStage` / `canEditBid` / banner 的 60 秒缓存语义与 Pairing、Days Off、Line、Reserve 对齐。
- 不改变 Business Time 的来源；Business Time 自身已有配置缓存。
- 不把 preAssignments 放进 current period cache。

### 3. Dashboard Summary 并行化

当前 summary 是：

1. period
2. profile
3. preAssignments

优化后：

- 先拿 period。
- 如果 `period.zoneId` 存在，使用 period 的 `base/zoneId` 直接启动 preAssignments，同时启动 profile。
- 如果 `period.zoneId` 缺失，保持当前逻辑：先 profile，再用 `profile.base` fallback 构建 timezone，再查 preAssignments。

这样不会改变 fallback 行为，也不会改变 preAssignments 的日期范围和 timezone 语义。

### 4. App wiring

在 `pbs-server/src/app.ts` 中：

- 创建 `dashboardProfileService` 时注入 `cache: pbsCache`。
- 创建 `dashboardSummaryService` 时注入 `cache: pbsCache`。

skipDatabase 和 test mock 分支保持不变。

## 数据库变更

本轮不需要数据库 migration。

原因：

- 远端 `EXPLAIN` 已证明关键 SQL 执行时间在 0.2-1.4ms 范围。
- 当前瓶颈是远端 round trip 和串行链路。
- 加索引不能解决多次串行访问的问题。

如果实现后性能仍不达标，再单独对剩余慢 SQL 补 `EXPLAIN`，不能在本轮凭感觉加索引。

## 接口行为验收

- `GET /api/dashboard/profile` response JSON 字段保持不变。
- `GET /api/dashboard/summary` response JSON 字段保持不变。
- Dashboard 仍显示：
  - Bid Information - Local Time
  - User Information
  - Message Center / pre-assigned duties
  - Bidding Calendar
- pre-assigned duties 数量、分类、列表顺序、时间展示保持不变。
- existing credit 仍按当前 roster period key 读取。
- bidding open / closed / remaining 展示保持原语义。
- Business Time 切换后的 cache 语义与其他 Lineholder bid 模块一致。

## 性能验收

实现前后必须保留对比数据。

目标：

- `/api/dashboard/profile`
  - warm cache 场景平均耗时明显下降。
  - 冷启动或 cache miss 不应比当前更慢。
- `/api/dashboard/summary`
  - warm cache 场景目标降到 600ms 左右或以下。
  - 即使 preAssignments 仍需远端读取，也应比当前约 1.6s 明显下降。
- `/api/portal/bootstrap`
  - profile 子路径受益，整体不能变慢。
- `/api/bidding-calendar/current`
  - 不属于本轮修改目标，但需要作为 Dashboard 页面守护项，不能回归。

性能脚本建议至少记录：

```bash
pnpm --dir pbs-server perf:pbs -- --samples=8
```

如果现有 perf harness 不能单独输出这几个接口的重复样本，再使用等价临时脚本连续请求：

- `/api/dashboard/profile`
- `/api/dashboard/summary`
- `/api/portal/bootstrap`
- `/api/bidding-calendar/current`

每个接口至少 8 次，报告 min / p50 / max / avg。

## 自动化测试

后端建议测试：

- `pbs-server/src/services/dashboard-profile/dashboard-profile-service.test.ts`
  - cache hit 时不重复调用 live profile 查询。
  - cache key 包含 rosterPeriodKey，避免不同 period 的 existing credit 串数据。
  - 没有传 `actor.rosterPeriodKey` 时，先通过 60 秒 current period cache 解析 effective rosterPeriodKey，再进入 profile cache。
  - 无 cache 注入时仍走原始路径。
- `pbs-server/src/services/dashboard-summary/dashboard-summary-service.test.ts`
  - current period cache 命中时不重复 resolve。
  - `period.zoneId` 存在时 profile 与 preAssignments 可以并行。
  - `period.zoneId` 缺失时保持 profile fallback 串行逻辑。
- route 层测试保持现有 ETag / response contract。

必须执行：

```bash
pnpm --dir pbs-server build
pnpm --dir pbs-server test
```

Compiled-server smoke：

- `pnpm --dir pbs-server build` 后，用编译后的 server 在真实本地 env 下启动。
- smoke 必须先完成认证，后续请求使用认证态访问目标接口。
- 命中以下接口并确认 `200` 且 response 包含 `data`：
  - `/api/dashboard/profile`
  - `/api/dashboard/summary`
  - `/api/portal/bootstrap`
- smoke 只记录 HTTP status 和 response shape，不打印 token、密码、数据库连接串或完整敏感 profile payload。

前端 / Playwright 回归：

- 打开真实 Dashboard 页面，确认页面可用且字段显示正常。
- 确认 Message Center 预占 duties 列表仍能显示。
- 确认左侧 Bidding Calendar 没有空白、裁切或请求失败。

建议执行现有 Dashboard 相关 Playwright 测试；如果现有测试不能覆盖 Dashboard summary/profile，应补最小回归用例。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本轮改动集中在 `pbs-server` 两个 service 和 app wiring，文件范围小，但 cache key / period / profile fallback 逻辑强耦合，拆给多个 agent 容易产生重复或冲突。
- Suggested split: 不建议拆分。可在实现后单独让 review agent 检查 spec 或代码风险。
- Write boundaries: 主 agent 负责 `dashboard-profile-service.ts`、`dashboard-summary-service.ts`、相关 tests、`app.ts`。
- Conflict risk: 中等。profile cache 和 summary cache 都依赖同一 current period/profile 语义，分开实现容易漏掉 key 或 fallback。
- Execution gate: 用户确认本 spec 后再实现；实现前必须对要修改的函数跑 GitNexus impact。

## 风险与回滚

风险：

- cache key 漏维度导致不同 period 的 existing credit 串数据。
- `lastLoginLabel` 在短 TTL 内不完全实时。
- summary 并行化时错误使用 timezone fallback，导致 preAssignments 日期范围偏移。

控制：

- cache key 必须包含 `crewId` 和 `rosterPeriodKey`。
- summary 并行化只在 `period.zoneId` 存在时启用；否则原逻辑不变。
- 测试覆盖 cache hit/miss、不同 rosterPeriodKey、timezone fallback。

回滚方式：

- 移除 Dashboard Profile cache 注入与 getOrSet 包装。
- 移除 Dashboard Summary current period cache 包装。
- 恢复 summary 串行读取 profile -> preAssignments。
- 不涉及数据库 migration，因此回滚不需要 DB 操作。

## 实施门禁

实现前必须：

1. 用户确认本 spec。
2. 对要修改的 symbol 跑 GitNexus impact，并报告影响范围。
3. 明确性能基线命令。
4. 确认当前工作区没有未理解的用户改动。

实现完成后必须：

1. 跑后端 build/test。
2. 跑接口性能对比。
3. 跑 Dashboard Playwright 回归。
4. 报告具体 PASS / FAIL 和性能前后数据。
