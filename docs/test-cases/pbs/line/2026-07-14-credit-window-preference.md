# PBS Line Credit Window Preference 手工测试用例

## 范围

验证 PBS Portal 的 Line `Credit Window Preference` 员工端入口。算法导出不在本轮测试范围。

## 前置条件

- 当前 bid period 可编辑。
- `dictionary` 中存在 `SYS_PARAM / PBS_LINE_CREDIT_WINDOW_CONFIG` 配置组。
- `dictionary` 中存在 `PBS_LINE_CREDIT_WINDOW_CONFIG` 子项：`MMG_CREDIT`、`OVERTIME_THRESHOLD`、`LOW_MIN_CREDIT`、`LOW_MAX_CREDIT`、`HIGH_MIN_CREDIT`、`HIGH_MAX_CREDIT`。
- Line catalog 中 `429 Credit Window Preference` 可见，旧 `401/402` 不在新增入口中展示。

## 用例 1：Low credit

1. 进入 PBS Portal Line 页面。
2. 打开 `ALL PROPERTIES`。
3. 点击 `Credit Window Preference` 的 add。
4. 确认弹窗默认选中 `Low credit`，显示 `Company low window / Company defined`，没有可输入 credit 的文本框。
5. 选择一个 Tier，例如 `T1`。
6. 点击 `ADD BID`。

预期：

- Existing Line Properties 新增 `Credit Window Preference`。
- 摘要显示 `Low credit`。
- 用户没有输入具体 credit 范围。

## 用例 2：High credit

1. 重复打开 `Credit Window Preference` 弹窗。
2. 点击 `High credit`。
3. 确认显示 `Company high window / Company defined`，没有可输入 credit 的文本框。
4. 选择 Tier 并保存。

预期：

- 保存成功。
- 摘要显示 `High credit`。

## 用例 3：Custom

1. 打开 `Credit Window Preference` 弹窗。
2. 点击 `Custom`。
3. 输入 `Minimum credit` 和 `Maximum credit`，例如 `74:00` / `84:00`。
4. 选择 Tier 并保存。

预期：

- 保存成功。
- 摘要显示 `Custom credit 74:00 - 84:00`。
- 如果最小值大于最大值，或格式不是 `HH:MM`，保存按钮不可用并显示错误。

## 用例 4：配置缺失

1. 临时移除或置空 `PBS_LINE_CREDIT_WINDOW_CONFIG` 下任一必要子项。
2. 打开 `Credit Window Preference` 弹窗。

预期：

- 弹窗显示 `Credit window configuration is unavailable.`。
- `ADD BID` 不可点击。

## 回归范围

- 旧 `401 Max Credit Window` / `402 Min Credit Window` 历史行仍可在 Existing 中显示和删除。
- 旧 `401/402` 不应出现在新增 Line property 列表和推荐入口中。
- `No Same Day Pairings`、`Waive No Same Day Duty Starts`、`Commuter Pattern`、`Efficient Flying First`、`Reserve / Flying Date Pattern` 的新增与编辑不受影响。
