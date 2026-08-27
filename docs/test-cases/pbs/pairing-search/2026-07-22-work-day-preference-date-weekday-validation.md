# Work Day Preference 日期与星期一致性校验 QA 测试案例

## 测试目标

验证 `Work Day Preference` 的日期限制与所选 Work Day 完全无交集时，Portal 会保留输入、显示错误并阻止保存；修正后能够立即恢复保存。

## 前置条件

- 已登录 PBS Portal。
- 当前 Bid Period 包含待测日期。
- Pairing 页面可正常打开 `Configure Work Day Preference`。
- 测试账号具有新增和编辑 Pairing Bid 的权限。

## Case 1：Specific Date 与 Work Day 完全不匹配

### 操作步骤

1. 打开 Pairing 页面，新增 `Work Day Preference`。
2. 选择一个 Tier。
3. 选择 `Tue`，填写 Check-In `15:35-19:35`。
4. 开启 `LIMIT TO EVENT DATE`，保持 `Specific Dates`。
5. 选择 `2026-07-01`（Wed）。

### 预期结果

- 显示 `Selected dates do not match the selected work days.`。
- `ADD BID` 和 `SAVE FAVORITE` 禁用。
- Tue、时间窗口和日期均保持不变。
- 错误能够被屏幕阅读器即时播报，日期区域关联该错误描述。

## Case 2：修正 Work Day 后恢复

### 操作步骤

1. 延续 Case 1。
2. 取消 `Tue`，选择 `Wed`。
3. 填写 Wed Check-In `15:35-19:35`。

### 预期结果

- 错误立即消失。
- 其他必填项完整时，`ADD BID` 和 `SAVE FAVORITE` 恢复可用。
- 不需要关闭并重新打开弹窗。

## Case 3：多个 Specific Dates 至少一个匹配

### 操作步骤

1. 选择 `Tue`，填写完整时间窗口。
2. 选择 `2026-06-30`（Tue）和 `2026-07-01`（Wed）。

### 预期结果

- 不显示日期与 Work Day 不匹配错误。
- 其他必填项完整时允许保存。
- 保存 payload 保留两个日期。

## Case 4：短 Date Range 完全不匹配

### 操作步骤

1. 选择 `Tue`，填写完整时间窗口。
2. 切换到 `Date Range`。
3. 选择 `2026-07-01` 至 `2026-07-05`。

### 预期结果

- 该范围不包含 Tuesday，显示错误并禁止保存。

## Case 5：Date Range 包含匹配星期

### 操作步骤

1. 延续 Case 4。
2. 将结束日期改为 `2026-07-07`。

### 预期结果

- 范围包含 Tuesday，错误消失并恢复保存。

## Case 6：关闭日期限制

### 操作步骤

1. 构造任意日期与 Work Day 完全不匹配的条件。
2. 关闭 `LIMIT TO EVENT DATE`。

### 预期结果

- 日期错误立即消失。
- 日期控件收起，保存 payload 不包含旧 `dateScope`。
- Work Day 和 Check-In 时间窗口保持不变。

## Case 7：编辑历史无效 Draft

### 操作步骤

1. 打开一个已保存的无交集条件，例如 Tue + `2026-07-01`。

### 预期结果

- 原值完整回显。
- 立即显示错误，`UPDATE BID` 禁用。
- 修正日期或 Work Day 后，`UPDATE BID` 恢复可用。

## 回归范围

- 无日期限制的 Work Day Preference 仍可正常保存。
- 多个 Work Day 的时间窗口保持独立。
- 起止时间相等仍无效。
- 跨午夜窗口（例如 `22:00-04:00`）仍有效。
- Pairing 与 Search Pairings 两个配置入口行为一致。
