# Pairing Summary 结构化文案回归

## 前置条件

- Current Bid 中存在 Flight Number Preference：`I7013, I7153`，日期为 `2026-06-30`，T1。
- Current Bid 中存在 Pairing Length：2–3 days，无日期限制，T1/T2。

## 步骤与预期

1. 打开 PBS Portal 的 Current Bid Summary。
2. 确认显示 `Award pairings with flights I7013, I7153 on Jun 30, 2026`。
3. 确认显示 `Award pairings with length between 2 and 3 days`。
4. 确认 T1、T2 和 PREVIEW 操作正常显示。
5. 检查页面正文、tooltip 和可访问名称，均不得出现 `{"type":`、`flight-number-preference` 或 `pairing-length-preference`。
6. 构造无法解析或 type/property 不匹配的 Json bid，确认显示 `needs review`，且不显示原始 JSON。
