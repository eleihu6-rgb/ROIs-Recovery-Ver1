# Dashboard Message Center 预占展示测试用例

## 前置条件

- 使用有 PBS Portal 权限的 crew 账号登录。
- 当前 PBS period 已配置 roster start/end。
- 测试数据中至少准备一个当前 crew 在当前 period 内的 `roster_flight.source = 'IMP'` 占用。
- 测试数据中可选准备一个没有预占的 crew，用于空状态验证。

## 场景 1：未发布 Award 时仍显示预占

1. 将当前 period 保持在 Award 未发布状态。
2. 打开 `/pbs/dashboard`。
3. 查看右侧 `MESSAGE CENTER`。

预期结果：

- 右侧显示 `Pre-assigned Duties`。
- 能看到预占总数、覆盖天数、分类明细和 `Duty Details` 完整明细列表。
- 不需要 Award 发布，也不依赖 Award 页面能否看到结果。

## 场景 2：Pairing 多航段不重复计数

1. 准备同一个 `pairing_id` 下多条 `roster_flight` 航段。
2. 打开 `/pbs/dashboard`。
3. 查看 `Pre-assigned Duties` 的总数和分类。

预期结果：

- 同一个 `pairing_id` 只统计为 1 个 duty。
- 明细展示该 pairing 的整体时间窗口，不按每条 leg 展示多行。

## 场景 3：无预占空状态

1. 使用当前 period 内没有 `source = 'IMP'` 占用的 crew 登录。
2. 打开 `/pbs/dashboard`。
3. 查看右侧 `MESSAGE CENTER`。

预期结果：

- 显示 `No pre-assigned duties for this period.`。
- 不显示空白表格或单独的 `-` 占位。

## 场景 4：超过 5 条预占时可查看完整明细

1. 准备当前 crew 当前 period 内超过 5 条 `source = 'IMP'` 预占。
2. 打开 `/pbs/dashboard`。
3. 查看右侧 `MESSAGE CENTER` 的 `Duty Details`。
4. 在 `Duty Details` 列表内部滚动到底部。

预期结果：

- 后端返回的预占明细不被截断为 5 条。
- `Duty Details` 列表内部出现滚动能力。
- 滚动到底部后能看到最后一条预占。
- 右侧面板不会因为明细很多而把 Dashboard 页面撑坏。

## 场景 5：布局回归

1. 使用 1920x1080 视口打开 `/pbs/dashboard`。
2. 使用较小高度视口或浏览器缩放再次查看。
3. 检查左侧 user panel、中间 bidding calendar、右侧 message center。

预期结果：

- 中间 calendar 不被右侧面板影响。
- 右侧内容不裁切关键文字。
- 预占明细很多时，只在 `Duty Details` 内部滚动。
- 页面仍可按 Dashboard 现有滚动策略查看完整内容。

## 回归范围

- Dashboard 右侧 `MESSAGE CENTER`。
- Dashboard 中间 bidding calendar 布局。
- Award 页面发布结果读取逻辑不应变化。
- Bid、Reserve、Standing Bid 页面不应出现新的右侧预占区块。
