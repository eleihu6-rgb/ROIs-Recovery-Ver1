# PBS Pairing Enroute Check Date / Day 条件测试用例

## 测试目标

确认 Pairing 条件里 enroute check-in / check-out 的时间与日期能力一致：

- `Any/Every Enroute Check-Out Time` 支持 `Any` 和 `Every`
- `Any/Every Enroute Check-In Date / Day` 可以展示、编辑、保存、回读
- `Any/Every Enroute Check-Out Date / Day` 可以展示、编辑、保存、回读
- 新条件在 `Search Pairings` 中实际参与 pairing 过滤

## 前置条件

1. PBS Portal 和 PBS Server 已启动，且连接到已执行最新 migration / seed 的数据库。
2. 测试账号能登录 PBS Portal，并能进入 `/pbs/pairing`。
3. 当前可申请 period 有 pairing 数据。
4. 当前用户至少有一个可编辑的 Pairing draft。

## 用例 1：Property 列表展示

步骤：

1. 登录 PBS Portal。
2. 进入 `Pairing` 页面。
3. 打开 `ADD PAIRING PROPERTIES`。
4. 搜索 `Enroute Check`。

预期结果：

- 可以看到 `Any/Every Enroute Check-In Time`。
- 可以看到 `Any/Every Enroute Check-Out Time`。
- 可以看到 `Any/Every Enroute Check-In Date / Day`。
- 可以看到 `Any/Every Enroute Check-Out Date / Day`。
- `Any/Every Enroute Check-Out Time` 不再显示为旧的 `Any Enroute Check-Out Time`。

## 用例 2：Check-Out Time 支持 Every

步骤：

1. 添加 `Any/Every Enroute Check-Out Time`。
2. 将 quantifier 选择为 `Every`。
3. 设置条件为 `< 22:30`。
4. 保存 draft。
5. 刷新页面后重新进入 Pairing 页面。

预期结果：

- 保存成功。
- 刷新后该条件仍然显示为 `Every`。
- 条件摘要能表达 `every enroute check-out less than 22:30`。

## 用例 3：Check-In Date / Day 保存与回读

步骤：

1. 添加 `Any/Every Enroute Check-In Date / Day`。
2. 选择 quantifier 为 `Any`。
3. 添加一个具体日期，例如 `2026-06-05`。
4. 再选择一个星期，例如 `Fri`。
5. 保存 draft。
6. 刷新页面后回到该条件。

预期结果：

- 保存成功。
- 日期和星期都能回读。
- 条件摘要能表达 enroute check-in 的日期 / 星期内容。

## 用例 4：Check-Out Date / Day 保存与回读

步骤：

1. 添加 `Any/Every Enroute Check-Out Date / Day`。
2. 选择 quantifier 为 `Every`。
3. 将 operator 切换为 `Between`。
4. 设置范围，例如 `2026-06-05` 到 `2026-06-10`。
5. 保存 draft。
6. 刷新页面后回到该条件。

预期结果：

- 保存成功。
- `Every`、`Between` 和日期范围都能回读。
- 条件摘要能表达 enroute check-out 的日期范围内容。

## 用例 5：Search Pairings 过滤生效

步骤：

1. 进入 `Search Pairings`。
2. 添加 `Any/Every Enroute Check-In Date / Day`，选择一个当前 period 内确定存在的 enroute check-in 日期。
3. 点击搜索或查看结果列表。
4. 打开任意结果的 pairing detail。
5. 重复步骤 2-4，改用 `Any/Every Enroute Check-Out Date / Day`。

预期结果：

- 搜索接口不返回 422 / 500。
- 结果列表只展示符合条件的 pairings。
- Pairing detail 中对应 enroute duty 的 check-in / check-out 日期与筛选条件一致。
- 切换 `Any` / `Every` 后，结果数量符合语义变化：`Every` 不应比 `Any` 返回更多结果。

## 边界场景

- 不选择日期也不选择星期时，应提示缺少日期 / 星期值，不能生成无意义搜索。
- `Between` 的结束日期早于开始日期时，应被拒绝。
- `Any/Every Enroute Check-Out Time` 使用 `=` 操作符时应被拒绝，因为该属性只支持 `<` 和 `Between`。

## 回归范围

- `Any/Every Enroute Check-In Time` 原有 `Any` / `Every` 行为不变。
- `Any/Every Duty On Date / Day` 和 `Any/Every Layover On Date / Day` 仍可保存和搜索。
- Search Pairings 的 pool count、preview list 和当前规则计数接口不应因为新 property 报错。
