# PBS Current 接口可靠性与性能优化设计

## 背景

用户反馈 PBS Portal 体验很差，以下接口经常超时或报错，严重影响 Bid / Bid Feedback 页面使用：

- `GET /api/bid-feedback/current`
- `GET /api/lineholder-bids/current/summary`
- `GET /api/bidding-calendar/current`
- `GET /api/days-off-bids/current`
- `GET /api/line-bids/current`

本次目标不是简单增大前端 timeout，而是让主流程更快、更稳，并避免单个昂贵子能力拖垮页面。

## 当前证据

在本地 `pbs-server :3002`、远端 DEV DB `f8_dev_*`、crew `73` 上做真实接口测量：

- 同时请求 5 个目标接口时，第一轮总耗时 `160734ms`。
- 最重接口是 `GET /api/bid-feedback/current`：
  - 第一轮 `160734ms`
  - 返回体约 `238KB`
  - 后续热缓存轮次可降到 `1190ms`、`324ms`
- 同一轮其他接口：
  - `lineholder summary`: `1797ms`
  - `bidding calendar`: `3539ms`
  - `days off current`: `2955ms`
  - `line current`: `2039ms`
- Prometheus metrics 中 `bid-feedback/current` 和 `bid-feedback/current/conflicts` 已出现多次超过 `10s` 的请求。

结论：问题不是服务不可达；`health` 约 `6ms`。主要是冷启动/冷缓存、重复 current period/draft 计算，以及 Bid Feedback eligibility 全量同步计算。

## 问题

1. `bid-feedback/current` 把“快速反馈展示”和“所有 Award Pairing 的法规 eligibility 检查”绑在同一个请求里。
2. Eligibility 会逐个 pairing 调 Rust rule runner，当前并发为 4；当 Award pairing 很多时，第一个请求可被拉到分钟级。
3. 前端 10 秒 timeout 下，分钟级请求必然表现为超时或失败。
4. `days-off/current`、`line-bids/current` 目前没有 private ETag；重复进入页面仍会全量取数。
5. `portal/bootstrap` 已合并 profile/calendar/summary，但内部 `Promise.all` 没有局部降级；任一子服务失败会整体失败。
6. 多个页面/组件同时发 current 请求时，后端虽然有部分 current period 缓存，但缺少面向“同一 crew + period + draftVersion”的完整响应缓存和前端共享复用。

## 设计目标

- 主页面和 Bid Feedback 弹窗打开不再被 `bid-feedback/current` 全量 eligibility 阻塞。
- 目标接口在正常 DEV 远端 DB 环境下：
  - 常规 current 接口 warm p95 控制在 `2s` 内。
  - Bid Feedback 主接口 cold 不超过前端 timeout，目标 `<= 2s-5s`。
  - Eligibility 子能力失败或超时不会让 Bid Feedback 主弹窗报错。
- 保持 `{ code, data, message }` 响应壳不变。
- 不改变已有 Bid 数据保存、DAYSOFF.csv 导出、ruleset 规则含义。
- 认证失败、权限失败、current period 真缺失仍返回明确错误；可选/昂贵数据失败则降级。

## 推荐方案：快速主接口 + Eligibility 懒加载 + 缓存降级

### 1. 拆开 Bid Feedback 主数据与 Eligibility

保留 `GET /api/bid-feedback/current` 作为主接口，但它不再同步全量跑 rule eligibility。

主接口返回：

- `pairings`
- `daysOff`
- `conflicts`
- `draftVersion`
- `eligibilityLabel`
- Award pairings 的 `eligibility` 初始为 `unknown`，或使用服务端已有缓存命中的结果。

新增一个窄接口：

- `GET /api/bid-feedback/current/eligibility?pairingIds=...`

行为：

- 只检查当前可见/选中的 Award pairings。
- 对单次 pairing 数量设上限，例如 `20`。
- 每个 `crewId + rosterPeriodId + draftVersion + pairingId + rulesetId` 缓存 eligibility。
- 单 pairing rule runner 失败时返回该 pairing `unknown`，不让整个接口 500。
- 整体超时则返回已完成结果 + 未完成项 `unknown`。

前端行为：

- 打开 Bid Feedback 时先展示主接口结果，弹窗不能因为 eligibility 卡住。
- Award 列表先显示空/unknown；eligibility 子接口回来后显示 `✓ / ✗`、`Eligible / PASS`、`Not eligible / FAIL` 和 reason。
- 子接口失败时保持 `Eligibility unavailable`，不关闭弹窗、不让主内容报错。

