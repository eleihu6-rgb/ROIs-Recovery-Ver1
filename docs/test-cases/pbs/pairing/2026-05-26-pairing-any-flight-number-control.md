# PBS Pairing「Any Flight Number」测试用例

## 范围

验证 Pairing property `116`：

- UI 使用 Flight Number 多选搜索。
- 保存值为航班号列表。
- 后端按 `pairing_segment.flt_num` 对 Pairing leg 做 Award / Avoid 过滤。

## 前置条件

- PBS Portal 和 PBS Server 可正常启动。
- 当前 live schema 中 `pairing_segment.flt_num` 有有效航班号数据。

## 操作步骤与预期结果

### 1. 打开配置窗口

1. 进入 PBS Portal Pairing 页面。
2. 在可用属性中找到 `Any Flight Number`。
3. 点击配置或添加。

预期：

- Mode 显示 `Award` / `Avoid`。
- 不显示 `Every`。
- Bid 区域显示可搜索的 Flight Number 输入框。
- 输入框初始为空，不带示例默认航班号。

### 2. 搜索并选择 Flight Number

1. 在 Flight Number 输入框输入航班号片段，例如 `19`。
2. 从下拉结果中选择 `1993`。

预期：

- 下拉只展示当前 Pairing leg 中存在的航班号。
- 选择后 tag 中保存/展示 `1993`。
- 可继续搜索并选择多个航班号。
- 删除 tag 后，对应航班号从 bid 列表移除。

### 3. Award 语义

1. 选择 `Award`。
2. 选择至少一个 Flight Number。
3. 保存并预览/搜索 Pairing。

预期：

- 返回结果中至少有一个有效 leg 的 `pairing_segment.flt_num` 命中所选航班号。
- 没有匹配航班号的 Pairing 不应返回。

### 4. Avoid 语义

1. 选择 `Avoid`。
2. 选择至少一个 Flight Number。
3. 保存并预览/搜索 Pairing。

预期：

- 返回结果中不存在任何有效 leg 的 `pairing_segment.flt_num` 命中所选航班号。

### 5. 空值校验

1. 不选择任何 Flight Number。
2. 尝试保存。

预期：

- 前端不允许确认，或后端返回校验错误。
- 后端错误语义为需要至少一个 flight number。

## 异常/边界场景

- 搜索无结果时显示空结果提示。
- Flight Number 搜索接口失败时显示加载失败提示。
- 输入重复航班号时只保留一份。
- 116 不允许 Every。
- 116 不显示额外 operator。

## 回归范围

- Pairing Number autocomplete 仍可正常搜索和选择。
- Employee Number autocomplete 仍可正常搜索和选择。
- Airport / City tag-list autocomplete 仍可正常使用。
- Pairing Check-In Time、Any/Every Duty On Date / Day、TAFB、Any Enroute Check-In Time 等近期修复条件不回退。
