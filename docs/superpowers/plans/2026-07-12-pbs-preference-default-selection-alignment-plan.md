# PBS Preference 默认选择一致性实施计划

关联规格：`docs/superpowers/specs/2026-07-12-pbs-preference-default-selection-alignment-design.md`

## 实施步骤

1. 核对 201、204、408 各自的新增草稿初始化路径与现有组件 / Playwright 覆盖。
2. 仅在 201、204、408 的新增入口清空初始 Tier；不影响编辑回显。
3. 调整 Pairing 102 与 168 新增初始化：二者保留 `Award` 且 Tier 为空；168 让 `Landing` 直接作为已选事件，并保持关闭的日期限制。
4. 更新 Portal 组件测试、相关页面测试和 Playwright；更新现有 QA 用例中的默认状态说明。
5. 运行 Portal 定向测试、完整 Portal 测试 / lint / build、关键 Playwright 与 UI 标准检查。

## 验收边界

- 201 / 204 / 408：新增时所有 Tier 均未选，选择任一 Tier 后恢复可提交路径。
- 102：新增时 Tier 为空、`Award` 保持默认；不改 Pairing Number、日期或 fulfilment 的既有默认状态。
- 168：新增时 `Award`、`Landing` 已选；Tier 为空；`LIMIT TO EVENT DATE` 关闭且无日期值；编辑已有记录保持保存值。
- 不修改后端、合同、数据库或算法。
