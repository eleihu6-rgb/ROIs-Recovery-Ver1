# Pairing Preference 手工测试用例

> 历史废弃：本文记录的是包含 `LIMIT TO RUN DATE` 和 `FULFILMENT` 的过渡实现。
> 当前标准答案语义以 `docs/test-cases/pbs/pairing/2026-07-16-pairing-preference-filterable-picker.md` 和 `docs/superpowers/specs/2026-07-16-pbs-pairing-preference-standard-answer-semantics-design.md` 为准。

## 前置条件

- `pbs-server` 使用已包含 `Pairing Preference` 102 catalog 的数据库。
- `pbs-portal` 能进入 Pairing 页面，当前 bid period 有可搜索的 pairing number。
- 测试账号有权限新增、保存、编辑 Pairing bid。

## 用例 1：新增不限制日期的 Pairing Preference

1. 打开 Pairing 页面。
2. 在 `ADD PAIRING PROPERTIES` 中点击 `Pairing Preference`。
3. 确认弹窗标题为 `Configure Pairing Preference`。
4. 保持 `T1` 选中，选择 `Award`。
5. 在 `PAIRING NUMBER` 中搜索并选择至少一个 pairing number。
6. 保持 `LIMIT TO RUN DATE` 关闭。
7. 在 `FULFILMENT` 中填写 `Maximum required = 2`。
8. 点击 `ADD BID`。

预期结果：
- `ADD BID` 在 pairing number 和 fulfilment 未完成前禁用。
- 提交后 Existing Pairing Properties 显示 `Pairing Preference`。
- Bid 摘要显示选择的 pairing number 和 `Maximum 2`，不包含日期。
- 后端 payload 的 `dateScope` 为 `null`，不会提交关闭开关前的缓存日期。

## 用例 2：限制单个运行日期

1. 新增或编辑 `Pairing Preference`。
2. 选择一个 pairing number。
3. 打开 `LIMIT TO RUN DATE`。
4. 选择 `Specific Date`。
5. 选择该 pairing 实际运行的一天。
6. 填写 `Minimum required = 1`。
7. 点击 `ADD BID` 或 `SAVE FAVORITE`。

预期结果：
- 单日日期控件可打开并在选择日期后关闭。
- 选中有效运行日期时错误提示消失，按钮可用。
- 摘要包含 `on YYYY-MM-DD` 和 `Minimum 1`。

## 用例 3：日期与 pairing 不匹配时拦截提交

1. 选择一个 pairing number。
2. 打开 `LIMIT TO RUN DATE`。
3. 选择 `Specific Date` 或 `Date Range`。
4. 选择该 pairing 不运行的日期或日期范围。

预期结果：
- 页面显示日期范围无匹配运行的错误。
- `ADD BID` 和 `SAVE FAVORITE` 禁用。
- 若绕过前端请求，后端返回 400，提示 selected pairing 不在该日期范围运行。

## 用例 4：Fulfilment 数量防呆

1. 选择一个 pairing number。
2. 填写 `Minimum required = 3`，`Maximum required = 2`。
3. 再将任一数量改为大于匹配 run 数。

预期结果：
- `Minimum required cannot exceed maximum required.` 时按钮禁用。
- 数量超过匹配 run 数时按钮禁用。
- 数字输入框清空后不会提交 `NaN`；至少一个数量为空时仍允许另一个有效数量提交。

## 回归范围

- 旧的 `pairing-id-list` 与 `pairing-occurrence-list` 历史 102 数据仍可读取并展示。
- Search Pairings 中引用 102 的预览条件仍按 pairing id 过滤。
- Days Off 和 Line bid 不接受 `pairing-preference` payload。
