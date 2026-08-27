# PBS Current Period Lifecycle 回归用例

## 目标

验证 PBS Portal 当前申请周期只由 `PBS Business Time` 与 `roster_period.pbs_bid_open_at` / `roster_period.pbs_bid_close_at` 自动计算，不再存在管理端手动指定周期。

## 前置条件

- 管理员可访问 `Gantt > PBS Period`。
- PBS Portal 可登录至少一个 Cabin / Pilot 用户。
- live schema（例如 `f8`）的 `roster_period` 至少有两个带 `pbs_period_code` 的 PBS 周期：
  - 一个业务时间在 `pbs_bid_open_at` 到 `pbs_bid_close_at` 内的周期。
  - 一个业务时间不在窗口内，或 bid window 不完整的周期。

## 用例 1：管理端不显示旧手动配置

1. 打开 `Gantt > PBS Period`。
2. 查看页面顶部和过滤区。

期望：

- 页面显示 `PBS Business Time`。
- 页面不显示 `Portal Active Period`。
- 页面不显示 `Selection Mode`。
- 页面不显示 `Manual Period`。

## 用例 2：业务时间在窗口内时可编辑

1. 将 `PBS Business Time` 设置到目标 period 的申请窗口内。
2. 登录 PBS Portal。
3. 打开 Line / Days Off / Pairing 任一申请页。

期望：

- Portal 显示系统自动选中的当前周期。
- 页面显示 `Bidding open for <period>`。
- 添加、修改、删除、收藏相关操作可正常保存。

## 用例 3：业务时间早于开放时间时只读

1. 将 `PBS Business Time` 设置到目标 period 的 `pbs_bid_open_at` 之前。
2. 刷新 PBS Portal。
3. 尝试通过右侧面板或 Dashboard 日历添加申请。

期望：

- 页面显示 `Bidding not open for <period>` 和只读原因。
- 添加、修改、删除、收藏、日历写入入口不可用。
- 即使手工调用写接口，后端也返回禁止写入错误。

## 用例 4：业务时间晚于关闭时间时只读

1. 将 `PBS Business Time` 设置到目标 period 的 `bid_close_at` 之后。
2. 刷新 PBS Portal。
3. 尝试保存申请。

期望：

- 页面显示 `Bidding closed for <period>` 和只读原因。
- Portal 只读。
- 后端写接口拒绝保存。

## 用例 5：旧 dictionary 配置不影响当前周期

1. 数据库中即使残留 `PBS_PORTAL_ACTIVE_PERIOD_*` 配置，先执行清理 migration。
2. 刷新 PBS Portal。

期望：

- `dictionary` 中不存在 `PBS_PORTAL_ACTIVE_PERIOD_%` 配置。
- Portal 当前周期仍按 `PBS Business Time` 自动选择。
- 页面返回字段使用 `currentPeriod`，不依赖 `activePeriod`。

## 用例 6：当前周期状态显示在 BIDDING CALENDAR 标题右侧

1. 将 `PBS Business Time` 设置到可编辑窗口内。
2. 打开 PBS Portal `/dashboard`。

期望：

- `BIDDING CALENDAR` 标题条右侧显示 `Bidding open for <period>`。
- 同一状态块显示 `Open <date time> · Close <date time>`。
- 页面右侧业务面板不再重复显示独立大 banner。
- 墙上时间不随浏览器时区变化。

## 回归范围

- Gantt `PBS Period` 管理页。
- PBS Portal Dashboard / Pairing / Line / Days Off / Reserve 当前周期显示与只读状态。
- pbs-server 当前周期解析和 bid 保存权限。
- live-server PBS Business Time 与 PBS Period 管理接口。
