# PBS Pairing Any Enroute Check-In Time 控件与搜索回归测试

## 背景

旧库定义 `Any Enroute Check-In Time(propertyCode=114)` 为 `time_of_day`，支持 `<`、`=`、`>`、`Between`，固定为 `Any` 语义。当前回归确认页面补上 `Between`，并确认后端不会再把 `=` 当成 `>`。

## 人工测试步骤

1. 打开 PBS Pairing Bid 页面，进入 `Configure Pairing Bid`。
2. 选择 `Any Enroute Check-In Time`。
3. 确认弹窗中有 `Mode` 和 `Bid` operator。
4. 确认 operator 包含 `<`、`=`、`>`、`Between`。
5. 选择 `=`，输入 `06:00`，确认可以保存。
6. 选择 `Between`，确认显示 from/to 时间输入。
7. 输入 `19:00` 到 `23:59`，确认可以保存。
8. 使用 `Avoid` 保存，确认 Search Pairings / Current Rules 能正常预览。

## API 回归

`propertyCode=114` 接受：

```json
{
  "type": "time",
  "value": "06:00",
  "operator": "="
}
```

`propertyCode=114` 接受：

```json
{
  "type": "time-range",
  "from": "19:00",
  "to": "23:59"
}
```

## 搜索语义验收

- SQL 使用 `exists`。
- SQL 保持 `s.duty_seq > 1`，只匹配 enroute duty。
- `=` 生成等值比较，不再被转换成 `>`。
- `Between` 生成 time range 比较。
- `Avoid` 对正向条件取反。
