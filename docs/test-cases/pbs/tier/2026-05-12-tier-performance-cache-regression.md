# PBS Tier 性能缓存回归测试案例

> 更新：2026-07-20 起，`/tier` 不再显示底部 `BID SUMMARY`。本文中的 Pairing Set 缓存回归仍适用于 `PAIRING POOLS` 的 `View Set` 入口。

## 测试目标

验证 `/tier` 的 `View Pairing Set` 复用 Pairing current draft 缓存，减少重复调用 `/api/pairing-bids/current`；同时验证 PBS 后端读接口慢请求可被观测。

## 前置条件

- PBS Portal 可进入 `/tier`。
- 当前 Lineholder draft 至少有一个 Pairing bid。
- 浏览器 DevTools Network 可查看 XHR 请求。
- PBS Server 日志可查看 warning 级别日志。

## 场景 1：已有 Pairing 缓存时打开 Tier Pairing Set

1. 打开 `/pairing`，等待 `GET /api/pairing-bids/current` 完成。
2. 在 60 秒内切换到 `/tier`。
3. 点击 T1 或其他有 Pairing bid 的 `View Pairing Set`。

预期结果：

- 页面打开 `Pairing Set Preview`。
- Network 中不应因为这次点击再次出现新的 `GET /api/pairing-bids/current`。
- 可以看到 `/api/pairing-search/preview` 用于生成 preview 结果。

## 场景 2：无 Pairing 缓存时打开 Tier Pairing Set

1. 刷新页面或清空缓存后直接进入 `/tier`。
2. 点击有 Pairing bid 的 `View Pairing Set`。

预期结果：

- 页面先加载 preview，然后显示 Pairing Set Preview 结果。
- Network 中允许出现一次 `GET /api/pairing-bids/current`，用于懒加载 Pairing current draft。
- 同一次 overlay 内切换分页或重试时，不应重复请求 current draft，除非缓存过期或被主动失效。

## 场景 3：慢读接口日志

1. 让 PBS Server 空闲一段时间。
2. 打开 `/tier` 或 `/pairing` 触发读接口。
3. 观察 PBS Server 日志。

预期结果：

- 当任意 `/api/` 请求耗时超过 2 秒时，日志出现 `Slow PBS API request`。
- 日志包含 `method`、`url`、`statusCode`、`elapsedMs`。
- GET 请求和 mutation 请求都能被记录。

## 回归范围

- `/tier` 的 `PAIRING POOLS`、pool review messages、`View Pairing Set` 功能保持可用；bid 配置类 `BID REVIEW` 在 `/bid` 验证。
- `/pairing` 页面 current draft 加载、添加、修改、删除、收藏功能不受影响。
- `/api/pairing-bids/current` 响应结构不变。
