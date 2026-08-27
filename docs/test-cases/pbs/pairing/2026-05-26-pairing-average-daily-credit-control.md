# PBS Pairing Average Daily Credit 控件与搜索回归测试

## 背景

旧库定义 `Average Daily Credit(propertyCode=109)` 为 credit 类型，格式 `HH:MM`，支持 `<`、`=`、`>`、`Between`。本次回归用于确认页面不再使用自由文本框，并确认后端按 daily average credit 生成搜索条件。

## 人工测试步骤

1. 打开 PBS Pairing Bid 页面，进入 `Configure Pairing Bid`。
2. 选择 `Average Daily Credit`。
3. 确认弹窗中有 mode/action、operator 和 credit 输入框。
4. 选择 `>`，输入 `005:30`，确认可以保存。
5. 再次编辑该 bid，选择 `Between`。
6. 确认显示两个输入框，输入 `004:00` 和 `005:30`，确认可以保存。
7. 输入非法值，例如 `08:75` 或空值，确认保存按钮不可用或后端拒绝保存。
8. 通过 Search Pairings / Current Rules 预览，确认生成的筛选语义为：

```text
Average Daily Credit = Pairing Total Credit / Pairing Length
```

## API 回归

- `propertyCode=109` 接受：

```json
{ "type": "duration", "value": "005:30", "operator": ">" }
```

- `propertyCode=109` 接受：

```json
{ "type": "duration-range", "from": "004:00", "to": "005:30" }
```

- `propertyCode=109` 拒绝旧自由文本：

```json
{ "type": "text", "value": "005:30" }
```

预期错误：

```text
Average Daily Credit requires duration bid.
```

## 验收标准

- 页面上 `Average Daily Credit` 看起来与 `Pairing Total Credit` 一样是 credit duration 控件。
- `Between` 使用两个 credit duration 输入。
- SQL 参数将 `005:30` 转为 `330` 分钟，将 `004:00` 到 `005:30` 转为 `240` 到 `330` 分钟。
- SQL 表达式按 `sum(segment credit minutes) / greatest(coalesce(p.duration_days, 1), 1)` 比较。
