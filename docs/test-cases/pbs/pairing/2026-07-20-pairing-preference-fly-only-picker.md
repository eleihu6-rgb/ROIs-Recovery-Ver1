# Pairing Preference 仅展示 FLY Pairing

## 前置条件

- 使用具有有效 Base、Rank 的 PBS crew 登录。
- Bid period 选择 `Jun 2026`。
- Pairing 数据中同时存在：
  - `assignment_group=FLY` 的正常 Pairing。
  - `assignment_group=RES` 的 CRAM、CRPM、PRAM 或 PRPM。
  - `assignment_group=GRD` 的 Ground Pairing。

## PP-FLY-01 初始候选范围

1. 打开 Pairing 页面。
2. 在 `ALL PROPERTIES` 中打开 `Pairing Preference`。
3. 检查 Pairings 表格和 Header total。

预期：

- 表格只显示 `assignment_group=FLY` 的 Pairing。
- 不显示 CRAM、CRPM、PRAM、PRPM。
- 不显示 GRD Pairing。
- Header total 和分页总数不包含 RES/GRD。

## PP-FLY-02 Search 和 Filters

1. 在 Search 输入已知 Reserve pairing number，例如 `CRAM`。
2. 清除 Search。
3. 依次使用 Pairing start date、Check-in、Check-out、Pairing days 和 Pairing credit Filters。
4. 清除 Filters。

预期：

- Search `CRAM` 不返回 Reserve Pairing。
- 应用或清除任何 Filter 后都不会出现 RES/GRD。
- 总数和分页始终基于当前 FLY 候选集合。

## PP-FLY-03 分页、选择和编辑回显

1. 在第一页选择一个 FLY Pairing。
2. 翻到下一页，再选择一个 FLY Pairing。
3. 选择 Tier 并保存 bid。
4. 重新编辑该 Pairing Preference。

预期：

- 翻页不会丢失已选 Pairing。
- 保存 payload 使用稳定 Pairing IDs。
- 编辑时两个 FLY Pairing 正确回显。
- 候选表格仍只显示 FLY Pairing。

## PP-FLY-04 独立 Search Pairings 回归

1. 关闭配置弹窗。
2. 打开独立 `SEARCH PAIRINGS` 页面。
3. 使用 All Pairings 和其他既有搜索模式。

预期：

- 独立 Search Pairings 没有被 Pairing Preference 的 FLY-only scope 强制改写。
- Current Rules、Award/Avoid、AND/OR 和其他 Pairing condition 搜索行为保持不变。

## 边界说明

- 项目尚未上线，本功能不兼容历史非 FLY Pairing Preference。
- 测试库若存在非 FLY Pairing Preference 草稿，应删除后重新创建，不验证旧 selected chips。
