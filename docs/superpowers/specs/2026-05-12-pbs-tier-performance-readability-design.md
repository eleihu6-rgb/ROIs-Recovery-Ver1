# PBS Tier 性能与可读性修正设计

## 背景

用户在浏览器 Network 中看到 `GET /api/pairing-bids/current` 首次调用接近 5 秒。排查后复现到 PBS 读接口存在空闲后首个请求尖刺：

- 连续热态样本中 `pairing-bids/current` 约 1.2 秒以内。
- 服务空闲约 35 秒后，`pairing-bids/current`、`days-off/current`、`lineholder summary` 等读接口都可能超过 2 秒。
- Tier 的 `View Pairing Set` 当前直接调用 `pairingService.getPageData()`，没有复用 Pairing 页面已有 React Query 缓存。
- Tier diagnostics 逻辑集中在 `lineholder-summary-service.ts`，文件继续增大，可读性下降。

## 目标

- 让 Tier 的 Pairing Set Preview 复用 Pairing current draft 全局缓存，减少重复触发 `/pairing-bids/current`。
- 缓解 PBS 后端连接池空闲后首个 DB 读请求的冷链路尖刺。
- 让慢 GET 也进入服务端 warning 日志，方便后续定位读接口性能问题。
- 把 Tier summary diagnostics 构建逻辑从 summary service 拆出，保持 service 主流程清晰。
- 保持现有 API contract、数据库 schema、算法边界不变。

## 非目标

- 不实现 RO/PO/法规/coverage/资历算法。
- 不改 SQL/schema/migration。
- 不新增依赖。
- 不改变 `/api/pairing-bids/current` 响应结构。
- 不把 AA 原文 `Layer` 术语带回代码或 UI。

## 方案

### 前端缓存复用

`TierRightPanel` 在打开 `View Pairing Set` 时，通过已有 `pairingPageDataQueryKey` 和共享 `queryClient.fetchQuery()` 获取 Pairing page data。

如果 Pairing 页面或 Search Pairings 已经在 60 秒内加载过 current draft，Tier 直接复用缓存，不再重新调用 `/api/pairing-bids/current`。

### 后端连接池

PBS Server 的 PostgreSQL pool 保留至少 1 条连接，避免启动时已经建立的连接在 30 秒 idle 后被全部释放。这样可以减少远程 DB 冷连接导致的首次读请求尖刺。

### 慢请求观测

现有 `onResponse` 只记录慢 mutation。调整为记录所有 `/api/` 慢请求，并在日志字段中保留 method、url、statusCode、elapsedMs，便于判断慢的是 GET 还是 mutation。

### Diagnostics 拆分

新增 `lineholder-summary-diagnostics.ts`：

- 导出 `buildLineholderSummaryDiagnostics()`。
- 集中保存 diagnostics 默认配置。
- `lineholder-summary-service.ts` 只负责读取数据、聚合 summary，然后调用 diagnostics builder。

## 测试计划

- 前端：
  - 补充 Tier 测试，验证已存在 `pairingPageDataQueryKey` 缓存时，点击 `View Pairing Set` 不再调用 `pairingService.getPageData()`。
  - 保留现有无缓存时懒加载 Pairing current draft 的测试。

- 后端：
  - 更新 diagnostics 单测导入路径。
  - 跑 `lineholder-summary-service.test.ts`，确认 diagnostics 输出不变。
  - 跑 PBS Server 测试和性能基线。

## 验收标准

- Tier 的 Pairing Set Preview 功能不变。
- 已缓存 Pairing current draft 时，Tier 不重复调用 `/api/pairing-bids/current`。
- PBS 后端慢 GET 会产生 warning 日志。
- `lineholder-summary-service.ts` 主流程更短、更清晰。
- `npm test` / lint / build / `perf:pbs` 按交付说明验证。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动跨前端和后端，但范围小、依赖顺序清楚，拆成多代理会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/tier/*`、`pbs-server/src/app.ts`、`pbs-server/src/plugins/database.ts`、`pbs-server/src/services/lineholder/*`、相关测试和文档。
- Conflict risk: 低。当前工作树干净，改动集中。
- Execution gate: 用户已确认按该范围实施。
