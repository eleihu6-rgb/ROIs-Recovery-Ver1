# PBS Favorite 卡片编辑与复用测试

## 前置条件

- 当前 Bid Period 可编辑。
- Days Off、Pairing、Line 各至少存在一个 Favorite。
- Favorite 已保存完整条件，但不包含 Tx。

## 主流程

1. 打开 `Bid`，进入 `FAVORITED PROPERTIES`。
2. 检查三类卡片均以紧凑信息行显示属性名、完整条件摘要、T1-T7 和右侧操作图标，不再显示 `SELECT TX`、独立 `CONDITION` 标题或紫色 `ADD TO BID` 大按钮。
3. 未选择 Tx 时检查 Plus Circle 图标不可用；选择多个 Tx 后图标可用。
4. 点击 Pencil 图标，确认弹窗回显条件、不显示 Tx，并显示 `UPDATE FAVORITE`。
5. 修改条件并保存。
6. 确认卡片摘要更新、保存前临时选择的 Tx 仍保留，Existing Bid 未变化。
7. 点击 Plus Circle 图标，确认条件按所选 Tx 加入 Existing Bid，且当前卡片临时 Tx 被清空。

## Pairing Preview

1. 在 Pairing Favorite 卡片选择一个或多个 Tx。
2. 点击 `Preview` 进入 Search Pairings。
3. 点击 `Back` 返回 Bid。
4. 确认同一 Favorite 的临时 Tx 仍保持选中。

## 异常与边界

- PATCH 返回 409：显示持久 `Reload draft` 提示，不覆盖服务端新版本。
- PATCH 返回 404：关闭失效编辑器，显示持久 `Reload draft` / `Close`；Reload 后移除该 Favorite 和临时 Tx。
- 删除 Favorite：必须二次确认；成功后不影响由它创建的 Existing Bid。
- 刷新页面、切换 Period 或重新登录：不得恢复临时 Tx。

## 回归范围

- Days Off、Pairing、Line Favorite 的保存、编辑、删除和直接加入 Existing Bid。
- Pairing Search Preview 往返。
- 当前草稿 `draftVersion` 并发保护。
- Help 中 Favorite 操作说明。

## 紧凑卡片布局

前置条件：

- 使用 1920×1080 和 1366×768 分别检查。
- Days Off 至少准备 4 条属性名不超过 40 个字符、条件摘要不超过 80 个字符的 Favorite。
- Pairing 和 Roster 各至少准备 1 条 Favorite。

步骤：

1. 打开 `Bid`，进入 `FAVORITED PROPERTIES`。
2. 检查 Days Off、Pairing 和 Roster 收藏卡。
3. 在 1920×1080 下查看收藏列表首屏。
4. 切换到 1366×768，检查 T1–T7 和操作按钮。
5. 打开一条长条件 Favorite。
6. 分别执行 Rule Bid 的删除 Popover 和 Pairing 的卡内删除确认。

预期结果：

- 收藏卡保留边框与圆角，内部采用单条紧凑信息行，不显示独立 `CONDITION` 标题。
- 普通短条件卡高度约 56–72px；4 条短条件中至少 3 条无需先滚动即可完整显示。
- 属性名与完整条件摘要位于左侧上下两层；T1–T7 位于条件右侧、操作图标左侧，不显示 `SELECT TX`；长条件自然换行，不出现裁切或省略。
- 实际存在的修饰标签紧随条件摘要，不额外占据固定行。
- 1920×1080 和 1366×768 下，左侧内容、T1–T7、操作图标保持三栏顺序，互不重叠或横向溢出。
- Pairing 保留 Eye；Days Off、Pairing、Roster 均通过 Pencil、Eye（仅 Pairing）、Trash、Plus Circle 小图标保留原有能力。
- 右侧不显示文字操作按钮或紫色实心 Add 按钮；未选择 Tier 时 Plus Circle 置灰且不可触发。
- 两类删除确认的 Cancel、Confirm、pending 和禁用行为保持不变；仅确认展开时允许卡片临时增高。
