# Agent 交付完成门禁设计

## 背景

根目录 `CLAUDE.md` 已经包含强制测试、真实 UI Playwright、No-Illusion、Stale-Test 等规则。根目录 `AGENTS.md` 也已经引用了这些规则，但缺少一个面向读取 `AGENTS.md` 的 agent 的、交付前必须执行的简明检查清单。实际开发时，agent 容易只报告代码改动，而没有稳定地补回归测试、QA 测试案例或测试运行结果。

## 目标

- 不修改 `CLAUDE.md`，但把其中已经有效的交付流程约束同步到 `AGENTS.md`。
- 在 `AGENTS.md` 增加 agent 交付完成门禁，供 Codex 以及任何读取该文件的 agent 遵守。
- 让每次代码改动在交付前明确回答：补了什么测试、跑了什么命令、结果是什么。
- 对不适合自动化测试的改动，要求说明原因、风险和人工验证步骤。

## 范围

本次只修改根目录 `AGENTS.md`，不新增独立 skill，不修改 `CLAUDE.md`，不修改 `.claude/skills`。

## 设计

新增 `## Agent Delivery Completion Gate` 章节，规则如下：

- 代码改动前先识别相关模块规则和 touched-area 测试。
- UI 功能、UI bug fix、核心页面交互必须新增或更新 Playwright。
- 后端 route、service、sync、schema / contract 改动必须新增或更新 Vitest / 集成测试。
- bug fix 必须有能覆盖原问题的回归测试。
- PBS 可验证业务行为改动必须同时考虑自动化测试和 QA 人工测试案例。
- 发现 touched-area stale test 时，应同步更新并运行。
- 交付消息必须列出测试命令和 PASS / FAIL 结果；未运行时必须说明阻塞原因和剩余风险。

## 验收标准

- `AGENTS.md` 明确包含 agent 交付门禁。
- `CLAUDE.md` 无改动。
- 文案不包含数据库密码、token 或环境敏感信息。
