# PBS Pairing 本地日期 Period Filter 修复设计

## 背景

在 Pairing 页面使用 `ALL PAIRINGS` 查看 `Jun 2026` 时，页面出现了 `T4527` 这类 duty date 显示为 `0531` 的 pairing。当前后端部分查询使用 `p.sch_str_dt_utc` 的 UTC 月份判断 pairing 是否属于目标 bid period，而页面展示和用户理解是按组员 base 时区显示日期，例如 YYZ 组员应按 YYZ 本地时间判断。

这会造成同一条 pairing 在后端过滤口径上属于六月，但在页面展示口径上属于五月底，用户看到的结果与 bid period 不一致。

## 目标

- Pairing 相关搜索和候选结果，凡是使用 `periodCode` 限制月份，都按组员 base 时区的本地 origin/start date 判断。
- `Jun 2026` 下不应出现本地 origin date 为 `2026-05-31` 的 pairing。
- 本地 origin date 为 `2026-06-01` 的 pairing，即使 UTC 时间仍落在五月，也应被包含在 `Jun 2026`。
- `ALL PAIRINGS`、Pairing Number 搜索、Specific Date occurrence、机场候选等 Pairing 页面入口保持一致口径。

## 范围

本次修复聚焦 PBS Portal Pairing 搜索链路，对应后端在 `pbs-server/src/services/pairing-search/` 下的查询逻辑。

应覆盖：

- `ALL PAIRINGS` preview 列表和总数。
- 当前规则 / 临时条件 preview 的 period filter。
- 当前规则 counts / tier pools 的 period filter。
- Pairing Number autocomplete 的 period filter 和选项日期展示。
- Pairing occurrences / details 的 period 判断。
- 机场候选项查询中受 period 限制的 pairing 集合。

不在本次范围：

- 旧导入数据兼容或批量数据迁移。
- 改变 pairing 本身的存储字段。
- 改变页面日历如何渲染跨月占用。
- 修改非 Pairing 模块的日期过滤规则。

## 业务口径

`periodCode` 表示用户正在操作的 bid period。对组员来说，pairing 是否属于该 period，应按组员 base 时区看到的 pairing origin/start date 判断，而不是按 UTC 日期判断。

示例：

- YYZ 组员，pairing UTC start 是 `2026-06-01 00:30:00`。
- YYZ 本地时间仍是 `2026-05-31 20:30:00`。
- 该 pairing 的 origin date 应视为 `2026-05-31`，不属于 `Jun 2026` 的可选 pairing。

## 推荐方案

新增或复用一个统一的 SQL 片段/工具函数，用于计算 pairing 的 base-local origin date：

```sql
(coalesce(first_segment_start, p.sch_str_dt_utc) at time zone actor_zone.zone_id)::date
```

其中：

- `actor_zone.zone_id` 来源于组员 base 对应 airport 的 `zone_id`，缺失时回退 `UTC`。
- `first_segment_start` 优先使用 `min(coalesce(s.brief_start_utc, s.sch_str_dt_utc))`。
- 所有 period filter 使用该 local origin date 与 period start/end date 比较。

优先改造现有 pairing search 查询，避免每个入口手写不同的时区逻辑。若抽公共 helper 会导致改动过大，可以先在同一服务目录下建立小型 SQL builder 方法，逐步替换当前 UTC 过滤点。

## 需要调整的主要文件

- `pbs-server/src/services/pairing-search/pairing-search-preview-query.ts`
- `pbs-server/src/services/pairing-search/pairing-id-search-query.ts`
- `pbs-server/src/services/pairing-search/pairing-occurrence-query.ts`
- `pbs-server/src/services/pairing-search/pairing-airport-options-query.ts`
- `pbs-server/src/services/pairing-search/pairing-search-service.test.ts`
- `pbs-server/src/routes/pairing-search.test.ts`

如前端只消费后端结果，原则上不需要改 UI。只有当测试 fixture 或类型断言依赖旧日期口径时，才同步调整 portal 测试。

## 验收标准

- `ALL PAIRINGS` 在 `Jun 2026` 下不显示 base-local origin date 为 `2026-05-31` 的 pairing。
- `ALL PAIRINGS` 能显示 base-local origin date 为 `2026-06-01` 的 pairing，即使 UTC start 在五月。
- Pairing Number autocomplete 与 `ALL PAIRINGS` 返回同一 period 口径。
- Specific Date occurrence 查询使用同一 base-local origin date。
- 机场候选项只基于本地 period 内可见 pairing 生成。
- 后端测试覆盖 UTC/月边界 case。
- 不引入旧数据兼容逻辑，不改变前端手动添加 pairing 的存储结构。

## 风险与注意点

- 当前工作区已有未提交的 all-pairings 功能改动，实施时需要只在现有改动基础上增量修改，不能回滚用户或前序改动。
- SQL 中 `at time zone` 可能影响索引使用；本次优先保证业务正确性。若性能受影响，需要后续增加函数索引或物化 local origin date。
- 有些旧查询已经使用 actor base 时区，有些仍使用 UTC。本次重点是统一 Pairing 页面可见入口，避免一个入口修好、另一个入口仍错。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 pairing search SQL 与对应测试，拆分会增加冲突和口径不一致风险。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server/src/services/pairing-search/*` 与对应测试，必要时少量 portal 测试 fixture。
- Conflict risk: 中等，当前工作区已有未提交功能改动。
- Execution gate: 本 spec 经用户确认后再进入实现。
