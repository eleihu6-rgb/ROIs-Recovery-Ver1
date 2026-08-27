# PBS Dashboard / Bootstrap 性能排查与优化实施计划

对应已批准设计：

- `docs/superpowers/specs/2026-08-20-pbs-dashboard-bootstrap-performance-design.md`

## 实施目标

用真实数据和真实页面网络瀑布定位 PBS Portal 慢接口原因，并对确认的热点做最小修复。优先级按真实用户感知排序，不把未被前端调用的组合接口误判为首屏关键路径。

## 已确认边界

- 不做 UI 视觉重设计。
- 不改业务语义、period 选择、bid 保存逻辑。
- 不盲加缓存、不盲加索引。
- 不放宽 2000ms p99 性能预算。
- 默认不做数据库 migration；只有 `EXPLAIN (ANALYZE, BUFFERS)` 证明缺索引才提出。
- 不处理当前工作区已有的 `rule-engine-rs` submodule dirty。
- 不自动提交 Git，除非用户明确要求提交。

## 阶段 0：基线与真实 UI 网络瀑布

目标：先确认真实页面到底调用哪些接口。

执行：

1. 运行后端性能脚本保留当前基线：

   ```bash
   pnpm --dir pbs-server perf:pbs -- --samples=5
   ```

2. 使用 Playwright 打开真实 PBS Portal：
   - `/pbs/dashboard`
   - `/pbs/bid`
3. 记录每个页面首屏 GET 请求：
   - URL
   - status
   - duration
   - 是否 200 / 304
   - 是否包含 `/api/portal/bootstrap`
4. 输出真实首屏慢接口排序。

完成条件：

- 明确 Dashboard / Bid 首屏实际网络瀑布。
- 明确 `/api/portal/bootstrap` 是否真实参与首屏。
- 如果真实 UI 与性能脚本热点不一致，后续优先级以真实 UI 为准。

## 阶段 1：服务内部阶段耗时拆分

目标：知道每个慢接口 2-3 秒花在哪个阶段。

范围：

- `GET /api/dashboard/summary`
- `GET /api/dashboard/profile`
- `GET /api/bidding-calendar/current`
- `GET /api/pairing-bids/current`
- `GET /api/portal/bootstrap`（仅作为组合接口指标）

执行：

1. 优先使用现有 route metrics / perf harness。
2. 如果现有信息不够，新增低开销开发诊断计时：
   - 只记录阶段名和耗时。
   - 不记录 SQL 原文、token、crew 敏感数据。
   - 不改变 API response。
3. 对以下阶段分别采样：
   - business clock
   - current period
   - profile / crew identity
   - live profile fields SQL
   - dashboard context SQL
   - pre-assigned duties SQL
   - day off capacity SQL
   - requested day off counts SQL
   - existing bid / current draft load

完成条件：

- 每个慢接口有阶段耗时表。
- 标出超过 500ms 的具体阶段。
- 没有证据的路径不进入修复。

## 阶段 2：SQL 证据与结果等价性

目标：证明慢点是不是 SQL/索引问题。

执行：

1. 对阶段 1 中超过 500ms 的 SQL 路径跑远端 PostgreSQL：

   ```sql
   EXPLAIN (ANALYZE, BUFFERS)
   ...
   ```

2. 如需 SQL rewrite，先做旧新结果 diff：
   - row count 一致。
   - key 字段一致。
   - 统计口径一致。
   - 空数据 / 无 bid / 无预占 duty 边界一致。
3. 如需 index，单独产出 migration 方案，先不直接执行线上库。

完成条件：

- 每个 SQL 修改都有 before / after plan。
- 没有结果不一致。
- 索引需求有明确 rows/buffers 证据。

## 阶段 3：最小修复

根据证据选择最小改动：

1. 如果是重复读取：
   - 在请求内复用 profile/current period。
   - 不改变返回结构。
2. 如果是 SQL 不可索引：
   - 改为 sargable predicate。
   - 保持 timezone 和 roster period 语义。
3. 如果是多个独立查询串行：
   - 安全改为 `Promise.all`。
   - 确认没有事务顺序依赖。
4. 如果是稳定私有 GET 重复请求：
   - 才考虑短 TTL cache 或已有 ETag 机制。
   - key 必须包含 crew / period / base / division 等维度。
5. 如果是缺索引：
   - 先提交 migration 文件和 schema mirror。
   - 是否执行 dev/SIT/UAT 数据库必须单独确认。

完成条件：

- 只修改被阶段 1/2 证明的热点。
- 不扩大到无关重构。
- API contract 不变。

## 阶段 4：验证

后端：

```bash
pnpm --dir pbs-server build
pnpm --dir pbs-server test
pnpm --dir pbs-server perf:pbs -- --samples=5
```

前端 / Playwright：

- Dashboard 首屏可见 user information、bid information、message center、calendar。
- Bid 首屏左侧 calendar、右侧 current bid 数据正常。
- 真实网络瀑布里慢接口耗时下降或原因可解释。
- 不出现接口错误 toast、空白页、布局裁切。

如果改前端样式：

```bash
npm run check:ui
```

## 回滚策略

- 纯诊断计时：可直接移除或关闭开关。
- 请求内复用 / 并发调整：回滚对应 service 改动。
- SQL rewrite：保留旧新 diff 和旧 SQL，可单独回滚。
- migration：必须有单独回滚说明，不和普通代码改动混在一起执行。

## 本轮执行顺序

1. 先跑 Playwright 网络瀑布，确认真实首屏接口。
2. 再拆后端阶段耗时。
3. 再对最慢 SQL 跑 `EXPLAIN`。
4. 最后只修证据最明确的一到两个热点。

## 本轮完成情况

已完成：

- 记录了后端性能基线和真实 PBS Portal Dashboard / Bid 页面网络瀑布。
- 确认真实页面当前未调用 `/api/portal/bootstrap`，首屏主要受 `dashboard/summary`、`dashboard/profile`、`bidding-calendar/current`、`pairing-bids/current` 影响。
- 优化 `dashboard/profile` 的 crew identity 查询，减少 live schema round trip。
- 优化 `dashboard/summary`，移除 Dashboard UI 已不使用的 Bid Package 统计查询，保留响应 contract。
- 优化 `bidding-calendar/current` 内部独立查询的并发等待。
- 缓存 planned absence source probe 的成功结果，减少重复空 SQL。
- 完成后端 build、后端全量测试、calendar focused 测试、PBS Portal 真实页面 Playwright smoke。

未在本轮处理：

- `GET /api/pairing-bids/current` 仍存在尾延迟尖峰，需要下一轮单独拆分 draft/catalog/reference option/current period 阶段耗时。
- `bidding-calendar/current` 冷启动或远端库冷缓存时仍可能出现 3-5 秒尖峰；热态和性能脚本采样已低于 2 秒预算，后续如继续优化，应重点看 day-off capacity SQL 和 specific pairing occurrence lookup 的执行计划。

数据库：

- 本轮没有新增 migration。
- 没有执行数据库写操作。
