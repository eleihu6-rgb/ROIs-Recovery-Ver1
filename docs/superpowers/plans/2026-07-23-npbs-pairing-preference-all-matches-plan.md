# NPBS Pairing Preference 全月同名匹配实施计划

## 目标

让 NPBS 批量接口与 Playwright UI 模拟对无日期 Pairing Number 选择目标月全部同名 Pairing，并生成 ID/label 严格一一对应的 canonical payload；修复 crew `264` 的 T3、T4 数据和 Tier 摘要。

## 约束

- 保留工作树中已有的 occurrence readback 修复，不回退、不覆盖。
- 不重新导入其他 crew，不执行全量 July 导入。
- 只定向修改 crew `264` / bidId `4300` 的 T3、T4。
- 不提交截图、receipt、数据库导出或敏感数据。
- 用户明确要求不主动提交 Git；全程不执行 `git add`、`git commit` 或 `git push`。

## 实施步骤

1. 对两个导入映射函数、Playwright Pairing Preference 录入函数、Tier 摘要函数执行 GitNexus upstream impact analysis。
2. 先补回归测试：
   - `live-server`：一个 label 对应多个 ID 时保存重复 labels；
   - `pbs-server`：同一映射契约和 canonical 回读；
   - summary：合法重复 label 显示 `×N`，非法长度仍 review-only；
   - Playwright：同名结果单页和跨页全部选择。
3. 实现两个导入器的 `pairingId -> pairingNumber` 同步去重映射，禁止 IDs 和 labels 分开去重。
4. 修改 Tier 摘要，严格校验等长数组后按 label 计数显示。
5. 修改 Playwright page object，遍历精确同名结果及分页并全部勾选。
6. 运行最小 focused tests；失败时先定位契约差异，不做放宽校验。
7. 对 crew `264` 执行只读 pre-check；全部身份、group、ID 数组和 occurrence=0 条件通过后，事务更新 T3/T4 labels。
8. 执行 post-check、draft 回读、Tier Detail、counts 和真实 Portal Playwright 回归。
9. 按108 skill 生成 Word 报告，删除/排除本轮截图与临时数据文件。
10. 运行 build、`git diff --check` 和 GitNexus `detect_changes`，汇总所有 PASS/FAIL 与未提交文件。

## 验收

- T3 为 `7 IDs / 7 Labels`，T4 为 `11/11`。
- T3 摘要显示 `C4107 ×3、C4130 ×3、C4155 ×1`。
- counts HTTP 200，Tier Detail 不再 review-only。
- Playwright 与批量接口规范化后的完整 tuple 序列一致。
- focused tests、build、真实 UI 回归通过。
