# Pairing Current Draft 性能优化回归测试

## 背景

本用例覆盖 `GET /api/pairing-bids/current` 读取路径优化。优化目标是让 Pairing current draft 对齐 Lineholder 其他 bid 的 current period cache 读取方式，同时保持用户可见行为、API contract 和写入语义不变。

## 范围

- PBS Portal Bid 页面。
- Pairing current draft 读取。
- Configure Pairing Preference 弹窗。
- Pairing search / Filters 基本入口。
- open period 可写行为。
- closed period 只读行为。

## 非范围

- 不验证 Pairing Search SQL 性能。
- 不验证 `/api/portal/bootstrap`。
- 不验证视觉重设计。
- 不验证 save/delete/favorite/patch/tier 写入内部实现变更，因为本轮不允许修改这些写入函数。

## 前置条件

- 使用同一个 PBS 环境和同一个测试账号完成优化前后对比。
- 不在性能对比期间切换 PBS Business Time、导入数据、发布 Award 或切换 period。
- 确认 pbs-server 正常启动，`GET /api/health` 返回 200。

## 性能基线

执行：

```bash
pnpm --dir pbs-server perf:pbs -- --samples=5
```

记录：

- warm-up 运行结果不计入结论。
- measured run 1 的 `GET /api/pairing-bids/current` max / p99 / avg。
- measured run 2 的 `GET /api/pairing-bids/current` max / p99 / avg。
- 其他 endpoint 是否新增稳定超 2000ms。

## 2026-08-20 实际验证结果

优化前 measured baseline：

| 轮次 | Pairing current draft Max / P99 | Avg | 状态 |
| --- | ---: | ---: | --- |
| measured run 1 | 3732.4ms | 1499.27ms | SLOW |
| measured run 2 | 3089.72ms | 1583.08ms | SLOW |

优化后验证：

| 轮次 | Pairing current draft Max / P99 | Avg | 状态 |
| --- | ---: | ---: | --- |
| warm-up | 1185.46ms | 904.58ms | OK |
| measured run 1 | 1146.42ms | 902.6ms | OK |
| measured run 2 | 1143.1ms | 890.15ms | OK |

说明：

- `GET /api/pairing-bids/current` 两轮正式采样均低于 2000ms p99 预算。
- warm-up 轮中 `/api/dashboard/summary` 曾出现一次 2269.85ms，导致整套 perf 脚本 exit 1；后续两轮正式采样该 endpoint 恢复到 2000ms 内。本轮优化范围未修改 Dashboard summary。
- Playwright 首次运行发现 `pairing-search.spec.ts` 仍使用过期的测试账号和 `rosterPeriodId=38`，当前开发环境 active Jun 2026 period 为 `rosterPeriodId=6`。已将该 E2E 前置数据更新为当前有 T1 Pairing bid 的账号 19 和 active period 6。

自动化验证：

| 命令 | 结果 |
| --- | --- |
| `DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/pairing/pairing-bid-service.test.ts src/services/lineholder/current-period-bid.test.ts src/routes/pairing-bids.test.ts` | PASS, 118 passed |
| `pnpm --dir pbs-server build` | PASS |
| `pnpm --dir pbs-server test` | PASS, 867 passed, 2 skipped |
| `pnpm --dir e2e exec playwright test --config=config/playwright.config.ts --project=pbs-portal e2e/tests/pbs-portal/pairing-search.spec.ts` | PASS, 13 passed, 1 skipped |
| `pnpm --dir e2e exec playwright test --config=config/playwright.config.ts --project=pbs-portal e2e/tests/pbs-portal/pairing-preference.spec.ts e2e/tests/pbs-portal/pairing-closed-period-readonly.spec.ts e2e/tests/pbs-portal/pairing-search.spec.ts` | PASS, 24 passed, 1 skipped |

## 人工回归步骤

1. 登录 PBS Portal。
2. 打开 Bid 页面。
3. 确认 Pairing 相关 existing bid 能正常加载。
4. 确认已有 Pairing property 的名称、tier badge、selected pairing 数量没有异常。
5. 打开 `Configure Pairing Preference`。
6. 确认搜索框可输入，pairing 列表可见。
7. 点击 `Filters`，确认 filter dialog 可打开和关闭。
8. 在 open period 下确认 Pairing dialog 的保存按钮状态正常，可以执行一次低风险保存或保持现有 draft 不变。
9. 切换到 closed period 或使用 closed period 测试环境，确认 Pairing 页面保持 read-only，不能保存。
10. 回到 Bid 页面，确认没有 loading 卡住、空白页、弹窗无法关闭或错误 toast 循环。

## 通过标准

- `GET /api/pairing-bids/current` 优化后尾延迟低于优化前两轮 measured baseline，目标 max / p99 不超过 2000ms。
- Bid 页面 Pairing tab 正常加载。
- Configure Pairing Preference 正常打开、关闭、搜索和展示列表。
- existing bid 的 property / tier / selected pairing 展示不变。
- favorite 入口仍存在。
- open period / closed period 行为不变。
- 没有新增数据库 migration，除非另有批准和 `EXPLAIN` 证据。
