# PBS Pairing 搜索筛选栏尺寸统一设计

## 目标

统一 Search Pairings 页面结果筛选栏的视觉尺寸，消除 Pairing Number、Date Range、Airport、Time 和 Clear 控件之间的字号与高度差异。

## 设计

- 所有字段标题统一为 `11px` 字号、`800` 字重、`14px` 行高。
- Pairing Number、Airport、Date Range、Time From、Time To 和 Clear 在空值或单行状态下统一为 `40px` 基准高度；多选内容超过一行时，Pairing Number 和 Airport 继续按现有 `flex-wrap` 行为自然增高。
- 保留现有 `grid-template-columns` 定义和响应式网格，不改变各字段宽度比例或筛选栏布局结构。
- 所有标题与对应控件之间的垂直间距统一为 `6px`。
- 复用 `pairing-search-panel.module.css` 中的筛选栏样式，避免同一区域同时维护 Tailwind 和 CSS Module 两套尺寸定义。
- 为六个视觉外框提供稳定的 `data-testid`，测试外框而不是内部 input/button。
- Pairing Number 和 Airport 下拉选项文字统一从现有 `12px` 左侧内容边距开始；勾选标记移到右侧，未选中项不再为左侧隐藏图标预留空白。
- Pairing Number 和 Airport 下拉中的已选项使用浅蓝底、蓝色文字和蓝色勾选标记；鼠标悬停或键盘高亮时使用略深的蓝色背景，保持选中状态清晰可见。
- Pairing Number 或 Airport 的标签换行增高时，筛选栏所有字段保持顶部对齐；Date Range、Time From、Time To 与 Clear 对齐首行控件，不随较高的多选控件下沉。
- 不修改搜索、多选、游标分页、日期范围或请求参数行为。

## 验收标准

1. 空值或单行状态下，六个视觉外框的计算高度均为 `40px`，底部坐标在页面缩放后仍保持一致；多选换行后允许对应外框自然增高。
2. 五个字段标题的计算样式统一为 `11px / 800 / 14px`，标题与控件间距均为 `6px`。
3. Pairing Number 与 Airport 下拉、多选和滚动加载行为保持不变。
4. 日期、时间和 Clear 行为保持不变。
5. 下拉选项文字从视觉外框左侧 `12px` 内容边距开始且无左侧图标槽；已选项的勾选标记显示在文字右侧。
6. Playwright 使用稳定 `data-testid` 获取六个视觉外框，通过 `getComputedStyle()` 断言未受画布 `transform` 影响的 `40px` 布局高度，并用 `boundingBox()` 在同一缩放比例下断言底部坐标一致。
7. 更新现有 QA 文档 `docs/test-cases/pbs/pairing/2026-08-04-search-result-filter-controls.md`，覆盖空值、单行、多选换行和下拉选项对齐状态。
8. Playwright `PBS-3604` 断言未选中项文字位于 `12px` 左侧内容边距、左侧不存在占位勾选槽，并断言选中后勾选标记位于文字右侧。
9. Playwright 断言已选下拉项具有浅蓝背景和蓝色文字；当 Pairing Number 多选标签换行时，所有字段标题仍顶部对齐，日期、时间和 Clear 仍与多选控件首行顶部对齐。
10. 以下验证通过并提供回执：
   - `cd pbs-portal && npm test`
   - `cd pbs-portal && npm run lint`
   - `cd pbs-portal && npm run build`
   - `npm run check:ui`
   - `cd e2e && npx playwright test tests/pbs-portal/pairing-search.spec.ts --config=config/playwright.config.ts --project=pbs-portal --grep "PBS-3604" --workers=1`

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在同一组件、同一 CSS Module 和同一条 Playwright 用例，拆分会增加冲突。
- Suggested split: 不拆分。
- Write boundaries: 仅限筛选栏组件、对应样式、自动化测试和现有 QA 测试文档。
- Conflict risk: Low。
- Execution gate: 用户审核本 spec 后开始实施。
