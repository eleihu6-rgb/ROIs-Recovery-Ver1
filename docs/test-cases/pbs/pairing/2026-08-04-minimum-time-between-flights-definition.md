# Minimum Time Between Flights 配置测试用例

## 前置条件

- 使用有权限访问 Gantt `PBS > Bid Definitions` 的管理员账号。
- PBS Portal 中 `Time Between Flights` 条件可见。
- 准备一个包含 `Time Between Flights` 的 Current Bid、Favorite 和 Standing Bid 旧条件。

## 正常流程

1. 在 Gantt 打开 `PBS > Bid Definitions`。
2. 确认列表显示 `Minimum Time Between Flights`，当前值以 `HH:MM minimum` 展示。
3. 点击编辑，将数值改为 `01:15` 并保存。
4. 在同一浏览器会话重新打开 PBS Portal 的 `Time Between Flights` 弹窗。
5. 新建 Current Bid、Favorite 和 Standing Bid 条件，分别输入 `01:14` 和 `01:15`。

预期结果：

- 管理页保存成功并显示 `01:15 minimum`。
- Portal 弹窗重新打开后使用最新最小值，不需要刷新整个页面。
- `01:14` 不能提交，`01:15` 可以提交。
- Search Pairings 使用的最小范围同步更新，现有动态最大值逻辑保持不变。

## 历史条件兼容

1. 将管理员最小值提高到高于旧条件的数值。
2. 打开已有 Current Bid、Favorite 和 Standing Bid 条件，不修改时长并保存。
3. 再次编辑相同条件，将时长改为低于新最小值的其他数值并保存。

预期结果：

- 未修改时长的旧条件可以保存，不会被新配置锁死。
- 修改后的时长必须满足最新最小值，否则不能保存。
- 系统不批量改写已有历史条件。

## 异常与边界

- 管理页输入 `00:00`、格式错误或超过三位小时数时，字段显示校验错误且不提交。
- 字典配置缺失或重复时，管理页显示持久错误和 Reload；Portal 显示持久错误和 Retry。
- 管理员并发修改导致保存冲突时，不静默覆盖数据库值。
- 配置不可用时，新建或修改 `Time Between Flights` 条件必须失败关闭；已有条件仅在时长完全未改时允许保留。

## 回归范围

- Redeye、Weekend、Credit Window、Minimum Base Layover、Efficient Flying Percentile 的管理与读取不受影响。
- Current Bid、Favorite、Standing Bid 的其他 Pairing 条件不受影响。
- `Time Between Flights` 的 Any/Every、Award/Avoid、比较符和 Tier 行为保持原样。
