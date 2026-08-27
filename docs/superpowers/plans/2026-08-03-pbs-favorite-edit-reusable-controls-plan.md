# PBS Favorite 编辑弹窗隐藏明确日期控件实施计划

1. Days Off：让 Favorite Edit 的 Prefer Off 只显示 weekday/weekend/time window，并隐藏 Long Stretch 明确日期范围。
2. Pairing：让主 Favorite Edit 与 Search Pairings Favorite source edit 复用现有 date-scope 禁用入口，隐藏所有 event date controls。
3. Line：Favorite Edit 隐藏 pattern 明确日期范围，并把 Reserve / Flying Pattern 限制为 reusable month scopes。
4. 保持普通 Current Bid 新增、Existing Bid 编辑、SAVE FAVORITE disabled 兜底及 Server 校验不变。
5. 更新模块 Vitest、真实 Playwright 和 QA 用例，运行 Portal 全量测试、Server focused tests、lint、build 与 UI gate。

实施采用最小补丁，不覆盖相关文件中现有未提交的 Favorite 日期防线改动。
