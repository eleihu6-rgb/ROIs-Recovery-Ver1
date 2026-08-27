# PBS Standing Bid 算法导出兜底实施计划

## 目标

在不改变算法压缩包和 CSV 契约的前提下，让空 Current 的 crew 使用完整 Standing 兜底。

## 实施步骤

1. 新增有效 Bid 来源 scope 与 resolver。
   - Current 有 `pbs_bid_group` 或 `pbs_bid_day_off` 时选择 Current。
   - Current 为空时选择 `StandingLineholder` 与 `StandingReserve`。
   - Favorite 不参与判定。
2. 普通、YEG 14、Scenario 三个导出入口统一解析来源 scope。
3. 四个 CSV loader 按 resolver 返回的稳定 bid id 查询，不再自行判断 context。
4. 更新候选 crew/filter 查询，使 Standing-only crew 不被提前过滤。
5. 补 resolver、各 CSV、filter 和 archive 回归测试。
6. 运行聚焦 Vitest、live-server build、远端 PostgreSQL `EXPLAIN` 和真实 HTTP `.tgz` smoke。

## 验收

- Current 非空：只导出 Current。
- Current 为空：同时使用两个 Standing context。
- Favorite-only：使用 Standing。
- 五文件结构、表头、Tier Counter 和算法格式不变。
- Current/Standing 不重复计数。
- 所有导出入口使用相同规则。
