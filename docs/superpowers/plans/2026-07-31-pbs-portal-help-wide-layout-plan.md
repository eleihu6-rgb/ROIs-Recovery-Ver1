# PBS Portal Help 宽屏布局实施计划

1. 调整 `HelpArticle` 和 `HelpHome` 的居中内容画布。
   - 验证：2K 窗口下画布水平居中，正文不超过 880px。
2. 调整 `HelpScreenshot` 的响应式宽度，取消固定半尺寸显示。
   - 验证：Overview 截图与正文同为最大 880px，左右边缘对齐且不超过原图宽度。
3. 扩展 Help Playwright 响应式测试。
   - 验证：2048×1024、1366×768、1366×640 均无横向裁切，左右滚动独立。
4. 运行 Help E2E、ESLint、TypeScript、生产构建、UI 门禁和 GitNexus 改动检查。
