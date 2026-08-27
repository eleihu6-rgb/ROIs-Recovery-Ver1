# PBS Month-End Carryover Base 时区修复实施计划

## 1. 建立回归与基线

- 在 `pbs-server` 与 `live-server` 的 Pairing condition builder 测试中加入 Base 当地日期断言。
- 记录 `YYZ + IFD + Jun 2026 + Carryover = 1` 修改前远端结果与执行计划。
- 确认 `T4582` 当前错误命中。

## 2. 修复两套条件构建器

- 在两套 `pairing-search-core-conditions.ts` 中按相同 SQL 结构解析 Pairing Base 时区。
- 将 UTC wall-clock 转换到 Base 当地日期。
- 每个 Pairing 只计算一次 `carry_out_days`，再应用 `>= 1` 与用户比较符。
- 保留 UTC fallback；`live-server` 保留 legacy stepper 兼容。

## 3. 缓存与入口对齐

- 升级 `PAIRING_SEARCH_CACHE_VERSION`。
- 升级 `SINGLE_PROPERTY_PREVIEW_CACHE_VERSION`。
- 验证单条件、Criteria、Current Rules PREVIEW、counts 与 tier pools。
- 验证 `live-server` 生产 `PAIRING_SCORE.csv` 入口。

## 4. 自动化与 QA

- 运行两套 condition builder、generated SQL、service 和 algorithm export 测试。
- 更新真实 PBS Portal Playwright 回归。
- 新增 QA 文档。

## 5. 远端验证

- 两套 generated SQL 远端 preflight。
- 修改后核对 `T4582` 不属于 Award 集合，属于 Avoid 补集。
- 运行修改后 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` 并与基线比较。
- 验证生产算法导出压缩包与 `PAIRING_SCORE.csv`。
