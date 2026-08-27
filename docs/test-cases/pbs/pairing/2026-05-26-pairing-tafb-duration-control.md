# PBS Pairing TAFB 控件与搜索回归测试

## 背景

旧库定义 `TAFB(propertyCode=113)` 为 duration 类型，格式 `HHH:MM`，支持 `<`、`>`、`Between`，不支持 `=`。本次回归确认页面不再使用普通文本框，并确认后端按 `pairing.tafb` 分钟值搜索。

## 人工测试步骤

1. 打开 PBS Pairing Bid 页面，进入 `Configure Pairing Bid`。
2. 选择 `TAFB`。
3. 确认弹窗中有 `Mode` 和 `Bid` operator。
4. 确认 operator 只有 `<`、`>`、`Between`，没有 `=`。
5. 选择 `>`，输入 `020:00`，确认可以保存。
6. 再次编辑该 bid，选择 `Between`。
7. 确认显示两个 duration 输入框，输入 `070:00` 和 `090:00`，确认可以保存。
8. 输入非法值，例如 `010:75` 或空值，确认保存按钮不可用或后端拒绝保存。

## API 回归

`propertyCode=113` 接受：

```json
{
  "type": "duration",
  "value": "020:00",
  "operator": ">"
}
```

`propertyCode=113` 接受：

```json
{
  "type": "duration-range",
  "from": "070:00",
  "to": "090:00"
}
```

`propertyCode=113` 拒绝旧自由文本：

```json
{
  "type": "text",
  "value": "020:00"
}
```

预期错误：

```text
TAFB requires duration bid.
```

`propertyCode=113` 拒绝 `=`：

```json
{
  "type": "duration",
  "value": "020:00",
  "operator": "="
}
```

预期错误：

```text
TAFB supports <, >, or Between only.
```

## 搜索语义验收

- `020:00` 转换为 `1200` 分钟。
- `070:00` 到 `090:00` 转换为 `4200` 到 `5400` 分钟。
- SQL 使用 `p.tafb::numeric` 比较。
- `Avoid` 对正向条件取反。
