# NPBS July 两名员工 Playwright Smoke 实施计划

## 目标

依据已批准设计，修复 CRLF 解析并通过真实 PBS Portal UI 为 `#73`、`#113` 执行 July 2026 两人 smoke，输出速度与 Word 报告。

## 步骤

1. Parser 与 generator
   - 为 CRLF 添加 parser 回归测试并修复 `splitRecords()`。
   - 为 generator 增加 `--employee-ids`、`--no-shift`、source SHA、runId 和精确统计。
   - 用 CLI 测试验证只选择两人且 July/非 July 日期不被平移。

2. Playwright simulation
   - 增加 fixture period/source/runId 校验。
   - 每名员工写入前验证 UI 为 `Bidding open for Jul 2026`，并验证目标页面 Existing rows 为 0。
   - 记录 runId、source hash、阶段耗时和 placed/blocker；用 `finally` 写结果并退出登录。
   - 增加专用 headless smoke 配置，关闭 trace/video 和无关 webServer。

3. Word report
   - 按 fixture/runId 读取新结果，缺少任一员工时 fail-fast。
   - 动态输出 period/no-shift、source SHA 和耗时，去除 June/Mar→Jun 硬编码。

4. 验证与执行
   - 运行 NPBS 单元/CLI 测试。
   - 生成 `#73/#113` 临时 fixture，核对 `1105/663/3014/5034` 基线。
   - 再次只读确认两人 Existing rows 为 0 和 July bidding open。
   - headless、`workers=1` 执行真实 UI smoke。
   - 生成 Word 报告并汇总 placed/total、blocker、总耗时与每人耗时。

## 写入边界

- 代码：仅 `e2e/utils/npbs/**`、NPBS Playwright simulation 与专用配置。
- 数据：仅 `#73`、`#113`；若 Existing 不为 0，写入前中止。
- 产物：fixture、issue JSON、截图、Word 报告默认不纳入提交。
