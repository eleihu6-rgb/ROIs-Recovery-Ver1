# PBS Line Credit Window 参考项目对齐实施计划

## 实施目标

将 `429 Credit Window Preference` 收敛为 `More credit / Less credit` 两方向，
公司级 `DELTA_HOURS` 从 Live `dictionary` 读取，并让手动填写、导入和
`LINE_RULES.csv` 使用同一合同。

## 执行顺序

1. 更新共享 contract 与序列化/摘要。
   - 验证：focused contract、lineholder 和 summary tests。
2. 更新字典读取、seed、幂等 migration 与配置 API。
   - 验证：配置解析和 migration fixture tests。
3. 更新 Live/PBS 两套 TXT importer 与 algorithm export。
   - 验证：More→401、Less→402、`deltaHours`、无 429 不依赖配置。
4. 更新 Portal 控件，删除 Custom 并加入只读提示。
   - 验证：Portal Vitest、Existing/Search 摘要一致。
5. 更新 QA 文档并执行真实 Playwright。
   - 验证：新增 More、编辑 Less、无 Custom/数值输入。
6. 执行 build、UI gate、diff 检查和 GitNexus detect-changes。

## 约束

- 不修改其他条件。
- 不新增依赖。
- 不执行数据库 migration；先交付脚本与验证结果，数据库执行需单独确认目标环境。
- 不提交 Git，除非用户明确要求。
- 保留工作树中已有的其他未提交改动。
