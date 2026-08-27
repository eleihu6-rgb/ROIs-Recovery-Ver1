# PBS Pairing - Deadhead Legs 回归测试

## 前置条件

- 已登录 PBS Portal。
- 当前存在可编辑的 Current pairing draft。
- 后端已部署包含 `Deadhead Legs` 数量条件支持的版本。

## 测试步骤

1. 在 Pairing 条件列表中找到 `Deadhead Legs`。
2. 打开该条件的配置弹窗。
3. 确认 `BID` 是数字输入，operator 只显示 `= / < / > / Between`。
4. 新增一个 `Deadhead Legs = 2` 条件并保存。
5. 再新增一个 `Deadhead Legs Between 1 and 3` 条件并保存。
6. 刷新页面或重新打开草稿，确认条件能正常回显。
7. 可选：切换 `Award / Avoid`，确认保存后语义不变。

## 预期结果

- `Deadhead Legs` 使用数量比较，不是时间控件。
- `Between` 可正常保存并回显为区间。
- `Award / Avoid` 均可正常保存。
- 页面不会出现 `Any / Every` 相关控件。

## 异常与边界

- 提交文本型 bid 时，后端应拒绝并返回 `Deadhead Legs requires number bid.`。
- 提交 `stepper-range` 时，后端应接受。
- 提交 `stepper` 时，后端应接受。

## 回归范围

- Pairing 条件弹窗
- Current draft 保存与回显
- Search Pairings 预览条件生成
- 后端 propertyCode=122 校验
