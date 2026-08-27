# Reserve Preference 配置弹窗 UI 统一测试案例

## 前置条件

- 使用可编辑的 Current Reserve bid period。
- Reserve Preference catalog 可见，Short-call Type 至少包含一个选项。
- 测试账号可以打开 `Bid` 页面，并在 `ROSTER` 分类看到 Reserve Preference。
- 如执行自动化测试，使用 `reserve-preference.spec.ts` 的受控 API fixture，不写入共享环境。

## 用例一：新增弹窗基础布局

1. 进入 `Bid` 页面。
2. 切换到 `ROSTER`。
3. 点击 `Reserve Preference` 的添加按钮。

预期：

- 弹窗标题为 `Configure Reserve Preference`。
- 内容顺序为 `TIERS`、`SHORT-CALL TYPE`、`DATE SCOPE`。
- T1–T7 使用与 Pairing 一致的按钮组，不显示 checkbox 网格。
- 初始没有 Tier 被选中，显示 `· REQUIRED`，`ADD BID` 禁用。
- footer 的 Cancel / Add Bid 尺寸、字号和状态与 Pairing 配置弹窗一致。

## 用例二：Whole Month / First Half / Second Half

1. 分别选择 Whole Month、First Half、Second Half。
2. 选择一个 Tier 并保存。
3. 重新打开已有条件进行编辑。

预期：

- 三种 scope 不显示日期控件。
- 保存 payload 分别只包含对应 `mode`，不残留 range 或 specific dates。
- 编辑时 Short-call Type 和 Date Scope 正确回显。

## 用例三：Date Range

1. 将 Date Scope 切换为 `Date Range`。
2. 打开范围日历。
3. 依次选择开始日期和结束日期。
4. 保存并重新编辑。

预期：

- 页面只显示一个范围选择入口，内部显示 `Start date · TO · End date`。
- 只能选择当前 bid period 日期。
- 未选完整范围时主操作按钮禁用。
- 保存 payload 为 `{ mode: "date_range", from: "YYYY-MM-DD", to: "YYYY-MM-DD" }`。
- 重新编辑时完整范围正确回显。

## 用例四：Specific Dates

1. 将 Date Scope 切换为 `Specific Dates`。
2. 从同一日历选择多个日期。
3. 删除其中一个日期后保存。

预期：

- 不显示旧的文本输入框或 `ADD DATE` 按钮。
- 已选日期在同一控件中显示并可移除。
- payload 使用去重、升序的 `YYYY-MM-DD` 字符串数组。

## 用例五：编辑已有条件

1. 点击已有 Reserve Preference 的 Edit。
2. 修改 Short-call Type 和 Date Scope。
3. 点击 `UPDATE BID`。

预期：

- 弹窗沿用与新增相同的 section、日期控件和 footer。
- 不在编辑弹窗重复显示 Tier；Tier 继续由已有条件行管理。
- 请求保持现有 property 和 payload 结构。
- pending 期间字段、关闭和 Update Bid 均不可重复操作。

## 异常与边界

### Bid period 不可用

- period code 为空或无效时，显示 `Bid period is unavailable`。
- 不得退回无日期边界的 picker。
- 主操作按钮禁用，不发送请求。

### 历史日期越界

- 已保存日期落在当前 period 外时，原始日期仍可见。
- 显示明确警告，不静默删除或截断。
- `UPDATE BID` 禁用，直到用户明确选择完整的合法日期。
- Cancel 不产生写入。

### 保存失败

- 显示现有错误 message。
- 弹窗保持打开，用户输入不丢失。

## 视觉回归

在 1920×1080 和较低高度视口分别检查：

- 弹窗不被视口裁切。
- 内容较高时 body 可滚动，footer 保持可见。
- Tier 标题和 T1–T7 稳定显示。
- 日期浮层和 focus ring 不被弹窗边缘裁切。
- Reserve 与 Pairing Preference 的标题、section、Tier 和 footer 使用同一视觉语言。
