# PBS Pairing Existing Properties Actions 列布局回归

## 目标

验证 Pairing 页面右侧 `EXISTING PAIRING PROPERTIES` 区域在常用桌面宽度下不会裁剪 `COUNT` / `ACTIONS` 列，用户可以完整看到并点击编辑、预览、删除图标。

## 前置条件

- PBS Portal 可正常登录。
- 当前 period 处于可编辑状态。
- 当前用户已有至少 2 条 Pairing existing properties，其中至少包含：
  - 1 条 `Pairing Number`，且 count 有值。
  - 1 条其他 Pairing 条件，例如 `Any Landing In Airport` 或 `Pairing Total Credit`。

## 操作步骤

1. 打开 PBS Portal，进入 `Pairing` 页面。
2. 观察右侧 `EXISTING PAIRING PROPERTIES` 列表。
3. 检查表头是否完整显示：`PROPERTY`、`BID`、`TIERS`、`COUNT`、`ACTIONS`。
4. 检查每一行最右侧是否完整显示编辑、预览、删除图标。
5. 点击编辑图标，确认配置弹窗正常打开。
6. 关闭弹窗后点击预览图标，确认跳转或预览行为正常。
7. 在浏览器宽度约 `1440px`、`1600px`、`1920px` 分别重复步骤 2-4。

## 预期结果

- `ACTIONS` 表头不被右侧容器裁剪。
- 每行动作图标完整可见，不被右侧边界遮挡。
- `COUNT` 徽标完整显示，不挤占 `ACTIONS` 列。
- 长 `BID` 内容在自己的卡片内换行或折叠，不把右侧列推出容器。
- 编辑、预览、删除动作都可以正常点击。

## 边界场景

- `Pairing Number` 选择较多 pairing 时，`BID` 卡片仍只占 `BID` 列空间，右侧 `TIERS` / `COUNT` / `ACTIONS` 不发生横向裁剪。
- `COUNT` 为 `0 pairings`、有数值、loading 三种状态下，列宽保持稳定。
- 多条 existing properties 连续显示时，每行右侧动作列对齐。

## 回归范围

- Pairing 页面 `EXISTING PAIRING PROPERTIES`。
- Pairing existing rule 的编辑、预览、删除入口。
- Pairing right panel 在常用桌面宽度下的横向布局。
