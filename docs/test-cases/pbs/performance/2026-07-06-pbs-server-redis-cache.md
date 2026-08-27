# PBS Server Redis 缓存测试用例

- 日期：2026-07-06
- 模块：`pbs-server`
- 范围：Phase 1 Redis cache-aside 基础设施、property catalog 缓存、current period 缓存

## 前置条件

- `pbs-server` 已配置 `REDIS_PBS_URL`，指向 PBS 专用 Redis。
- `pbs-server` 和 `pbs-portal` 使用同一 UAT / 本地测试环境。
- 测试账号可以正常登录 PBS Portal。
- Redis 中不要预置同名 `pbs:*` key，或测试前清理 PBS namespace。

## 自动化回归

1. 在 `pbs-server` 目录运行 `npm test`。
2. 在 `pbs-server` 目录运行 `npm run build`。
3. 如涉及 portal 可见流程，运行 PBS Portal 导航 smoke / 登录后 dashboard 流程。

预期结果：

- 测试全部通过。
- 携带正确 `METRICS_TOKEN` 访问 `/metrics` 时，能看到 `rois_pbs_server_cache_hit_total` 和 `rois_pbs_server_cache_miss_total`。
- Redis 连接失败不会让运行中的 GET 读路径因为 cache get/set 失败而返回 500。

## 手工验证：Redis 正常

1. 启动 PBS 专用 Redis。
2. 启动 `pbs-server`。
3. 登录 PBS Portal。
4. 进入 Dashboard、Pairing、Line、Days Off、Reserve 页面。
5. 重复刷新或在页面间切换两次。
6. 通过 Redis CLI 或 metrics 检查 `pbs:<schema>:*:property-catalog:*` 和 `pbs:<schema>:period:current:*` key。

预期结果：

- 页面正常加载。
- 第一次访问产生 cache miss，后续重复访问产生 cache hit。
- Redis key 带 `pbs:<schema>:` 命名空间。
- key 有 TTL。

## 手工验证：TTL 回源

1. 选择一个 `period:current` key。
2. 等待 60 秒以上，或手动删除该 key。
3. 再次刷新 Dashboard 或任一 bid 页面。

预期结果：

- 页面正常加载。
- 删除或过期后会重新回源 DB，并回填 Redis。

## 手工验证：运行中 Redis 短暂不可用

1. 在 `pbs-server` 已启动且页面可正常访问后，临时停止 Redis。
2. 刷新 Dashboard 或 bid 页面。
3. 恢复 Redis。
4. 再次刷新页面。

预期结果：

- Redis 停止期间，读路径不应因为 cache get/set 失败而返回 500。
- Redis 恢复后，后续请求可重新写入缓存。
- 服务日志可看到 Redis cache 错误，但不应输出带密码的 Redis URL。

## 手工验证：启动依赖

1. 停止 Redis。
2. 启动 `pbs-server`。

预期结果：

- 如果当前发布策略要求 Redis 启动强依赖，`pbs-server` 应启动失败并报告 Redis 连接错误。
- 如果后续引入 disabled adapter，需按对应策略验证服务可启动但 cache metrics 显示不可用状态。

## 回归范围

- PBS Dashboard bootstrap。
- Pairing / Line / Days Off / Reserve 当前 bid 页面。
- Lineholder summary。
- 登录和登出不应产生 Redis token/password 缓存。
