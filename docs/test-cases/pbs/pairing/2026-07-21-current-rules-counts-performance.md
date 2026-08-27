# Current Rules Counts 性能与语义回归

- 日期：2026-07-21
- 接口：`POST /api/pairing-search/current-rules/counts`
- UI：`/pbs/bid`
- 自动化：`e2e/tests/pbs-portal/pairing-search-perf.spec.ts`

## 1. 验证目标

- 用户 19 的真实 7 条 Pairing properties 在 10 秒内返回。
- 返回的 rule、funnel、summary 与优化前捕获基线一致。
- 20 条包含 Pairing Preference、Airport Preference、Check-In / Check-Out 和 Flight Legs per Duty 的代表性重条件满足 median `< 8s`、max `< 10s`。
- 5 个相同冷 key 并发请求全部在 10 秒内成功。
- Bid 页面不显示 `Try refresh again`。

## 2. 冷请求定义

只替换每条 property 的 `propertyGroupKey` 为新的合法 UUID，其他 property 顺序、propertyCode、tiers、action、quantifier 和 bid payload 保持不变。这样可绕过 result cache，同时不改变业务条件或 SQL 工作量。不清理远端 PostgreSQL shared buffers。

## 3. 自动化场景

### PBS-3503：真实 7 条规则

1. 使用用户 19 登录真实 PBS API。
2. 读取 Jun 2026 当前 Pairing draft，确认 7 条 properties。
3. 连续发出 5 个 application-cold counts 请求。
4. 断言 propertyCode 顺序为 `102, 102, 168, 103, 103, 107, 107`。
5. 断言 rule pairing counts 为 `3, 2, 4, 34, 15, 13, 16`。
6. 断言 funnel pairing counts 为 `0, 2, 0, 0, 0, 0, 0`，active count 为 6，allRules 为 0。
7. 每次请求必须 HTTP 200 且小于 10 秒。

### PBS-3502：20 条重条件与并发

1. 构造 5 条 Pairing Preference、5 条 Airport Preference、5 条 Check-Time、5 条 Flight Legs。
2. 连续执行 5 个 application-cold 请求，记录原始 duration。
3. 断言 median `< 8s`、max `< 10s`、rows 和 active count 均为 20。
4. 生成一个新的相同冷 payload，并发发出 5 次。
5. 断言每个请求均 HTTP 200、响应 contract 正确且小于 10 秒。

### PBS-3504：真实 UI

1. 使用用户 19 登录 PBS Portal。
2. 进入 `/pbs/bid`。
3. 捕获页面真实发出的 counts 请求。
4. 断言 HTTP 200、耗时小于 10 秒。
5. 断言 counts summary 可见，且不显示 `Try refresh again`。

## 4. 运行命令

```bash
cd e2e
npx playwright test tests/pbs-portal/pairing-search-perf.spec.ts \
  --config=config/playwright.config.ts \
  --project=pbs-portal \
  --grep 'PBS-3502|PBS-3503|PBS-3504' \
  --no-deps --workers=1
```

## 5. 本次实测结果

- 7 条真实规则：`3603 / 3633 / 3636 / 3662 / 3947 ms`。
- 20 条重条件：`5897 / 5915 / 5924 / 6006 / 6343 ms`，median `5924 ms`，max `6343 ms`。
- 5 并发相同冷 key：全部 HTTP 200 且小于 10 秒。
- 真实 Bid UI：PASS，未出现刷新错误。