### 2. 给 `days-off/current` 与 `line-bids/current` 加 private ETag

`bidding-calendar/current` 和 `lineholder summary` 已经使用 `sendPrivateJsonWithEtag`。

本次把以下 GET 也改为 private ETag：

- `GET /api/days-off-bids/current`
- `GET /api/line-bids/current`

语义：

- `Cache-Control: private, no-cache`
- `If-None-Match` 命中返回 `304`
- 不改变正常 `200` 的 `{ code, data, message }`。

### 3. 增加 current 响应级缓存

对稳定的 current GET 做短 TTL 缓存：

- `lineholder summary`
- `bidding calendar`
- `days-off current`
- `line current`
- `bid-feedback current`

建议 key：

- `crewId`
- `rosterPeriodId`
- `draftVersion`
- `schema`
- 对 calendar 额外包含 matcher/config identity

TTL：

- `60s-300s`
- 保存/新增/删除 bid property 后主动 invalidation，或依赖 draftVersion 变化自然换 key。

### 4. 降级而不是整体失败

对聚合接口和 Bid Feedback：

- `portal/bootstrap` 改成子服务局部 try/catch 或 `Promise.allSettled`。
- 可选块失败时返回局部 `warnings` 或 `unavailable` 标记。
- 不把非关键子数据失败包装成整个页面 500。

硬错误仍保留：

- 未登录 / token 无效：`401`
- 无 current period：明确业务错误
- draft version 变更：`409`
- 入参非法：`400`

## 备选方案

### 方案 B：只加 SQL/index/cache，不拆 Eligibility

优点：接口契约变化小。

缺点：无法解决 `bid-feedback/current` 逐个 pairing 跑法规的分钟级冷请求；即使 SQL 快，rule runner 仍然会拖垮主接口。

不推荐作为主方案。

### 方案 C：只增大前端 timeout / 自动 retry

优点：改动最少。

缺点：用户仍然等几十秒到几分钟；并发 retry 还可能放大后端压力。

不推荐。

## 实施范围

后端：

- `pbs-server/src/routes/bid-feedback.ts`
- `pbs-server/src/services/bid-feedback/*`
- `pbs-server/src/routes/days-off-bids.ts`
- `pbs-server/src/routes/line-bids.ts`
- `pbs-server/src/routes/portal-bootstrap.ts`
- 必要时扩展 `packages/contracts/pbs-bid-feedback.*`

前端：

- `pbs-portal/src/features/bid/hooks/use-bid-feedback.ts`
- `pbs-portal/src/shared/services/bid-feedback-service.ts`
- `pbs-portal/src/features/bid/components/bid-feedback-dialog.tsx`
- 必要时更新 shared query defaults 或页面 query key。

测试：

- pbs-server route/service 单测覆盖：
  - Bid Feedback 主接口不等待 eligibility。
  - eligibility 子接口按 pairingIds 返回并可局部降级。
  - days-off/line current 支持 ETag 304。
  - portal bootstrap 子服务失败不整体 500。
- pbs-portal 单测覆盖：
  - Bid Feedback 先显示主内容，再补 eligibility。
  - eligibility 失败时保持 unavailable。
- E2E 覆盖：
  - 模拟慢 eligibility，弹窗仍快速打开。
  - 模拟 eligibility 失败，主弹窗不崩。
- 性能验证：
  - 运行 `pbs-server` perf baseline。
  - 专测 crew 73 的 5 个目标接口并发打开耗时。

## 验收标准

- `GET /api/bid-feedback/current` 不再出现分钟级等待。
- crew 73 并发请求 5 个目标接口时，主内容总等待从 `160s` 降到秒级。
- Eligibility 慢或失败时，用户仍能看到 Bid Feedback 主数据。
- 目标接口不因可选子数据失败返回 500。
- 现有 UI 中 `✓ / ✗ / Eligible / PASS / Not eligible / FAIL / reason` 在 eligibility 返回后继续可见。
- 所有改动有自动化回归；必要时补 QA 测试用例。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次瓶颈集中在 Bid Feedback contract、后端 service、前端同一弹窗数据流，文件边界强耦合；并行开发容易产生契约冲突。
- Suggested split: 不建议拆并行。可以先后端主路径与 eligibility 子接口，再前端接入，再测试。
- Write boundaries: 单 agent 串行更稳。
- Conflict risk: 中等，尤其是 contract、query key、测试 mock。
- Execution gate: 本 spec 经用户确认后实施。
