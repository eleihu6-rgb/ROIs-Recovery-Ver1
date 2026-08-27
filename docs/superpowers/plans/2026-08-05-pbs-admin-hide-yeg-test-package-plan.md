# PBS Admin 隐藏 YEG Test Package 实施计划

1. 从 `PbsAdminTools` 的 Algorithm Export 操作区移除 `YEG Test Package` 按钮渲染，不修改下载服务和后端接口。
2. 更新现有 Gantt Playwright，验证 `Current Package` 可见且 `YEG Test Package` 不存在。
3. 运行 Gantt TypeScript、UI 标准检查、相关 Playwright 和变更范围检查。
