# PBS Period / Dictionary 合并回归用例

## 目标

验证 PBS 运行时不再依赖 `f8_pbs.dictionary` / `f8_pbs.pbs_period`，周期与业务时间统一来自 `f8.dictionary` / `f8.roster_period`。

## 前置条件

- 已执行 `sql/migration/2026-07-08-pbs-period-roster-period-consolidation.sql`。
- `f8.roster_period` 中存在带 `pbs_period_code`、`pbs_bid_open_at`、`pbs_bid_close_at` 的当前 PBS 周期。
- `f8.dictionary` 中存在 `PBS_BUSINESS_TIME_MODE`、`PBS_BUSINESS_TIME_ANCHOR`、`PBS_BUSINESS_TIME_ANCHOR_REAL`。
- `f8_pbs.dictionary` 和 `f8_pbs.pbs_period` 已不存在。

## 用例 1：旧表已删除

执行检查：

```sql
select to_regclass('f8_pbs.dictionary') as dictionary_table,
       to_regclass('f8_pbs.pbs_period') as pbs_period_table;
```

预期：

- 两列都返回 `null`。

## 用例 2：Business Time 仍可读写

1. 打开 `Gantt > PBS Period`。
2. 设置 `PBS Business Time` 到当前 PBS 周期申请窗口内。
3. 查询 `f8.dictionary` 中三个 `PBS_BUSINESS_TIME_*` 值。

预期：

- 页面保存成功。
- 三个配置只写入 `f8.dictionary`。
- 后端日志不出现 `f8_pbs.dictionary` 不存在相关错误。

## 用例 3：Portal 当前周期来自 roster_period

1. 在 `f8.roster_period` 修改当前周期的 `pbs_bid_open_at` / `pbs_bid_close_at`。
2. 登录 PBS Portal。
3. 打开 Dashboard、Days Off 或 Pairing 页面。

预期：

- Portal 展示的当前 periodCode 等于 `roster_period.pbs_period_code`。
- 是否可编辑由 `pbs_bid_open_at` / `pbs_bid_close_at` 与 PBS Business Time 计算。
- 页面不依赖 `f8_pbs.pbs_period`。

## 用例 4：已有 Current bid 不丢失

1. 使用已有 Current bid 的机组账号登录 PBS Portal。
2. 打开对应 bid 页面。
3. 修改一条申请并保存。

预期：

- 旧 bid 可正常加载。
- 保存后 `f8_pbs.pbs_bid.roster_period_id` 指向对应 `f8.roster_period.id`。
- `f8_pbs.pbs_bid` 不再包含或不再依赖 `pbs_period_id`。
