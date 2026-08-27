# PBS Period 全局共享与移除部门维度测试用例

## 测试目标

确认 PBS Period 不再按部门配置，并且不同部门用户读取到同一个当前周期和开关窗状态。

## 前置条件

- 准备一个具备 PBS Admin 权限的账号。
- 准备两个属于不同部门、但都可登录 PBS Portal 的用户。
- Live 数据库中存在一个当前业务时间可用的 PBS Period。

## 用例 1：管理页面不再显示部门

1. 登录 Gantt，进入 `PBS > Period`。
2. 检查筛选区和 Period 列表。
3. 打开 `Add Period`。
4. 打开 `Generate Year`。

预期：

- 筛选区、列表、Add Period 和 Generate Year 均没有 `Division`。
- `Filiale` 仍正常显示和保存。

## 用例 2：旧部门参数被拒绝

分别向 Period 查询、新增和 Generate Year 接口传入旧的 `division` 字段。

预期：接口返回 `400`，不会静默忽略旧字段，也不会写入数据。

## 用例 3：不同部门共享当前周期

1. 使用部门 A 的 Portal 用户登录，记录 Dashboard 显示的 Period、Bid Open、Bid Close 和状态。
2. 退出后使用另一个部门的 Portal 用户登录。
3. 对比相同字段。

预期：两个用户看到完全相同的当前 Period、开关窗时间和状态。

## 用例 4：部门业务范围保持不变

分别使用不同部门用户检查 Dashboard 用户资料、Pairing 和 Reserve 页面。

预期：

- 用户资料仍显示各自部门。
- Pairing 和 Reserve 仍按各自原有部门范围读取数据。
- 本次修改仅影响 Period，不扩大其他业务数据范围。
