# PBS Pairing Rules 条件摘要可读化测试用例

## 目标

验证 `EXISTING PAIRING PROPERTIES` 的 rules 视图和 `Search Pairings` current-rules preview 不再把 `Pairing Number` 条件显示成长文本串，而是显示用户可读的 grouped summary。

## 前置条件

- PBS Portal 能正常登录。
- 当前 bid period 可进入 Pairing 页面。
- 当前用户已有 `Pairing Number` bid，且同一 tier 下包含多个 pairing / run date。

## 操作步骤

1. 打开 PBS Portal。
2. 进入 `Pairing` 页面。
3. 在右侧 `EXISTING PAIRING PROPERTIES` 中确认存在 `Pairing Number` bid。
4. 点击 `VIEW RULES`。
5. 检查 `Pairing Number` rule condition。
6. 点击 `Show all N selected`。
7. 再点击 `Show less`。
8. 点击 `SEARCH PAIRINGS` 进入 Search Pairings。
9. 检查 `SEARCH CRITERIA` 上方的 current rules preview 中的 `Pairing Number` rule condition。

## 预期结果

- rules 视图不显示完整长串，例如：
  - `Pairing Number: Award · E4101 on 2026-06-05; E4103 on ...`
- rules 视图显示用户可读摘要：
  - `Pairing Number`
  - `Award · N selected`
  - 前几组 pairing number 和日期，例如 `E4103 · Jun 05, Jun 08, Jun 10 +N more`
  - 超出组数显示 `+N more pairings`
- `Show all N selected` 可以展开完整列表。
- `Show less` 可以收起。
- `AND` / `OR` 关系仍然清楚可见。
- `Search Pairings` current-rules preview 与 Pairing 主页面 rules 视图展示一致。

## 边界场景

- 只有 1 个 Pairing Number bid 时，不应出现不必要的展开按钮。
- 多个 pairing number / 多个 run date 时，摘要不应撑爆右侧面板。
- 普通短条件，例如 `Any Landing In Airport: Award · Any · EWR`，仍保持短 pill 文案，不被误改成复杂卡片。

## 回归范围

- Pairing 主页面 existing properties 表格。
- Pairing 主页面 rules view。
- Search Pairings current rules preview。
- Search Criteria 中的 Pairing Number readable summary。
- Pairing Number 编辑弹窗。
