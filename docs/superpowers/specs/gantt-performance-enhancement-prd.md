# PRD: Gantt 排班视图性能增强

> 模块：gantt（前端）/ live-server（后端）
> 状态：Draft（待评审）
> 创建日期：2026-05-29
> 关联诊断：本 PRD 基于一次分层性能诊断（network / backend / payload / frontend）的代码取证结论。

---

## 1. 背景与问题陈述

Gantt 排班视图在 **2 个月 / ~5000 机组行 / ~10000 航班** 的默认场景下表现出三类性能问题。用户主要从**亚洲**访问，服务部署在**北美**，跨洲 RTT 约 150–250ms。

> ⚠️ 架构勘误：诊断中确认，为 Gantt 提供排班数据的后端是 **live-server（Fastify + Drizzle + TS，端口 3000）**，**不是** FastAPI。FastAPI 的 `engine-server`（端口 3003）是优化引擎调度服务，**不在** Gantt 数据加载关键路径上。因此本 PRD 的后端改造目标全部指向 live-server。

### 1.1 三类症状与各自的瓶颈归类

不同症状的根因完全不同，修复手段不可混用：

| 症状 | 瓶颈类型 | 代码取证根因 |
|------|---------|-------------|
| **S1. 初始加载慢**（目标 ≤3s 可交互） | **网络 / 延迟+传输** | 排班响应为**未压缩**的冗长行式 JSON（约数十 MB），经跨洲 200ms-RTT 链路传输；live-server **未启用任何 gzip/brotli**。主导因素是**传输时间**而非往返次数。 |
| **S2. 垂直滚动慢**（5000 机组行） | **渲染 / 计算** | 渲染热循环里每帧对**整个** ~25k 条数组执行 `items.filter()` + `parseISO()`，ISO 字符串以 60fps 被反复解析。Canvas 本身没问题。 |
| **S3. 水平滚动慢**（时间轴） | **渲染 / 计算** | 同一热循环；水平裁剪遍历全部 item 而非仅虚拟化后的可见行。 |

**核心结论：S1 是延迟/传输瓶颈，S2/S3 是渲染/计算瓶颈，二者几乎不共享任何修复手段。**

### 1.2 现状架构评估（取证摘要）

| 层 | 现状 | 评价 |
|----|------|------|
| 前端渲染 | Canvas 2D 即时模式；行轴 + 时间轴**双向自定义虚拟化**；RAF 批渲染；useMemo/useCallback 充分 | ✅ 架构正确，**无需重写为 WebGL / 引入虚拟化库** |
| 前端取数 | 单次大请求一次性拉全量；Zustand 内存存储；无 React Query；无视口窗口化；`loadMore` 全量重拉 | ⚠️ 无窗口化、无增量 |
| 后端查询 | live-server `/api/roster`，单条 LEFT JOIN（**非 N+1**）；Redis 10 分钟缓存 | ✅ 查询是集合式；⚠️ `roster_flight` 缺索引 |
| 后端序列化/压缩 | 默认 `JSON.stringify`；**未启用 `@fastify/compress`** | ❌ 无压缩；序列化未优化 |
| 数据形状 | 行式 JSON，68 字段长键名，完整 ISO 时间戳，null 字段全量序列化，crew 列表内联历史 | ⚠️ 冗长、过量获取 |
| 网络基础设施 | 无 nginx/H2 配置入库；无 CDN/边缘；无亚洲只读副本 | ⚠️ 待确认/规划 |

---

## 2. 目标与非目标

### 2.1 目标

- **G1（首要）**：2 个月默认视图在亚洲访问下**首屏可交互 ≤ 3s**（缓存未命中的首次加载）。
- **G2**：垂直与水平滚动稳定 **60fps**（scripting 主导的长任务消除）。
- **G3**：所有改动遵循"先测量、后改造"，每项瓶颈都有量化证据支撑，不臆测。
- **G4**：改造分阶段，配置级快速见效优先，结构性改造延后并以测量结果为准入条件。

### 2.2 非目标

- 不重写渲染引擎（Canvas 双向虚拟化已足够）。
- 不引入第三方 Gantt/Grid 库。
- 本阶段不强制上亚洲只读副本 / 边缘缓存（列为 Phase 3 待定项，以测量结果决定）。
- 不改动 FastAPI engine-server（不在关键路径）。

