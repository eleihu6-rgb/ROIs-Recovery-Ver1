# PBS Pairing 预览小眼睛语义回归测试

日期：2026-06-02  
模块：PBS Portal / Pairing  
范围：`ADD PAIRING PROPERTIES`、`FAVORITED PROPERTIES`、`EXISTING PAIRING PROPERTIES` 的 preview 小眼睛入口。

## 前置条件

- 已登录 PBS Portal。
- 当前 bid period 有 Pairing 页面草稿数据。
- `EXISTING PAIRING PROPERTIES` 至少有一条已添加 pairing property。
- `FAVORITED PROPERTIES` 至少有一条已保存 favorite property。

## 测试用例

### 1. ALL PROPERTIES 不显示预览小眼睛

操作步骤：

1. 打开 Pairing 页面。
2. 在右侧进入 `ADD PAIRING PROPERTIES`。
3. 选择 `ALL PROPERTIES`。
4. 查看普通 property 行，例如 `Prefer Pairing Length`。

预期结果：

- 普通 property 行显示 add 按钮。
- 普通 property 行不显示小眼睛 preview 按钮。
- 点击 add 后正常打开配置弹窗。

### 2. FAVORITED PROPERTIES 保留单条预览

操作步骤：

1. 在 `ADD PAIRING PROPERTIES` 中切换到 `FAVORITED PROPERTIES`。
2. 找到一条 favorite property。
3. 点击该行小眼睛。

预期结果：

- 页面进入 Search Pairings。
- Search Pairings 按该 favorite 的完整条件显示 preview 结果。
- 不要求用户重新填写该条件。

### 3. EXISTING 整体预览保留

操作步骤：

1. 回到 Pairing 页面。
2. 确认 `EXISTING PAIRING PROPERTIES` 中有已添加条件。
3. 点击顶部 `SEARCH PAIRINGS`。

预期结果：

- 页面进入 Search Pairings。
- Search Pairings 按当前已添加条件整体组合预览。
- 如果多个 tier 有 active 条件，应按当前或首个 active tier 发起整体预览。

### 4. EXISTING 单条条件预览

操作步骤：

1. 回到 Pairing 页面。
2. 在 `EXISTING PAIRING PROPERTIES` 中选择任意一条已添加条件。
3. 点击该行小眼睛。

预期结果：

- 页面进入 Search Pairings。
- Search Pairings 只按这一条条件预览 pairing。
- 不应把其它 existing 条件一起带入该次单条预览。

### 5. 操作回归

操作步骤：

1. 在 `EXISTING PAIRING PROPERTIES` 中点击 edit。
2. 在 `EXISTING PAIRING PROPERTIES` 中点击 delete。
3. 在 `EXISTING PAIRING PROPERTIES` 中切换 tier。
4. 在 `FAVORITED PROPERTIES` 中点击 add。
5. 在 `FAVORITED PROPERTIES` 中删除 favorite。

预期结果：

- 以上操作仍保持原有行为。
- 新增的小眼睛不影响 edit、delete、tier toggle、favorite add/delete。
