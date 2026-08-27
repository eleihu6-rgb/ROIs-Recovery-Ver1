# PBS Period 系统自动阶段回归测试

## 目标

验证 PBS Portal 是否可编辑只由 `PBS Business Now` 与 `Bid Open / Bid Close` 决定，不再依赖管理员手动维护的数据库 `status`。

## 前置条件

- 管理员可访问 `Gantt > PBS > Period`。
- 测试账号可登录 PBS Portal。
- 管理端可设置 `PBS Business Time`。
- 至少存在一个 `F8/P -> Jun 2026` period，`Bid Open = 2026-05-01 00:00`，`Bid Close = 2026-05-08 23:59`。

## 用例 1：DRAFT 旧状态不再阻止窗口内编辑

1. 在管理端把 `PBS Business Time` 设置到 `2026-05-01 12:00` 或同一天窗口内时间。
2. 确认 `F8/P -> Jun 2026` 的 `Bid Open / Bid Close` 覆盖该业务时间。
3. 登录 P 部门用户，例如 `247`。
4. 打开 PBS Portal 的 `Pairing` 页面。

期望：

- 页面显示 `Bidding open for Jun 2026`。
- Pairing 页面允许编辑 bid。
- 不再出现 `Bid period status is DRAFT.`。

## 用例 2：未到开放时间自动只读

1. 将 `PBS Business Time` 设置到 `Bid Open` 之前。
2. 登录同一用户并打开 PBS Portal。

期望：

- 页面显示 `Bidding not open for Jun 2026`。
- 页面只读。
- 只读原因显示开放时间。

## 用例 3：超过关闭时间自动只读

1. 将 `PBS Business Time` 设置到 `Bid Close` 之后。
2. 登录同一用户并打开 PBS Portal。

期望：

- 页面显示 `Bidding closed for Jun 2026`。
- 页面只读。
- 只读原因显示关闭时间。

## 用例 4：Gantt 管理端只显示系统阶段

1. 打开 `Gantt > PBS > Period`。
2. 搜索目标 period。
3. 查看列表和编辑弹窗。

期望：

- 列表显示 `System Stage`。
- 新增/编辑弹窗没有可手动修改的 `Status` 下拉框。
- 编辑弹窗只读展示系统阶段。

## 回归范围

- PBS Portal：Pairing / Days Off / Line / Reserve / Tier 相关只读状态。
- Gantt：PBS Period 管理页、Generate Year、PBS Business Time。
- pbs-server：当前周期解析和 bid 保存权限。
- live-server：PBS Period 管理接口返回的系统阶段。
