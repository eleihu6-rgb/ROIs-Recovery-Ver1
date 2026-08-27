# PBS Period 移除 Filiale 测试

## 页面检查

1. 打开 `PBS Admin > Period`，确认列表没有 `Filiale` 列。
2. 打开 Add Period，确认没有 `Filiale` 字段，填写其余必填项后可正常保存。
3. 编辑 Period，确认没有 `Filiale` 字段并可正常保存。
4. 打开 Generate PBS Year，确认没有 `Filiale` 字段，预览和保存均正常。

## 接口检查

1. Period 列表、新增、编辑和年度生成响应均不包含 `filiale`。
2. 正常新增、编辑、年度预览和年度生成请求均不包含 `filiale`。
3. GET 查询参数携带 `filiale` 时返回 HTTP 400。
4. POST、PATCH、Generate Year Preview 或 Generate Year 请求体携带 `filiale` 时返回 HTTP 400。

## 数据检查

1. Period 仍按 `Period Code` 匹配或创建 `roster_period`。
2. `roster_period` 表结构不变，无 migration。
3. Crew、Pairing、Rule、Scenario 等模块的 Filiale 行为不受影响。