### 2.3 成功度量（验收指标）

| 指标 | 当前（估算，待测） | 目标 |
|------|------------------|------|
| `/api/roster` 响应体大小（压缩后） | ~20–40 MB（未压缩） | ≤ 5 MB |
| 首屏可交互时间（亚洲，缓存未命中） | ~8–12s（估算） | ≤ 3s |
| 滚动每帧 scripting 耗时 | 长任务（25k 次 parseISO/帧） | < 8ms/帧（60fps） |
| 排班查询执行时间（缓存未命中） | 待 EXPLAIN 确认 | 无 Seq Scan，索引命中 |

---

## 3. 瓶颈清单（按影响力排序）与改造需求

> 每项含：代码证据 / 确认所需测量 / 改造方案 / 预期影响 / 优先级。

### 🥇 R1 — 启用 HTTP 压缩（`@fastify/compress`） · `[网络/延迟]` · P0
- **证据**：`live-server/src/index.ts` 仅注册 CORS/JWT/WebSocket/db/redis/metrics，**无 `@fastify/compress`**；`package.json` 无该依赖；仓库内无反向代理配置代偿。
- **为何最关键**：排班响应是 68 字段 × ~25k 行的冗长行式 JSON，估算 ~20–40MB 未压缩。跨洲链路下传输时间主导：30MB @ ~20Mbps ≈ ~12s 纯传输。
- **确认测量**：DevTools Network 查看 `/api/roster` 的 Content-Length 与传输耗时；`curl -s -o /dev/null -w '%{size_download}'`。
- **方案**：启用 `@fastify/compress`（brotli 优先，gzip 兜底），threshold ~1KB。
- **预期影响**：JSON 压缩率约 85–90%，30MB → ~3–5MB；亚洲链路传输 ~12s → ~2s。**单项即可能让首屏接近 3s 目标。**

### 🥈 R2 — 消除渲染热循环中的时间戳解析 · `[前端/渲染]` · P0（滚动卡顿根因）
- **证据**：`gantt/src/components/gantt/renderers/roster-renderer.ts` 每帧在 `items.filter(...)` 内调用 `parseISO(item.schStrDtUtc)` / `parseISO(item.schEndDtUtc)`，且遍历**全量**数组；RAF 随滚动增量触发。25k × parseISO × 60fps ≈ 150 万次/秒字符串解析。
- **为何虚拟化没挡住**：行绘制虽虚拟化，但水平可见性过滤仍**扫描全部 item**（未按 crewId 预分桶），每帧工作量 O(总数) 而非 O(可见)。
- **确认测量**：DevTools Performance 录制滚动；定位 `renderRosterTasks`/filter 的长任务；确认 scripting 远大于 rendering/painting，bottom-up 中出现 `parseISO`。
- **方案（无架构变更）**：
  1. **数据落库即解析一次**：item 进入 Zustand store 时预计算 `startMs`/`endMs`（epoch 毫秒），渲染循环只做数值比较，永不解析。
  2. **按 crewId 预分桶**：建 `Map<crewId, items[]>`，每帧过滤只走 ~20 可见行的 item。
- **预期影响**：每帧从 O(25k 解析) 降至 O(可见行 × 少量 item) 整数比较，scripting 通常降 **10–50×**，恢复双向 60fps。

### 🥉 R3 — 为 `roster_flight` 补索引 · `[后端/计算]` · P1
- **证据**：`sql/schema/02-crew_roster_pg.sql` 中 `pairing_segment` 有索引（支撑 JOIN），但 `roster_flight` **缺 `crew_id`、`sch_str_dt_utc` 日期范围、`pairing_id` 连接索引**。查询为 `inArray(crewId, …)` + `COALESCE(sch_str_dt_utc,…) BETWEEN …`，疑似全表扫描。
- **缓解项**：存在 Redis 10 分钟缓存（键含 crew+日期），仅首次加载/缓存失效付费——但这恰是"首屏慢"症状。
- **确认测量**：生产数据量下 `EXPLAIN (ANALYZE, BUFFERS)` 排班查询，查 `Seq Scan on roster_flight`；查 live-server 日志/`pg_stat_statements` 均值。
- **方案**：`CREATE INDEX ON roster_flight (crew_id, sch_str_dt_utc)`、`(pairing_id, duty_seq, seg_seq)`；考虑 `WHERE is_deleted = 0` 部分索引。**遵守 CLAUDE.md：sql/schema 既有脚本不动，索引以 `sql/migration/` 增量脚本落地。**
- **预期影响**：若确为 Seq Scan，缓存未命中查询提速 **10–100×**。先 EXPLAIN 确认，若已是索引扫描则跳过。

