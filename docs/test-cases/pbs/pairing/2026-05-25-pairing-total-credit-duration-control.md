# PBS Pairing Total Credit 时长控件回归测试

## 前置条件

- PBS Portal 可登录测试账号。
- PBS Server 使用测试 schema，并能读取 Pairing catalog。
- `Pairing Total Credit` 在 Pairing 可选 property 中可见。

## 操作步骤与预期结果

1. 进入 PBS Portal 的 Pairing 页面。
2. 在 Add Property 中选择 `Pairing Total Credit`。
3. 打开 `Configure Pairing Bid` 弹窗。
4. 预期：控件显示 operator 下拉和 credit 时长输入框，不是普通任意文本框。
5. 输入 `s` 或 `08:75`。
6. 预期：该 bid 不允许作为有效配置保存；后端请求也会被拒绝。
7. 输入 `8:00` 后离开输入框。
8. 预期：值规范化为 `08:00`。
9. 将 operator 切换为 `Between`。
10. 预期：出现 from/to 两个时长输入框，默认使用原值。
11. 输入 `08:00` 到 `12:00` 并保存。
12. 预期：页面 summary 显示 `Between 08:00 - 12:00`。
13. 使用该条件进入 Search Pairings preview。
14. 预期：搜索结果按 pairing 总 credit 分钟过滤，不报“不支持 Pairing Total Credit”。

## 边界场景

- `112:30` 应可作为合法总 credit 时长。
- `8:00` 应可输入并规范化为 `08:00`。
- `08:7`、`08:75`、`abc` 应为非法值。
- `Pairing Check-In Time` 的多行 bid 行为不应受影响。

## 回归范围

- Pairing 当前规则保存。
- Pairing favorite 保存。
- Pairing Search preview。
- Pairing bid summary 展示。
- 旧的 Days Off / Line bid 时长控件不在本次改动范围内。
