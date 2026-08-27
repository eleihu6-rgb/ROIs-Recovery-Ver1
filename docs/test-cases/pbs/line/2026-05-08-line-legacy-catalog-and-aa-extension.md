# PBS Line 旧库目录与 AA 扩展测试案例

日期：2026-05-08  
模块：PBS Portal / Line  
适用对象：后期测试人员

## 测试目标

- 验证 `/line` 默认展示旧库 Line `401-407`，不展示默认隐藏的 AA Line `411-426`。
- 验证旧库 Line property 可以添加、保存、刷新回显。
- 验证明显非法的 Line bid 会被后端拒绝。
- 验证本次改动不影响 Pairing、Days Off、Tier summary 和左侧 Bidding Calendar 的核心流程。

## 前置条件

- PBS Server 与 PBS Portal 已启动。
- 使用有 Lineholder Current bid 权限的测试账号登录。
- 当前 bid period 可用，例如 `Apr 2026`。
- 数据库已执行最新 PBS migration / seed，`pbs_bid_property` 中：
  - `401-407` 为 `bid_type='Line'`、`source_type='legacy'`、`is_visible_in_portal=1`。
  - `411-426` 为 `bid_type='Line'`、`source_type='aa'`、`is_visible_in_portal=0`。

## 正常路径

1. 进入 PBS Portal `/line` 页面。
2. 在 `ADD LINE PROPERTIES` 中确认可见属性包含：
   - `Max Credit Window`
   - `Min Credit Window`
   - `Clear Schedule and Start Next Bid Group`
   - `No Same Day Pairings`
   - `Waive No Same Day Duty Starts`
   - `Forget Line`
   - `Min Base Layover`
3. 确认默认不出现 `Target Credit Range`、`Work Block Size`、`Allow Multiple Pairings` 等 AA Line 扩展属性。
4. 添加 `Clear Schedule and Start Next Bid Group` 到 Existing 列表。
5. 添加 `No Same Day Pairings` 到 Existing 列表。
6. 添加 `Forget Line`，输入合法 line number，例如 `12`。
7. 添加 `Min Base Layover`，输入合法 duration，例如 `013:00`。
8. 切换不同 Tx，例如 `T1`、`T2`，确认保存后刷新页面仍能回显相同 property 和 Tx。
9. 进入 `/tier` 页面，确认 summary 能看到 Line property 数量或对应 Line summary 项。

## 异常与边界

1. 将 `Forget Line` 输入为 `0` 或负数，保存应失败，并显示后端错误：`Forget Line must be a positive line number.`。
2. 将 `Min Base Layover` 输入为非法 duration，例如 `13:75` 或 `abc`，保存应失败，并显示后端错误：`Min Base Layover must use a valid duration like 013:00.`。
3. 如果测试环境临时开启 `Target Credit Range`：
   - 输入 `78-80` 应被拒绝，因为差值不足 5。
   - 输入 `75-85` 应可保存。
4. 如果测试环境临时开启 `Work Block Size`：
   - 输入 `3-5` 应可保存。
   - 输入超过 `12` 的范围应被拒绝。

## 回归范围

- Pairing 页面添加、保存、刷新回显不受影响。
- Days Off 页面添加、保存、刷新回显不受影响。
- 左侧 `BIDDING CALENDAR` 当前选中 Tx 在页面切换时不应被重置。
- Line 保存后 Current draft `draftVersion` 正常递增；旧版本保存仍应返回并发冲突。
- 所有 PBS 相关接口响应应保持在 2 秒目标内。

## 通过标准

- Line 默认只展示旧库 `401-407`。
- 旧库 Line property 保存后刷新仍能回显。
- AA Line 扩展已入库但默认隐藏，除非数据库打开 `is_visible_in_portal`。
- 非法输入被后端拒绝，不能写入 Current draft。
- Pairing / Days Off / Tier / Bidding Calendar 主流程无回归。