### R4 — 精简 DTO / 减少过量获取 · `[payload]` · P2
- **证据**：`RosterItem` 68 字段、长键名（`debriefStartUtc` 等）、完整 ISO 时间戳（28 字节 ×~12/行）、null 字段全量序列化；crew 列表内联 `ranks[]/bases[]/fleets[]/quals` 历史而 Gantt 不渲染（`gantt/src/types/crew.ts`）。
- **确认测量**：同 R1 的体积对比（裁字段前后）。
- **方案**：仅下发 Gantt 实际读取的字段；crew 历史改独立懒加载端点；考虑 epoch-ms 替代 ISO；省略 null。
- **预期影响**：压缩**前**减 ~30–40%，压缩**后**仅减 ~10–20%（gzip 已吃掉重复键成本）。**次于 R1，收益递减；除非不做压缩否则后置。**

### R5 — `loadMore` 改增量拉取 · `[网络/后端]` · P2
- **证据**：`gantt/src/hooks/use-gantt-viewport.ts` 在机组 loadMore 时以**全量** `selectedCrewIds` 调 `fetchRoster`，重复下载已在内存的机组排班。
- **确认测量**：滚动机组列表时观察 Network 中 `/api/roster` 体积持续增长。
- **方案**：仅拉新增 crewId 并合并（store 已有 `mergeItems` 去重模式可复用）。
- **预期影响**：消除机组分页时的重复多 MB 下载。

### R6 — 序列化优化（`fast-json-stringify`） · `[后端/计算]` · P3
- **证据**：无响应 schema，Fastify 退回 `JSON.stringify`；~30MB 数组的同步序列化阻塞事件循环。
- **确认测量**：在序列化处加计时，或对比 TTFB 与 DB 耗时；仅当序列化 > ~100ms 才值得做。
- **方案**：为响应挂 schema 启用 `fast-json-stringify`。**低优先，先确认有实质开销。**

### R7 — HTTP/2 + keep-alive + 亚洲就近 · `[网络/基础设施]` · P3（部分待定）
- **证据**：仓库无 nginx/Caddy/H2 配置；CORS `origin: true`；dev 代理指向 localhost；生产代理在仓库外、未文档化。
- **分析**：当前是"一个大请求"，H2 多路复用收益有限（除非先做窗口化）；keep-alive/TLS 复用省 ~1 RTT(~200ms)。**亚洲只读副本/边缘缓存**收益大但投入大——**R1 压缩已拿走大部分就近收益**，副本延后到测量确认残余延迟仍是瓶颈再议。
- **确认测量**：`curl -I --http2`；查响应头 `Connection: keep-alive`；压缩后从亚洲实测 TTFB。

---

## 4. 分阶段实施计划

### Phase 0 — 测量（约 0.5 天，任何改动前必做）
不测无法确认排序与收益归属。在真实 NA→Asia 路径上采集：
1. `/api/roster` Content-Length + 传输耗时 + TTFB（DevTools Network）。
2. 垂直、水平滚动各一次 Performance profile —— scripting vs rendering vs painting，定位长任务。
3. 生产数据量下排班查询 `EXPLAIN (ANALYZE, BUFFERS)`。
4. `gantt/` 执行 `npm run build`，查 `dist/` 包体积。

**产出**：3s 预算中传输(R1)/DB(R3)/序列化(R6)/客户端渲染(R2) 各占多少。

