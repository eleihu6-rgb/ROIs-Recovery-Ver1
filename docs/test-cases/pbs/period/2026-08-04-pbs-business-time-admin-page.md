# PBS Business Time 独立管理页面回归用例

## 前置条件

- 准备一个 `users.is_admin = 1` 的管理员账号和一个普通账号。
- 准备至少一个未来、一个开放中、一个已关闭的 PBS Period。
- 记录测试前的真实时间和当前 Portal Period；测试结束后必须执行 `Use Real Time`。

## 用例 1：权限与导航

1. 管理员登录 Gantt，进入 `PBS`。
2. 确认左侧显示 `Period`、`Bid Definitions`、`Business Time`、`Admin Tools`。
3. 普通账号登录，进入 `PBS`。
4. 确认不显示 `Bid Definitions` 和 `Business Time`。
5. 将普通账号浏览器的 `rois-shell-pbs-item` 预置为 `business-time` 后刷新。

预期：普通账号回到 `Period`，受限页面不渲染，持久化值恢复为 `period`。

## 用例 2：Period 页面职责分离

1. 管理员进入 `PBS > Period`。

预期：页面只包含 Period 的查询、生成、新增、编辑、删除功能，不显示 Business Time 状态或按钮。

## 用例 3：设置 Rolling Business Time

1. 管理员进入 `PBS > Business Time`。
2. 确认页面显示 `Asia/Shanghai (UTC+8)`、`Mode`、`Real Time`、`PBS Business Time` 和 `Override Set At`。
3. 输入一个落在未来 Period Bid 窗口内的时间并点击 `Set Business Time`。
4. 刷新页面，间隔一分钟后再次刷新。

预期：状态为 `OVERRIDE`；PBS Business Time 按真实经过时间继续前进，不是冻结值。

## 用例 4：Portal 联动

1. 设置 Business Time 到目标 Period 的 Bid Open 之前，打开 PBS Portal。
2. 记录 Dashboard 当前 Period、Bid 是否可编辑和剩余时间。
3. 设置 Business Time 到同一 Period 的 Bid Open 与 Bid Close 之间，最多等待 60 秒后刷新 Portal。
4. 设置 Business Time 到 Bid Close 之后，最多等待 60 秒后刷新 Portal。
5. 检查 Award 当前 Period 选择。

预期：Portal 当前 Period、Bid 可编辑状态、剩余时间和 Award Period 都使用同一个 Business Clock；边界变化与 Period 配置一致。

## 用例 5：清除 Override

1. 在 `PBS > Business Time` 点击 `Use Real Time`。
2. 刷新 Gantt 和 PBS Portal。

预期：状态恢复 `SYSTEM TIME`；PBS Portal 最多在 60 秒缓存期后恢复真实时间口径。

## 用例 6：失败与恢复

1. 在网络不可用时打开 Business Time 页面。
2. 恢复网络并点击 `Retry`。
3. 模拟保存失败。

预期：加载失败显示持久错误和 Retry；保存失败保留当前输入与状态；页面不显示原始异常、SQL 或内部诊断信息。
