# PBS Work Day Preference 日期与星期一致性校验实施计划

## 目标

在 `Work Day Preference` 编辑器中阻止保存日期限制与所选 Work Day 完全无交集的条件，并提供可访问的即时错误提示；保持 Pairing 与 Search Pairings 两个入口行为一致。

## 实施步骤

1. **新增纯校验逻辑**
   - 在 `work-day-preference-editor.tsx` 内增加 ISO 日期到 weekday 的确定性转换。
   - Specific Dates 使用“至少一个日期匹配任一 Work Day”。
   - Date Range 对不足 7 天的区间做有界检查，达到 7 天直接判定存在交集。
   - 将交集结果并入 `isWorkDayPreferenceBidValueValid`。
   - 验证：focused component test 先复现 `Tue + 2026-07-01` 无效。

2. **增加页面错误反馈**
   - 在共享日期编辑器外围建立带 `aria-describedby` 的业务校验 group。
   - 无交集时渲染 `role="alert"` 错误文本。
   - 保留用户输入，由现有 `onValidityChange` 禁用 `ADD BID` / `UPDATE BID`。
   - 验证：组件测试覆盖错误出现、消失、关闭日期限制恢复。

3. **更新调用路径测试**
   - 更新 Pairing 页面现有 Work Day Preference 测试中的 stale 日期。
   - 更新 Search Pairings 旧 Draft 日期范围，使其包含已选 weekday。
   - 增加页面级测试，验证无交集时保存禁用、修改 weekday 后恢复。
   - 验证：运行相关页面 Vitest。

4. **补充真实 UI 回归**
   - 在现有 Work Day Preference Playwright 流程中加入不匹配日期错误与保存禁用断言。
   - 修正已有用例中与 weekday 不匹配的日期 fixture。
   - 验证：运行 focused Playwright。

5. **补充 QA 文档并完成交付验证**
   - 新增 `docs/test-cases/pbs/pairing-search/2026-07-22-work-day-preference-date-weekday-validation.md`。
   - 执行 Portal tests、lint、build、UI gate、Playwright、`git diff --check`。
   - 执行 GitNexus `detect-changes`，确认影响只覆盖预期 Portal 流程。

## 修改边界

- `pbs-portal/src/features/pairing/components/work-day-preference-editor.tsx`
- `pbs-portal/src/features/pairing/components/work-day-preference-editor.test.tsx`
- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
- `pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx`
- `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`
- 对应 spec、plan 和 QA 文档

不修改后端、搜索 SQL、API contract 或共享日期选择器实现。

## 风险与控制

- GitNexus 风险为 HIGH，原因是同一 editor 被 Pairing 与 Search Pairings 复用。
- 通过组件测试、两个页面入口测试和真实 UI Playwright 同时覆盖。
- 当前工作区已有 NPBS 相关未提交改动；本任务不触碰、不暂存、不回退这些文件。
