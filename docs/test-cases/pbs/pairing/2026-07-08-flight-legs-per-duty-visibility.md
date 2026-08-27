# Pairing Flight Legs per Duty 可见性 QA 用例

## 前置条件

- 已执行 `2026-07-08-pbs-flight-legs-per-duty-property.sql` 或等效 DB 变更。
- 已执行 `2026-07-08-pbs-bid-property-visibility-restore.sql` 或等效 DB 变更。
- PBS Portal 已清理 pairing property catalog 缓存。
- 当前账号可以进入 PBS Portal 的 Pairing 页面。

## 用例 1：保留并重命名 107

1. 登录 PBS Portal。
2. 进入 `Pairing` 页面。
3. 在右侧 `ADD PAIRING PROPERTIES` 切到 `ALL PROPERTIES`。
4. 搜索 `Flight Legs per Duty`。

预期：

- 可以看到 `Flight Legs per Duty`。
- 点击新增后弹窗标题/副标题显示 `Flight Legs per Duty`。
- 弹窗仍支持 `Award / Avoid`、`Any / Every`、`< / = / >` 和数字输入。

## 用例 2：恢复显示 108 / 124 / 130

1. 保持在 `ALL PROPERTIES`。
2. 分别搜索：
   - `Total Legs In Pairing`
   - `Total Legs In First Duty`
   - `Total Legs In Last Duty`

预期：

- 三个旧条件都出现在可新增 property 列表中。
- 不要求它们出现在 `TOP USED` / recommended 区域。

## 用例 3：Search Pairings 使用同一可见 catalog

1. 进入 `Search Pairings`。
2. 打开新增 criteria 的 property picker。
3. 搜索 `Flight Legs per Duty` 和三个旧条件。

预期：

- `Flight Legs per Duty` 可选。
- `Total Legs In Pairing`、`Total Legs In First Duty`、`Total Legs In Last Duty` 可选。

## 回归范围

- Pairing 主页面 `ALL PROPERTIES`。
- Pairing recommended / top used property。
- Search Pairings criteria picker。
- 已保存的其他 Pairing bid 展示与编辑。
