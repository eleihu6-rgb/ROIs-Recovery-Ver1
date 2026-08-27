# PBS Reserve Preference 人工测试用例

## 前置条件

- 测试环境已执行 `2026-07-15-pbs-reserve-preference.sql`。
- 使用有 Current PBS bid 权限的 crew 账号登录 PBS Portal。
- 当前 bid period 处于可编辑状态。
- Reserve Preference 已合并到 `Bid -> ADD BID PROPERTIES -> ROSTER`；独立 `Reserve` 页面不再作为员工端入口。

## 用例 1：ROSTER 中展示 Reserve Preference

1. 打开 `Bid` 页面。
2. 切换到 `ROSTER` 分类。
3. 查看 Available list 和 Existing Bid 列表。

预期结果：

- `ROSTER` 分类中显示 `Reserve Preference`。
- 顶部导航不显示 `Reserve`。
- 不显示 `Legacy Reserve` / `AA Prefer Off` 模式切换。
- 不显示 `Reserve Day On` / `Reserve Prefer Off` 入口。
- 保存后的 Reserve Preference 在 Existing Bid 中显示为 Roster 类型，但底层仍写入 reserve draft。

## 用例 2：新增 Whole Month / First Half Reserve Preference

1. 在 `Bid -> ROSTER` 点击 `Reserve Preference` 的添加按钮。
2. 在弹窗中选择 `SHORT-CALL TYPE = CRPM`。
3. 选择 `T2`。
4. 选择 `DATE SCOPE = First Half`。
5. 点击 `ADD BID`。

预期结果：

- 弹窗关闭。
- Existing row 显示 `Reserve Preference`。
- bid 内容包含 `CRPM` 和 `First Half`。
- Tx 显示 `T2`。

## 用例 3：Specific Dates

1. 在 `Bid -> ROSTER` 点击 `Reserve Preference` 的添加按钮。
2. 选择一个 short-call type。
3. 选择 `T1`。
4. 选择 `DATE SCOPE = Specific Dates`。
5. 添加两个日期，例如 `2026-05-01`、`2026-05-03`。
6. 点击 `ADD BID`。

预期结果：

- Existing row 显示两个指定日期。
- 日期去重；重复日期不应生成重复 chip。

## 用例 4：删除后的独立 Reserve 页面

1. 直接访问 `/reserve`。
2. 直接访问旧路径 `/portal/calendar`。

预期结果：

- 两个路径都在原路径显示 `Page not found`。
- 不重定向到 `Bid`、`Dashboard` 或其他业务页。

## 用例 5：异常和重复

1. 不选择任何 Tx，确认 `ADD BID` 禁用。
2. 选择 `DATE SCOPE = Date Range`，填写结束日期早于开始日期。
3. 尝试新增与已有 row 完全相同的 short-call type、date scope、Tx。

预期结果：

- 无 Tx 时不能保存。
- 无效 Date Range 不能保存。
- 重复条件显示 warning，不创建第二条相同 row。

## 用例 6：编辑

1. 在 Existing Bid 中对已有 `Reserve Preference` row 点击编辑。
2. 修改 short-call type。
3. 修改 `DATE SCOPE = Second Half` 或有效 Date Range。
4. 点击 `UPDATE BID`。

预期结果：

- row 更新成功。
- Existing row summary 和 Tier 页摘要都反映新配置。

## 回归范围

- Standing Reserve 中 `Reserve Day of Week Off`、`Reserve Work Block Size`、`Waive to Allow Carry over to be Days Off` 不因本次 migration 被停用。
- Line 页面 `Mixed Line Bid`（底层 427）只表达 mixed / reserve-only / pairing-only 的 line-level 偏好，不应出现在 Reserve Preference 弹窗内。
