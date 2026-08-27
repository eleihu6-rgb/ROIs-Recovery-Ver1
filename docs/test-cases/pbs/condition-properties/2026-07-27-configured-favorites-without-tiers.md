# Configured Favorite 不保存 Tx 回归

## 范围

- 页面：Bid → `FAVORITED PROPERTIES`
- 类型：Pairing、Days Off、Roster（Line）
- 目标：收藏只保存条件配置；T1–T7 在每次加入 Existing 时临时选择。

## 前置条件

- 当前 Bid Period 可编辑。
- 三类条件各至少存在一个可配置条件。
- 使用没有旧测试数据的机组账号。

## 用例

### 1. 保存收藏不要求 Tx

1. 分别打开 Pairing、Days Off、Roster 的条件配置弹窗。
2. 填完条件，但不选择 T1–T7。
3. 检查 `ADD BID` 与 `SAVE FAVORITE`。
4. 点击 `SAVE FAVORITE`。

预期：

- 条件未完整时，两个按钮均不可用。
- 条件完整且未选择 Tx 时，`ADD BID` 不可用，`SAVE FAVORITE` 可用。
- 保存后 Existing 不新增数据。
- Favorite 卡片显示条件摘要，T1–T7 均未选中。

### 2. Favorite 卡片选择单个 Tx 后直接添加

1. 在 Favorite 卡片选择 T2。
2. 检查加号按钮。
3. 点击加号。

预期：

- 未选 Tx 时加号不可用。
- 选择 T2 后加号可用，不打开配置弹窗。
- Existing 新增一条只属于 T2 的条件。
- 成功后该 Favorite 卡片的临时 Tx 清空。

### 3. 多选 Tx

1. 在另一张 Favorite 卡片选择 T1、T3、T5。
2. 点击加号。

预期：

- Existing 使用同一条件配置，并关联 T1、T3、T5。
- 其他 Favorite 卡片的临时 Tx 不受影响。

### 4. 失败与并发冲突

1. 选择 T4，模拟普通保存失败。
2. 再选择 T4，模拟 HTTP 409 draft version 冲突。

预期：

- 两种失败均不修改 Existing，T4 保留。
- 普通失败使用统一错误提示。
- 409 显示持久错误状态和键盘可操作的 `Reload draft`。
- 点击 `Reload draft` 后重新获取当前草稿。

### 5. 删除 Favorite

1. 点击 Favorite 删除按钮。
2. 取消确认。
3. 再次删除并确认。

预期：

- 取消后 Favorite 保留。
- 确认后只删除 Favorite 模板，不删除已加入 Existing 的条件。
- 删除请求使用当前 `draftVersion`；旧版本并发请求返回 409。

### 6. 刷新与周期切换

1. 在 Favorite 卡片选择若干 Tx，但不点击加号。
2. 刷新页面，或切换 Bid Period 后再返回。

预期：

- 临时 Tx 不恢复。
- Favorite 条件配置仍存在。

### 7. 导入回滚

1. 对包含三类 Favorite 的导入运行执行 rollback。
2. 分别验证迁移前 snapshot（含旧 `tiers`）和迁移后 snapshot。

预期：

- Favorite 行及稳定 ID 恢复。
- 旧 snapshot 的 `tiers` 被忽略。
- 其他条件、分组和 Existing 数据恢复行为不变。
