# PBS Server `/metrics` 认证修复设计

- 日期：2026-07-06
- 模块：`pbs-server`
- 范围：`GET /metrics` 认证顺序修复

## 背景

PBS Server 第一阶段 Redis 缓存已经写入远端 Redis，并产生 `rois_pbs_server_cache_*` Prometheus 指标。但真实访问 `/metrics` 时返回 `401`，原因是全局 JWT `authPlugin` 在 `metricsPlugin` 的 `METRICS_TOKEN` 校验之前拦截了请求。

`/metrics` 是监控系统读取服务运行指标的端点，不代表 PBS Portal 业务用户。它不应依赖 crew/admin 用户 JWT，而应使用监控专用 `METRICS_TOKEN`。

## 方案

采用最小改动：

- 将 `GET /metrics` 加入 `authPlugin` 的公开路由白名单，使其跳过业务 JWT。
- 保留 `metricsPlugin` 现有 `METRICS_TOKEN` 校验。
- 不改变普通 `/api/*` 业务接口的 JWT 认证要求。

## 验收标准

- 配置了 `METRICS_TOKEN` 时，未带 metrics token 请求 `/metrics` 不再返回业务 JWT 的 `401`，而由 `metricsPlugin` 返回 `403`。
- 配置了 `METRICS_TOKEN` 时，带正确 `X-Metrics-Token` 或 `Authorization: Bearer <metrics-token>` 请求 `/metrics` 返回 `200`。
- `/metrics` 响应中能看到 `rois_pbs_server_cache_hit_total` / `rois_pbs_server_cache_miss_total` 等缓存指标。
- 普通业务 API 未带 JWT 时仍返回 `401`。
- `pbs-server` 自动化测试和 build 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单点认证白名单修复，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server/src/plugins/auth.ts` 和相关测试。
- Conflict risk: 低。
- Execution gate: 用户已确认“那是要改”后实施。
