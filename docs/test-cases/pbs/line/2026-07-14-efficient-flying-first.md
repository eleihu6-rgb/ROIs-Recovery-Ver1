# PBS Line Efficient Flying First QA

## 目标

验证 Jen 文档中的 `Efficient Flying First` 已替代旧 `Most Flying In Least Working Days` 员工端入口，并统一为 Line 条件的简洁 Award/Avoid 配置行为。

## 前置条件

- 已执行 `sql/migration/2026-07-14-pbs-efficient-flying-first.sql`。
- 使用可编辑的当前 Line bid period。

## 用例

1. 打开 PBS Portal 的 `Line` 页面。
2. 点击 `ADD MORE PROPERTIES`，切到 `ALL PROPERTIES`。
3. 搜索或找到 `Efficient Flying First`。
4. 验证列表中不显示 `Most Flying In Least Working Days (Configured)`。
5. 点击 `Add Efficient Flying First`。
6. 验证弹窗标题为 `Configure Efficient Flying First`。
7. 验证弹窗只显示 `TIERS` 和 `PREFERENCE`，不显示 `BID` 或 strength 输入。
8. 验证 `Award` 默认选中，且未选择 tier 时 `ADD BID` 和 `SAVE FAVORITE` 不可用。
9. 选择 `T1`，切换到 `Avoid`，点击 `ADD BID`。
10. 验证 existing row 显示 `Avoid Efficient Flying First`。
11. 点击该 row 的 edit action，验证 `T1` 和 `Avoid` 回显正确。
12. 改回 `Award` 并保存，验证 existing row 显示 `Award Efficient Flying First`。

## 验收标准

- 员工端只看到 `Efficient Flying First` 这个新入口。
- 428 保存 payload 使用 `{ bid: { type: "flag" }, action: "award" | "avoid" }`。
- 旧 409 不再可见；迁移后旧 409/428 保存数据和收藏被清除。
- Standing Bid 复用该条件时同样只显示 Award/Avoid，不显示额外 BID 输入。
