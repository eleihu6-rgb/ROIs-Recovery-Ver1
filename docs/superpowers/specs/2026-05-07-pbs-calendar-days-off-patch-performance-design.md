# PBS Calendar Days Off Patch 性能与错误返回修复设计

## 背景

`Days Off` 左侧日历保存时会调用：

`PATCH /api/calendar-days-off/current/dates`

用户在浏览器 Network 中看到该接口多次超过 2 秒，并出现一次 `500`。示例 payload：

```json
{
  "draftKey": "2",
  "bidId": 2,
  "periodCode": "Apr 2026",
  "bidContext": "Current",
  "draftVersion": 906,
  "changes": [
    { "date": "2026-04-01", "tier": "T2", "selected": true },
    { "date": "2026-04-15", "tier": "T2", "selected": true },
    { "date": "2026-04-22", "tier": "T2", "selected": true },
    { "date": "2026-04-29", "tier": "T2", "selected": true }
  ]
}
```

本地核对发现 `bidId=2` 当前 `draftVersion` 已经是 `908`，所以上述 payload 的正确业务结果应为 `409 Current draft has changed`，不应落成 `500`。

接口慢点主要来自后端 patch 链路做了多次数据库往返：

- 查询当前 bid。
- 查询该 bid 全量 day off。
- 更新 draft version。
- 查询当前 bid 下所有 specific pairing bid rows。
- 再去 live pairing 表加载 occurrences。
- 最后 insert/delete 并同步 tier。

对只有几个 `date + tier` 的增量 patch 来说，这条链路过重。

## 目标

- `PATCH /api/calendar-days-off/current/dates` 在正常小 payload 下稳定低于 2 秒。
- stale draft version 返回 `409`，不落成 `500`。
- pairing 冲突仍按 `date + tier` 精确拦截。
- 冲突请求不应产生部分写入。
- 不改变前端 payload 格式。
- 不改数据库结构，不新增 migration。
- 不改 full draft save 语义。

## 非目标

- 不重构 Days Off 页面交互。
- 不改 Pairing 页面逻辑。
- 不做 Pairing Search 性能专项。
- 不删除现有 full draft save 兼容接口。
- 不改变 current draft 的版本并发控制规则。

## 方案

### 1. PATCH 路由错误兜底

`calendar-days-off` route 继续优先识别 `LineholderBidServiceError`。

同时增加结构化兜底：

- 如果错误对象包含数值型 `statusCode` 和字符串 `message`，按该 status 返回。
- 这样即使 dev watch / 模块实例导致 `instanceof` 判断失效，409 这类业务错误也不会变成 500。

### 2. PATCH service 局部读取 existing day off

新增局部查询 helper，只加载 payload 涉及的 `date + tier`：

- 输入：`bidId` 和 normalized changes。
- 输出：`DayOffDatesByTier`。
- SQL 使用 `values (tier, date)` 与 `pbs_bid_day_off` join。

这样不用每次读取该 bid 的全量 day off。

### 3. pairing 冲突快速校验

新增 patch 专用冲突校验：

- 只接收本次 additions。
- 在 PBS schema 查当前 bid 下 same-tier `Pairing Number` specific-date rows。
- 在 live schema 的 `pairing` / `pairing_segment` 中直接判断 pairing occurrence 是否覆盖新增 Off 日期。
- 尽量用一条 SQL 完成，避免先查 bid rows 再二次加载 occurrences。

如果存在冲突，返回和现有逻辑一致风格的 `409` 文案。

### 4. 写入顺序

保留并发版本校验。

优化顺序：

1. 加载 current bid 并校验 draft version。
2. 局部查询 existing day off。
3. split additions/removals/unchanged。
4. 如无实际变化，直接返回，不 bump version。
5. 对 additions 做 pairing 冲突快速校验。
6. 确认无冲突后调用 `ensureCurrentBidByReference` bump version。
7. insert/delete/sync tier。

## 测试计划

后端测试：

- stale `draftVersion` 返回 `409`，不会被 route 转成 `500`。
- same-tier pairing 冲突返回 `409`。
- other-tier pairing 不阻止当前 tier day off。
- unchanged patch 不 bump version。
- patch service 不调用全量 day off helper 的旧路径；通过行为测试确保只对 payload changes 生效。

性能验证：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm run perf:pbs -- --base-url=http://localhost:3002 --samples=5 --budget-ms=2000
```

同时用用户给出的 payload 复测：

- stale version 预期 `409`。
- 当前 version 且 unchanged 预期 `200`，且耗时低于 2 秒。

## 验收标准

- 用户示例 stale payload 返回 `409`。
- 浏览器 Network 不再出现该业务错误的 `500`。
- `PATCH /calendar-days-off/current/dates` 小 payload 正常低于 2 秒。
- 相关后端测试通过。
- `pbs-server npm run build` 通过。
- `pbs-portal` 现有 Days Off 星期表头测试不回退。

