# PBS Portal Days Off：Days Off / Days On Pattern 人工测试用例

日期：2026-05-20  
范围：验证 `Days Off / Days On Pattern` 是否按 AA / 旧库语义支持 `minDaysOff`、`minDaysOn`、`maxDaysOn` 三个字段。

## 前置条件

- 登录 PBS Portal。
- 进入 Days Off bidding 页面。
- 当前 bid period 有可编辑的 Current draft。
- `Days Off / Days On Pattern` 在 Days Off property catalog 中可见。

## 测试用例

### 1. 打开配置弹窗

步骤：

1. 在 `ADD DAYS OFF PROPERTIES` 区域搜索 `Days Off / Days On Pattern`。
2. 点击该属性右侧的添加按钮。

预期：

- 弹窗标题为 `Configure Days Off Bid`。
- 副标题显示 `Days Off / Days On Pattern`。
- 表单中显示 `Pattern`。
- 表单中显示规则句式 `Work between [ ] and [ ] days on`。
- 表单中显示规则句式 `Then at least [ ] days off`。
- 不显示 `Max days off` 或 `Min / Max` 切换按钮。

### 2. 连续工作天数顺序校验

步骤：

1. 将 `Work between` 后的第一个输入设置为 `6`。
2. 将 `and` 后的第二个输入设置为 `4`。

预期：

- 显示错误提示 `Max days on must be greater than or equal to min days on.`。
- `ADD BID` 按钮不可点击。

### 3. 正常添加

步骤：

1. 将 `Work between` 后的第一个输入设置为 `4`。
2. 将 `and` 后的第二个输入设置为 `5`。
3. 将 `Then at least` 后的输入设置为 `5`。
4. 点击 `ADD BID`。

预期：

- 弹窗关闭。
- Existing Days Off Properties 中新增 `Days Off / Days On Pattern`。
- 摘要显示 `Work 4-5 days, then at least 5 days off`。
- 保存 payload 中 bid 结构为：

```json
{
  "type": "days-off-on-pattern",
  "minDaysOff": 5,
  "minDaysOn": 4,
  "maxDaysOn": 5,
  "min": 1,
  "max": 14
}
```

### 4. 回显旧库字段

步骤：

1. 准备一条已保存的 `205` 数据：`param_a=5`，`param_b=4`，`param_c=5`，`operator=Between`。
2. 重新进入 Days Off 页面。
3. 打开该 existing property 的编辑弹窗。

预期：

- `Then at least` 后的输入回显为 `5`。
- `Work between` 后的第一个输入回显为 `4`。
- `and` 后的第二个输入回显为 `5`。
- 摘要显示 `Work 4-5 days, then at least 5 days off`。

### 5. Prefer Off 回归

步骤：

1. 打开 `Prefer Off` 配置弹窗。

预期：

- `MODIFIERS` 仍显示。
- `All or Nothing` 与 `Minimum required` 仍可编辑。

### 6. Min Consecutive Days Off In Window 回归

步骤：

1. 打开 `Min Consecutive Days Off In Window` 配置弹窗。

预期：

- 仍显示连续天数 N 输入。
- 仍显示窗口开始日期和结束日期。
- 结束日期早于开始日期时仍阻止提交。

### 7. Employee Schedule Preference 回归

步骤：

1. 打开 `Employee Schedule Preference` 配置弹窗。

预期：

- 仍显示 `Crew` 搜索下拉。
- 仍显示 `Relationship`、`Schedule Type`、`Threshold` 和 `Days`。
- `Crew` 为空时仍阻止提交。
