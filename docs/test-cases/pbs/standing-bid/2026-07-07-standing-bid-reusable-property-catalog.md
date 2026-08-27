# PBS Standing Bid 可复用条件集合测试用例

## 背景

Standing Bid 是长期可复用申请模板，不是当前月 PBS 申请。此轮扩展后，页面不再只展示少量 demo 条件，而是按长期可复用口径展示：

- `Lineholder Standing Bid`：`Days Off`、`Pairing`、`Roster`
- `Reserve Standing Bid`：`Reserve`、`Standing`

页面使用顶部紧凑的 `Lineholder / Reserve` Tab，不显示独立左侧说明栏，也不提供收藏入口。`Roster` 是 Portal 展示标签，底层仍对应 Line 条件。

## 前置条件

- PBS Portal 可正常登录。
- 后端 `GET /api/standing-bids/current` 正常返回 Standing Bid 页面数据。
- 远端 `f8_pbs.pbs_bid_property` 中相关 property 已存在、`is_active=1`，并按数据库可见开关决定是否展示。
- `Pairing Preference (102)`、`Long Stretch Off / Compressed Flying (204)`、具体 pairing occurrence 不应进入 Standing Bid 条件目录。
- 通用条件的具体日期区域应保留，但必须为空且不可填写。

## 测试 1：Lineholder 条件集合

1. 登录 PBS Portal。
2. 进入顶部导航 `Standing Bid`。
3. 保持顶部 `Lineholder` Tab。
4. 点击 `ADD STANDING BID`。

期望结果：

- 页面是单列工作台，没有宽大的左侧说明栏。
- 页面展示 `All`、`Days Off`、`Pairing`、`Roster` 分类，不显示单独的 `Standing` 分类。
- 不显示 `FAVORITED PROPERTIES` 或收藏操作。
- `Day of Week Off (218)` 位于 `Days Off`。
- `Airport Preference (168)`、`Efficient Flying First (428)` 位于 `Pairing`。
- 可看到 `Credit Window Preference (429)` 等 Roster 条件。
- 不显示旧的 `Any Landing In Airport (101)`、`Any Layover In Airport (104)`。
- 不显示 `Pairing Preference (102)`。
- 不显示 `Long Stretch Off / Compressed Flying (204)`。

## 测试 2：Standing date/day 不允许具体日期

1. 在 Lineholder Standing Bid 下点击 `Add Prefer Off`。
2. 查看弹窗中的 `BID` 区域。

期望结果：

- 显示 `Date` 区域，日期输入框为空。
- 日期输入框、日历按钮和 `Add Date` 均为禁用状态，键盘也无法输入。
- 显示说明：`Applies to any date in the bid month.`
- 星期选择 `Mon / Tue / ... / Sat / Sun` 仍可使用。
- 点击 `ADD BID` 后保存成功。
- 保存请求中的 `dates` 保持空数组。
- 刷新页面后该规则仍存在。

## 测试 3：Reserve 条件集合

1. 切换到顶部 `Reserve` Tab。
2. 点击 `ADD STANDING BID`。

期望结果：

- 页面展示 `Reserve`、`Standing` 分组。
- 可看到 `Short Call Type`。
- 可看到 Standing Reserve 专属条件，例如 `Reserve Work Block Size`。

## 测试 4：Reserve date scope 只允许相对范围

1. 在 Reserve Standing Bid 下点击 `Add Short Call Type`。
2. 打开 date scope 下拉框。

期望结果：

- 只允许 `Whole Month`、`First Half`、`Second Half`。
- 不显示 `Date Range`。
- 不显示 `Specific Dates`。
- 选择 `Second Half` 后保存成功。
- 刷新页面后该规则仍存在。

## 测试 5：当前月申请不被污染

1. 在 Standing Bid 新增或修改规则。
2. 切换到 `Days Off`、`Pairing`、`Line`、`Reserve` 当前月页面。

期望结果：

- 当前月 bid 内容不会因为 Standing Bid 保存而变化。
- Standing Bid 不触发当前月 submit / lock / award 流程。

## 回归关注点

- Lineholder / Reserve Tab 切换后，标题、空状态和条件目录与所选模式一致。
- Existing 区无真实数据时只显示空状态，不显示伪造示例规则。
- Standing Bid 页面在 1920、1366、1280 宽度下没有横向溢出。
- ADD 列表分页仍可使用。
- Existing 列表中的规则可以编辑、删除、保存。
- 后端保存时必须拒绝具体日期、date range、specific dates、pairing occurrence 和不在 Standing catalog 中的 property code。
