# PBS 条件页 Add Properties 模板 / 高使用率 / 收藏展示回归用例

## 背景

本用例验证 Days Off、Pairing、Line 三个条件页的 `ADD ... PROPERTIES` 区域：

- `ALL PROPERTIES` 只作为可添加模板目录展示。
- 高使用率属性只在 `ALL PROPERTIES` 中靠前排序，不等同于用户收藏。
- `FAVORITED PROPERTIES` 只展示用户保存过的完整条件配置。
- 保存配置需要完整显示 `BID` 摘要、启用的 `Tiers` 以及适用的 `Min N` 修饰；收藏摘要不显示 `AON` 标签。

## 前置条件

- 进入 PBS Portal，用户有可编辑的当前 bid period。
- 当前用户在 Days Off、Pairing、Line 至少各有一条 configured favorite。
- 后端返回 `recommendedPropertyCodes`，并返回 `favoriteProperties`。

## 用例 1：FAVORITED 只显示保存配置

1. 打开 `Days Off` 页面。
2. 确认 `FAVORITED PROPERTIES` tab 默认在左侧且处于选中状态。
3. 确认只显示保存配置卡片：
   - 不显示 `Saved setup` 这类内部状态标题。
   - 卡片主体直接显示完整 bid 摘要，例如具体日期或范围。
   - 有保存时启用的 tier chip，例如 `T2`。
   - 适用的 Days Off 数量修饰显示为 chip，例如 `Min 1`。
   - 即使保存数据的 `allOrNothing=true`，卡片也不显示 `AON` 标签。
4. 重复验证 `Pairing` 和 `Line` 页面。

预期：

- 不显示 `BID` 表头。
- 不显示 `TIERS` 表头。
- 不显示可编辑的 available tier toggle。
- 点击 `Add <Property>` 直接按保存配置添加，不重新打开配置弹窗。

## 用例 2：ALL 只显示模板目录

1. 在 `Days Off` 页面点击 `ALL PROPERTIES`。
2. 确认高使用率属性排在列表前面，并显示 `TOP USED` 标记。
3. 确认所有模板属性都可以通过 `Add <Property>` 进入添加流程。
4. 重复验证 `Pairing` 和 `Line` 页面。

预期：

- `ALL PROPERTIES` 不显示用户保存 favorite 行。
- 不显示 `BID` 表头。
- 不显示 `TIERS` 表头。
- 不显示默认 bid 示例值，避免用户误以为这些是自己已填写的条件。
- 高使用率只影响排序，不影响收藏。

## 用例 3：保存 favorite 后可立即复用

1. 在 `ALL PROPERTIES` 中选择一个需要配置的属性。
2. 在配置弹窗填写 bid、tier 和必要修饰。
3. 点击 `SAVE FAVORITE`。
4. 确认页面跳回 `FAVORITED PROPERTIES`。

预期：

- 新保存项以收藏卡片显示，不出现 `Saved setup` 文案。
- 摘要内容与刚才填写的值一致。
- 点击 `Add <Property>` 会用该保存配置添加到 Existing 区。

## 用例 4：只隐藏 AON 摘要标签

1. 准备一条 `allOrNothing=true` 且带有 `Min N` 的收藏配置。
2. 在 `FAVORITED PROPERTIES` 查看该收藏卡片。
3. 进入仍支持 modifier 编辑的条件编辑区域。
4. 切换 `AON` checkbox，并保存其他字段修改。

预期：

- 收藏卡片不显示 `AON` 标签，但仍显示 `Min N`。
- 编辑区域原有的 `AON` checkbox 仍然可见、可操作。
- 保存时 `allOrNothing` 的 true / false 值与用户操作一致，不因摘要标签隐藏而被改写。

## 自动化覆盖

- `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`
- `pbs-portal/src/features/days-off/pages/days-off-page.test.tsx`
- `pbs-portal/src/features/rule-bids/components/rule-bid-property-table.test.tsx`
- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
- `pbs-portal/src/features/line/pages/line-page.test.tsx`
- mapper/filter 单测覆盖 `recommendedPropertyCodes` 与 `favoriteProperties` 的分离语义。
