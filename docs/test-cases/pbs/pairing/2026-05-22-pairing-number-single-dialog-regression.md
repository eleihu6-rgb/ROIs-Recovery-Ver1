# PBS Pairing Number 单窗口配置回归测试

## 前置条件

- PBS Portal 前端和 PBS Server 正常启动。
- 使用有 Current bid draft 的测试账号进入 `/pairing`。
- 当前 bid period 有可搜索的 Pairing Number，例如 `M4959`。

## 用例 1：新增 Pairing Number 默认空值

1. 打开 `/pairing` 页面。
2. 在 `ADD PAIRING PROPERTIES` 的 `ALL PROPERTIES` 中找到 `Pairing Number`。
3. 观察 `BID` 列。
4. 点击 `Pairing Number` 左侧加号。

预期：

- 列表中 `Pairing Number` 的 `BID` 显示 `--`。
- 弹窗只出现 `Configure Pairing Bid`。
- `BID` 输入框为空，不预填 `M4959` 或其他 pairing number。
- `ADD BID` 和 `SAVE FAVORITE` 在未选择 Pairing Number 前不可提交，或给出必填提示。

## 用例 2：Entire Month 新增

1. 在 `Configure Pairing Bid` 弹窗中搜索 `M4959`。
2. 从 autocomplete 结果中选择 `M4959`。
3. 确认同一弹窗内出现 `Entire Month / Specific Date`。
4. 保持 `Entire Month`。
5. 点击 `ADD BID`。

预期：

- 不出现第二个 `Choose Pairing Run` 弹窗。
- Existing 列表新增 `Pairing Number`。
- 左侧日历按 Entire Month 语义显示该 pairing number 的运行。

## 用例 3：Specific Date 新增

1. 打开 `Pairing Number` 配置弹窗。
2. 搜索并选择 `M4959`。
3. 切换到 `Specific Date`。
4. 在同一弹窗内选择一个 run date。
5. 点击 `ADD BID`。

预期：

- run date 列表在同一弹窗内加载和选择。
- 不出现第二个 `Choose Pairing Run` 弹窗。
- 保存后 Existing 列表新增 `Pairing Number`，其 bid 只对应所选 run date。

## 用例 4：保存收藏

1. 打开 `Pairing Number` 配置弹窗。
2. 搜索并选择 `M4959`。
3. 根据需要选择 `Entire Month` 或 `Specific Date`。
4. 点击 `SAVE FAVORITE`。
5. 切换到 `FAVORITED PROPERTIES`。

预期：

- 收藏成功后不会新增 Existing。
- 收藏区显示配置好的 `Pairing Number`。
- 点击收藏项加号可直接新增 Existing。

## 用例 5：Existing 编辑

1. 在 Existing 中找到已经保存的 `Pairing Number`。
2. 点击编辑 icon。
3. 在弹窗中修改 `Entire Month / Specific Date` 或 run date。
4. 点击 `UPDATE BID`。

预期：

- 只出现一个 `Configure Pairing Bid` 弹窗。
- 不出现第二个 `Choose Pairing Run` 弹窗。
- 保存后 Existing 中该条件更新成功。

## 回归范围

- 非 `Pairing Number` 条件的新增、收藏、编辑不受影响。
- `Search Pairings` 页面现有 Pairing Number occurrence 流程不受本次改动影响。
- 左侧 `BIDDING CALENDAR` Pairing 添加入口不受本次改动影响。
