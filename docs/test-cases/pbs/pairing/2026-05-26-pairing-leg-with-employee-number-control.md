# PBS Pairing「Any/Every Leg With Employee Number」测试用例

## 范围

验证 Pairing property `115`：

- UI 使用 crew 多选搜索。
- 保存值为 `crew_id` 列表。
- 后端按 `roster_flight.crew_id` 对 pairing leg 做 Any / Every 过滤。

## 前置条件

- PBS Portal 和 PBS Server 可正常启动。
- 当前 live schema 中存在 `crew` 数据，例如 `crew.crew_id` 有值。
- `roster_flight` 中存在带 `pairing_id` 的飞行任务数据。

## 操作步骤与预期结果

### 1. 打开配置窗口

1. 进入 PBS Portal Pairing 页面。
2. 在可用属性中找到 `Any/Every Leg With Employee Number`。
3. 点击配置或添加。

预期：

- Mode 只显示或只允许 `Award`。
- Quantifier 显示 `Any` / `Every`。
- Bid 区域显示可搜索的 Employee Number 输入框。
- 输入框初始为空，不带假的默认员工号。

### 2. 搜索并选择 crew

1. 在 Employee Number 输入框输入 crew id 或姓名片段，例如 `5510` 或 `Peter`。
2. 从下拉结果中选择 `5510 - Peter Adams`。

预期：

- 下拉展示 `crew_id + 姓名`。
- 选择后 tag 中保存/展示 `5510`。
- 可继续搜索并选择多个 crew。
- 删除 tag 后，对应 crew 从 bid 列表移除。

### 3. Any 语义

1. 选择 `Award` + `Any`。
2. 选择至少一个 crew id。
3. 保存并预览/搜索 Pairing。

预期：

- 返回结果中至少有一个有效 leg 在 `roster_flight` 中匹配所选 `crew_id`。
- 没有匹配 crew 的 Pairing 不应返回。

### 4. Every 语义

1. 选择 `Award` + `Every`。
2. 选择至少一个 crew id。
3. 保存并预览/搜索 Pairing。

预期：

- 返回结果中的每一个有效 leg 都能在 `roster_flight` 中匹配所选 `crew_id` 列表中的任一值。
- 任意有效 leg 没有匹配 crew 时，该 Pairing 不应返回。

### 5. 空值校验

1. 不选择任何 crew id。
2. 尝试保存。

预期：

- 前端不允许确认，或后端返回校验错误。
- 后端错误语义为需要至少一个 crew id。

## 异常/边界场景

- 搜索无结果时显示空结果提示。
- crew 搜索接口失败时显示加载失败提示。
- 输入重复 crew id 时只保留一份。
- 115 不允许 Avoid。
- 115 不支持其他 operator。
- 不使用 `crew.employee_no` 作为匹配字段，因为当前数据中该字段为空。

## 回归范围

- Pairing Number autocomplete 仍可正常搜索和选择。
- Airport / City tag-list autocomplete 仍可正常使用。
- Pairing Check-In Time、Any/Every Duty On Date / Day、TAFB、Any Enroute Check-In Time 等近期修复条件不回退。
