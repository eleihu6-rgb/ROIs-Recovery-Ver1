# Pairing Preference Check-in / Check-out 展示测试

## 前置条件

- 当前 Bid Period 内存在 Pairing `T4536` 的两个班次。
- `2026-06-05` 班次的 Check-in / Check-out 为 `16:45 / 23:40`。
- `2026-06-08` 班次的 Check-in / Check-out 为 `16:45 / 23:42`。

## 操作步骤与预期结果

1. 打开 Bid 页面并进入 `Configure Pairing Preference`。
   - 结果表在 `DATES` 后显示 `CHECK-IN` 和 `CHECK-OUT`。
2. 展开 Filters，设置 Check-in `16:00–17:00`、Check-out `23:30–23:45`，点击 `Apply filters`。
   - `2026-06-05` 的 T4536 显示 `16:45 / 23:40`。
   - `2026-06-08` 的 T4536 显示 `16:45 / 23:42`。
3. 分别在 `1440×900` 和 `1024×768` 视口查看表格。
   - 10 列对齐，不出现横向滚动条；Route 过长时完整换行。

## 异常与边界场景

- `reportTime` / `releaseTime` 为 `1645` 或 `16:45` 时均显示 `16:45`。
- 时间缺失时显示 `-`，不从 legs 推导替代值。
- 加载骨架屏、空态和错误态均覆盖完整 10 列，不引起表格宽度跳变。

## 回归范围

- Pairing Bid 中的 Pairing Preference。
- Standing Bid 中复用的 Pairing Preference。
- 筛选、分页、关键词搜索、选中状态、sticky 表头和 Route 换行。
