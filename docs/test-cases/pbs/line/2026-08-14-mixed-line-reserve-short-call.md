# Mixed Line Bid 支持 Reserve Short Call 回归测试

## 目标

验证 `Mixed Line Bid` 在 Current Line 和 Standing Roster 中可以配置为 Reserve Short Call，并且 `Reserve` tab 原有功能不变。

## 前置条件

- PBS Portal 可以正常登录。
- 当前周期允许编辑 Current Bid。
- 当前用户至少有一个可编辑 tier。

## 用例 1：Current Line 添加 Mixed Line Short Call

1. 打开 `Line Bid` 页面。
2. 在添加条件列表中搜索并打开 `Mixed Line Bid`。
3. 确认弹窗默认选中 `Mixed Line`，并显示 `RESERVE SHORT CALL` 区域。
4. 选择 `T1`。
5. 保持 `PRAM`，开启 `LIMIT TO A DATE RANGE`。
6. 选择一个有效日期范围，例如 `2026-09-01` 到 `2026-09-03`。
7. 点击 `ADD BID`。

期望结果：

- Existing Line Properties 中出现 `Mixed Line Bid`。
- 摘要显示 `Award PRAM short call` 和所选日期范围。
- 后端保存为 property code `301`，不是 `427`。

## 用例 2：Current Line 保持 Reserve Only / Pairing Only

1. 打开 `Mixed Line Bid` 弹窗。
2. 选择 `Reserve Only` 或 `Pairing Only`。
3. 选择 `T1` 并保存。

期望结果：

- 保存仍使用 property code `427`。
- 摘要分别显示 reserve-only 或 pairing-only。

## 用例 3：Standing Roster 添加 Mixed Line Short Call

1. 打开 `Standing Bid` 页面。
2. 在 `Roster` 或 All Properties 中添加 `Mixed Line Bid`。
3. 确认默认选中 `Mixed Line`，显示 `RESERVE SHORT CALL`。
4. 确认没有具体日期范围开关或日期选择器。
5. 选择 `T1`。
6. 将日期范围选择为 `First Half` 或保留 `Whole Month`。
7. 保存。

期望结果：

- Existing Standing Bid 中显示 `Mixed Line Bid`。
- 保存落到 Standing Reserve draft，property code 为 `301`。
- `Reserve Preference` 原有入口仍保留在 Reserve category。

## 用例 4：Reserve tab 不变

1. 打开 Reserve 条件列表。
2. 添加 `Reserve Work Block Size` 或其他原有 Reserve 条件。

期望结果：

- Reserve 条件仍按原路径保存到 Reserve draft。
- `Reserve Preference` 仍可作为 Reserve 条件单独添加，不受 Mixed Line 改动影响。
