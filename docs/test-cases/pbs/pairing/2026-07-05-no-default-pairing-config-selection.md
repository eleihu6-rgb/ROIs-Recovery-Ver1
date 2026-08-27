# Pairing 新增配置弹窗不默认业务选择 QA 用例

## 前置条件

- 登录 PBS Portal。
- 当前 bid period 允许编辑。
- Pairing 页面可加载 `ALL PROPERTIES`。

## 用例 1：Flight Legs per Duty 新增弹窗无默认业务选择

1. 进入 `Pairing` 页面。
2. 在右侧 `ADD PAIRING PROPERTIES` 切到 `ALL PROPERTIES`。
3. 搜索并点击 `Flight Legs per Duty` 的新增按钮。

预期：

- `T1-T7` 全部未选。
- `Award / Avoid` 全部未选。
- `Any / Every` 全部未选。
- `BID` operator 下拉未选，不应显示 `=` 为当前值。
- 数字输入仍显示最小可用值 `1`，不要求为空。
- `ADD BID` 和 `SAVE FAVORITE` 均不可点击。

## 用例 2：补齐必选项后才可提交

1. 延续用例 1。
2. 选择一个 tier，例如 `T2`。
3. 选择 `Award`。
4. 选择 `Any`。
5. 在 operator 下拉选择 `=`。

预期：

- `ADD BID` 变为可点击。
- 提交后新增条件显示用户选择的 `Award · Any · = 1` 语义。

## 用例 3：已有 bid 编辑不被清空

1. 在 Pairing 页面找到一个已有 Pairing bid。
2. 点击该 bid 的编辑按钮。

预期：

- 已保存的 tier、mode、quantifier、operator、bid 值保持原样。
- 不会因为新增弹窗规则而被清空。

## 回归范围

- Pairing 新增 catalog property。
- Pairing 已有 bid 编辑。
- Search Pairings criteria 编辑。
- Days Off / Line / Reserve 新增 bid 的既有“不默认 T1”行为。