### Phase 1 — 快速见效（配置级，数天，无架构变更）
- **R1** live-server 启用 `@fastify/compress`（brotli+gzip）。*最高 ROI。*
- **R3** 若 Phase-0 EXPLAIN 显示 Seq Scan，补 `roster_flight` 索引（migration 脚本）。
- **R7** 代理层启用 HTTP/2 + keep-alive；确认 gzip 未被剥离。
- 核对 Redis 10 分钟缓存命中率（打 hit/miss 日志）。

→ 预期：首屏由 ~8–12s 降至 ~2–4s，**无需动前端**。

### Phase 2 — 渲染热循环（前端，数天，滚动修复）
- **R2** store 内预解析时间戳为 epoch-ms；按 crewId 预分桶。改动局限于 store + `roster-renderer.ts`，非重写。
- 可选：确认每帧仅一次 RAF 渲染；确认无 Zustand 订阅者在每次滚动 tick 触发 React 重渲染。

→ 预期：双向 60fps。

### Phase 3 — 结构性（数周，仅当 Phase 0 显示仍有缺口）
- **视口窗口化取数**：按可见时间范围 + 机组分页拉取，其余后台补齐；此时 H2 多路复用与流式才开始显著获益，≤3s 目标对数据增长更鲁棒。
- **R5** 机组 loadMore 增量拉取。
- **R4** 精简 DTO（去内联历史、裁字段），与窗口化天然配套。
- **R7 副本/边缘**：仅当 Phase 1–2 后实测延迟仍为瓶颈再评估。

---

## 5. 风险与约束

- **版本号管理（CLAUDE.md 强制）**：前端改动（R2/R4/R5）→ `FRONTEND_VERSION +1`；后端改动（R1/R3/R6）→ `BACKEND_VERSION +1`；跨前后端则两者 +1。
- **参数化（CLAUDE.md 强制）**：压缩阈值、分页页大小、窗口化时间跨度等阈值不得硬编码，应从 `dictionary` 表或配置读取。
- **SQL 约束（CLAUDE.md）**：不改 `sql/schema/` 既有脚本，索引经 `sql/migration/` 增量落地；对象名全小写 snake_case。
- **缓存一致性**：压缩与索引不改变数据，风险低；窗口化（Phase 3）需保证滚动加载与既有 Redis 缓存键、`mergeItems` 去重一致。
- **测量依赖真实环境**：Phase 0 须在跨洲网络与生产数据量下测，本地 localhost 数据无意义（参见内存：live-server 连远端 demo 库、本地 f8 schema 为空）。

---

## 6. 测试要求（CLAUDE.md §Playwright-Required / §No-Illusion 强制）

每项改造完成后必须有测试佐证，禁止仅凭代码审查声称"已修复"。

| 改造 | 测试类型 | 最小覆盖 |
|------|---------|---------|
| R1 压缩 | 后端集成（Vitest）| 断言 `/api/roster` 响应头含 `content-encoding: br`/`gzip`，且解压后数据正确 |
| R2 渲染热循环 | Playwright（`e2e/gantt/`）| 加载 2 个月视图，滚动后断言可见行数据正确（`toContainText`/`toHaveCount`），而非仅 `toBeVisible`；性能用 profile 佐证 scripting 下降 |
| R3 索引 | SQL EXPLAIN 回执 | 粘贴 `EXPLAIN ANALYZE` 前后对比，证明 Seq Scan → Index Scan |
| R5 增量拉取 | Playwright | loadMore 后断言新机组排班出现、且不重复请求已有机组（回归测试需能在修复前捕获该 bug）|
| 窗口化（P3）| Playwright | 滚动到新时间范围后正确项出现、错误项不出现 |

**验收硬性要求**：运行 `npx playwright test e2e/<file>.spec.ts --reporter=list`，将最终 PASS/FAIL 摘要粘入完成说明，方可标记完成。

---

## 7. 一句话结论

渲染架构没问题——Canvas + 双轴虚拟化是正确设计且已就位；滚动卡顿是窄范围的热循环 bug（每帧解析时间戳），非缺虚拟化或选错渲染器。首屏问题压倒性地是延迟/传输瓶颈，而 **R1（压缩）是配置级改动且很可能单项就接近 3s 目标**。务必先做 Phase 0 测量再上结构性改造——窗口化与亚洲副本是真投入，压缩+索引+渲染修复可能让它们变得不必要。
