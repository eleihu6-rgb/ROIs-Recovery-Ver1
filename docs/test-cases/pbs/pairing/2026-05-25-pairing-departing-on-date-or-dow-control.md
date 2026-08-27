# PBS Pairing Departing On 日期 / 星期控件测试案例

## 前置条件

- 登录 PBS Portal。
- 当前 bid period 已有可编辑的 Current Pairing draft。
- Pairing property catalog 中 `Departing On(propertyCode=106)` 可见。
- 后端连接的 live pairing 数据中存在不同 origin date 的 pairing。

## 用例 1：Award + In + 具体日期

1. 进入 `Pairing` 页面。
2. 打开 `Departing On` 配置弹窗。
3. 选择 `Award`。
4. operator 选择 `In`。
5. 在 Date 区域添加一个或多个日期。
6. 点击保存。

预期结果：

- 弹窗中不出现自由 code/tag 输入框。
- 保存成功。
- 已配置列表 summary 显示所选日期。
- Search Pairings / Current Rules 按 pairing origin date 命中对应 pairing。

## 用例 2：Award + In + 星期

1. 打开 `Departing On` 配置弹窗。
2. 选择 `Award`。
3. operator 选择 `In`。
4. 在 Day 区域选择 `Mon`、`Wed`。
5. 点击保存。

预期结果：

- 保存成功。
- summary 显示 `Mon, Wed`。
- 后端搜索按 pairing origin date 的星期一、星期三过滤。

## 用例 3：Award + In + 日期和星期混合

1. 打开 `Departing On` 配置弹窗。
2. 选择 `Award`。
3. operator 选择 `In`。
4. 添加一个具体日期。
5. 选择一个星期。
6. 点击保存。

预期结果：

- 保存成功。
- 日期和星期是 OR 关系，命中任意一类即可。
- 数据结构不保存为普通 `tag-list`。

## 用例 4：Avoid + Between + 日期范围

1. 打开 `Departing On` 配置弹窗。
2. 选择 `Avoid`。
3. operator 选择 `Between`。
4. 输入 From Date 和 To Date。
5. 点击保存。

预期结果：

- 保存成功。
- summary 显示日期范围。
- 后端搜索使用 `not (...)` 排除该日期范围内出发的 pairing。

## 用例 5：空值不能保存

1. 打开 `Departing On` 配置弹窗。
2. 选择 `Award`。
3. operator 选择 `In`。
4. 不选择日期和星期。

预期结果：

- 保存按钮保持不可用或提交失败并提示。
- 不产生空的 `Departing On` bid。

## 用例 6：非法日期范围不能保存

1. 打开 `Departing On` 配置弹窗。
2. 选择 `Award`。
3. operator 选择 `Between`。
4. 输入 `To Date` 早于 `From Date`。

预期结果：

- 保存按钮保持不可用或后端返回校验错误。
- 不产生非法日期范围 bid。

## 用例 7：不接受旧错误时间值

1. 通过接口或调试工具尝试提交：
   - `propertyCode=106`
   - `bid.type="date-range"`
   - `from="09:10"`
   - `to="09:20"`

预期结果：

- 后端拒绝该 payload。
- 错误值不进入 PBS bid 数据。

## 回归范围

- Pairing Check-In Time 多条件 OR 不受影响。
- Pairing Total Credit duration 控件不受影响。
- Pairing Number / Airport / Aircraft 等普通 tag-list property 不受影响。
- Days Off / Line 不接受 Pairing 专属 `date-or-dow-list` bid。

