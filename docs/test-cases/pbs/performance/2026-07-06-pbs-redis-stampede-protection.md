# PBS Redis 防击穿测试用例

- 日期：2026-07-06
- 模块：`pbs-server`
- 功能：Redis cache-aside 防击穿与 resource 级指标
- 关联设计：`docs/superpowers/specs/2026-07-06-pbs-redis-stampede-protection-design.md`

## 前置条件

- `pbs-server` 已连接 PBS 专用 Redis。
- `pbs-server` 已连接远端权威 PostgreSQL。
- `pbs-portal` 可正常登录并访问 Pairing 页面。
- `/metrics` 按环境要求配置 token。
- 测试前只清理 PBS pairing-search 测试 key，不清理其它业务 Redis key：

```bash
redis-cli --scan --pattern 'pbs:*:pairing-search:*' | xargs -r redis-cli del
```

## 自动化验证

在仓库根目录执行：

```bash
cd pbs-server
npm test
npm run build
```

预期：

- 所有 `PbsCache` 默认 cache-aside 测试通过。
- 开启 `stampedeProtection` 后，同 key 并发请求只触发一次 loader。
- 跨两个 `PbsCache` 实例的同 key 并发请求通过 Redis 短锁折叠。
- lock 获取失败、release 失败、等待超时均能 fallback 到 DB loader。
- pairing-search 的 `preview`、`current-rules-counts`、`current-rules-tier-pools`、`airport-options` 并发测试只触发一次对应 DB 查询。

## 真实 UI 回归

执行：

```bash
cd e2e
GANTT_BASE_URL=https://disabled npx playwright test tests/pbs-portal/pairing-search-perf.spec.ts --config=config/playwright.config.ts --project=pbs-portal --reporter=list --no-deps
```

预期：

- 用户可登录 PBS Portal。
- Pairing 页面可点击 `SEARCH PAIRINGS`。
- `/api/pairing-search/preview` 返回 200。
- 页面 footer 的 `Total N items` 与接口 `data.summary.totalItems` 一致。
- 页面无明显卡死或错误 toast。

## 并发冷 key 手工验证

步骤：

1. 清理 `pbs:*:pairing-search:*` 测试 key。
2. 使用同一登录用户、同一 base、同一 period、同一 preview payload 发起 20 个并发 `POST /api/pairing-search/preview`。
3. 记录总耗时、p50、p90、max。
4. 查看 `/metrics`。

预期：

- 20 个请求均成功返回。
- 同 key 冷并发不再全部打 DB。
- 指标中出现 `lock_acquired`。
- 同进程并发时应出现 `local_join`。
- 跨实例或模拟多 cache 实例时应出现 `lock_contended` 与 `wait_hit`。
- 不应出现持续增长的 `wait_timeout`；如果有，说明 `waitTimeoutMs` 可能需要按真实查询耗时调整。

## 指标验收

`/metrics` 应出现类似指标：

```text
rois_pbs_server_cache_resource_miss_total{cache_group="pairing-search",cache_resource="preview",mode="singleflight"}
rois_pbs_server_cache_resource_hit_total{cache_group="pairing-search",cache_resource="preview",mode="singleflight"}
rois_pbs_server_cache_stampede_total{cache_group="pairing-search",cache_resource="preview",outcome="lock_acquired"}
rois_pbs_server_cache_stampede_total{cache_group="pairing-search",cache_resource="preview",outcome="local_join"}
rois_pbs_server_cache_stampede_total{cache_group="pairing-search",cache_resource="preview",outcome="wait_hit"}
```

禁止出现高基数 label：

- crew id
- user code
- pairing id
- raw query
- period code
- request hash
- JWT / token

## 回归范围

- Pairing Search preview
- Current Rules counts
- Current Rules tier pools
- Airport options
- Actor context lookup
- PBS Redis fallback 行为
- `/metrics` token 保护

## 异常场景

| 场景 | 预期 |
| --- | --- |
| Redis get 失败 | 接口仍返回 DB 查询结果 |
| Redis set 失败 | 接口仍返回 DB 查询结果 |
| Redis lock 获取失败 | 接口 fallback DB 查询 |
| Redis lock release 失败 | 接口成功返回，锁依赖 TTL 自动过期 |
| 等待缓存回填超时 | 接口 fallback DB 查询，不无限等待 |
| cached JSON 损坏 | 删除坏 key，fallback DB 查询 |
