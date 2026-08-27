# PBS Pairing Search Redis 缓存人工测试

- 日期：2026-07-06
- 模块：`pbs-server` / PBS Portal Pairing Search
- 变更：Pairing Search Phase 2 Redis cache-aside

## 前置条件

- `pbs-server` 已配置 PBS 专用 Redis，并能成功启动。
- PBS Portal 可登录并访问 Pairing 页面。
- 测试账号有有效的 `crewId`、`userCode`、base 和 rank。
- `/metrics` 端点可访问，且需要按当前环境认证策略访问。

## 操作步骤

1. 启动 `pbs-server`，确认日志出现 `PBS Redis connected`。
2. 登录 PBS Portal，进入 Pairing 页面。
3. 打开浏览器 Network 面板，清空已有请求。
4. 选择一个 bid period，点击 `SEARCH PAIRINGS`。
5. 等待 `POST /api/pairing-search/preview` 返回 200，并确认页面 footer 的 `Total N items` 正常显示。
6. 不修改任何筛选条件，再次点击 `SEARCH PAIRINGS`。
7. 访问 `/metrics`，检查 `pairing-search` 相关 hit/miss 指标。
8. 修改 page、page size、period 或规则条件后，再次搜索。

## 预期结果

- 第一次相同搜索产生 `rois_pbs_server_cache_miss_total{cache_group="pairing-search",mode="single"}` 增量。
- 第二次相同搜索产生 `rois_pbs_server_cache_hit_total{cache_group="pairing-search",mode="single"}` 增量。
- 页面展示结果、total item 数量和接口响应保持一致。
- 修改 page、page size、period、base/rank 或搜索条件后，应重新 miss，不复用旧结果。
- Redis 不可用时接口仍回源 DB，页面不因缓存失败报 500。

## 异常与边界场景

- 不同 crew/base/rank 使用同样搜索条件时，结果不能互相串用。
- `current-rules/counts` 和 `current-rules/tier-pools` 在 30 秒 TTL 内重复请求可以命中缓存。
- `airport-options` 在同 base + period 下重复请求可以命中缓存。
- 校验失败或权限失败不应写入缓存。

## 回归范围

- PBS Portal Pairing 页面 `SEARCH PAIRINGS`。
- Pairing 页面 Current Rules counts / tier pools。
- Pairing airport options 下拉。
- `/metrics` 的 cache hit/miss/error 指标。
