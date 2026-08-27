# PBS Portal Days Off：Employee Schedule Preference 人工测试用例

日期：2026-06-23

范围：验证 `Employee Schedule Preference` 是否支持通过 `Crew` 下拉选择员工，配置一起 / 不一起、上班 / 休息、最少 / 最多天数，并兼容旧 `Shared Days Off With Employee` 数据。

## 前置条件

- 登录 PBS Portal。
- 进入 Days Off bidding 页面。
- 当前 bid period 有可编辑的 Current draft。
- `Employee Schedule Preference` 在 Days Off property catalog 中可见。

## 测试用例

### 1. 打开配置弹窗

步骤：

1. 在 `ADD DAYS OFF PROPERTIES` 区域搜索 `Employee Schedule Preference`。
2. 点击该属性右侧的添加按钮。

预期：

- 弹窗标题为 `Configure Days Off Bid`。
- 副标题显示 `Employee Schedule Preference`。
- 表单中显示 `Crew` 搜索下拉。
- 表单中显示 `Relationship`，可选 `Together` / `Apart`。
- 表单中显示 `Schedule Type`，可选 `Work` / `Days Off`。
- 表单中显示 `Threshold`，可选 `Minimum` / `Maximum`。
- 表单中显示 `Days` 数字输入框。

### 2. Crew 必填校验

步骤：

1. 保持 `Crew` 为空。
2. 查看确认按钮状态。

预期：

- 显示错误提示 `Crew is required.`。
- `ADD BID` 按钮不可点击。

### 3. 正常添加 Days Off Opposite Employee

步骤：

1. 在 `Crew` 搜索并选择一个 PBS user。
2. `Relationship` 选择 `Apart`。
3. `Schedule Type` 选择 `Days Off`。
4. `Threshold` 选择 `Minimum`。
5. 在 `Days` 输入 `8`。
6. 点击 `ADD BID`。

预期：

- 弹窗关闭。
- Existing Days Off Properties 中新增 `Employee Schedule Preference`。
- 摘要显示类似 `Apart · Days Off · Crew <user_name> · Minimum 8`。
- 保存 payload 中 bid 使用 `crewId`，并可带 `crewName` 用于显示：

```json
{
  "type": "employee-schedule-preference",
  "crewId": "762",
  "crewName": "Carolyn Susan Ann Alves",
  "relationship": "apart",
  "scheduleType": "days_off",
  "thresholdType": "minimum",
  "days": 8,
  "min": 1,
  "max": 31
}
```

### 4. 旧数据兼容回显

步骤：

1. 准备一条旧 `206` 数据：`param_a=19`，`param_b=4`。
2. 重新进入 Days Off 页面。
3. 打开该 existing property 的编辑弹窗。

预期：

- `Crew` 回显为 legacy crew id `19`。
- `Relationship` 回显为 `Together`。
- `Schedule Type` 回显为 `Days Off`。
- `Threshold` 回显为 `Minimum`。
- `Days` 回显为 `4`。

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
