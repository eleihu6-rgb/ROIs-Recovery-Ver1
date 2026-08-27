# PBS Existing Property 名称换行显示回归测试

## 前置条件

- 使用已登录的 PBS Portal 账号。
- 当前 bid period 有可查看的 Days Off、Line、Pairing 草稿。
- Days Off 或 Line 中存在较长的 existing property 名称，例如 `Min Consecutive Days Off In Window` 或 `Most Flying In Least Working Days (Configured)`。
- Pairing 中存在较长的 existing property 名称，或通过测试数据构造一个较长名称的 existing pairing property。

## 操作步骤

1. 打开 PBS Portal，进入 `Days Off` 页面。
2. 查看 `EXISTING DAYS OFF PROPERTIES` 表格中的长 property 名称。
3. 进入 `Line` 页面。
4. 查看 `EXISTING LINE PROPERTIES` 表格中的长 property 名称。
5. 进入 `Pairing` 页面。
6. 查看 `EXISTING PAIRING PROPERTIES` 表格中的长 property 名称。
7. 在 Pairing 页面确认 `TIERS`、`COUNT`、`ACTIONS` 列仍在原有位置。

## 预期结果

- Days Off 的长 existing property 名称不再显示为 `...` 省略形式。
- Line 的长 existing property 名称不再显示为 `...` 省略形式。
- Pairing 的长 existing property 名称不再显示为 `...` 省略形式。
- 长名称在当前 `PROPERTY` 列内自然换行，允许行高轻微增加。
- `BID` 列没有被压窄导致内容异常。
- T1-T7 tier toggle 仍保持一行展示。
- Pairing 的 `COUNT` 列和 edit / preview / delete action 图标仍保持对齐并可点击。

## 异常 / 边界场景

- 在 1080-1920 宽度区间重复查看，长名称应继续换行而不是截断。
- 如果名称包含无空格的极长单词，应在当前列内断行，不应撑破 row。
- 悬停长名称时，浏览器原生 title 仍显示完整名称。

## 回归范围

- Days Off、Line 等复用 Rule Bid shared existing row 的页面。
- Pairing 独立 existing property row。
- Existing properties 表格的 `PROPERTY / BID / TIERS / COUNT / ACTIONS` 对齐关系。
