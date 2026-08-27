# Rule Engine 升级实现计划（索引）

> 原文件过大已拆分为 4 个 Part 文件。

**Goal:** 将 rule-engine 从 Pairing 级扩展到 Roster 级检查，新增插件式单条规则调用、CalcResultCache 性能优化、7 条新规则、完整 HTTP 服务。

**Architecture:** 方案一½ — 保留现有 RuleEngine，新增平行 RosterEngine；BaseChecker 声明 `requiredCalculators` 实现插件自包含；CalcResultCache 在批量检查时跨规则共享计算结果避免重算。

**Tech Stack:** TypeScript, Vitest, Fastify, @fastify/rate-limit

## Part 索引

| Part | 内容 | Tasks |
|------|------|-------|
| [Part 1: Foundation](2026-04-11-rule-engine-upgrade-part1-foundation.md) | CalcResultCache、BaseChecker、RuleEngine.checkRule | 1–3 |
| [Part 2: Roster Engine](2026-04-11-rule-engine-upgrade-part2-roster-engine.md) | RosterInput/RosterEngineResult、RosterContext、RosterEngine | 4–6 |
| [Part 3: Checkers](2026-04-11-rule-engine-upgrade-part3-checkers.md) | Roster 级 Checker、Pairing 级 Checker、/check/batch | 7–9 |
| [Part 4: HTTP API](2026-04-11-rule-engine-upgrade-part4-http-api.md) | /check/roster、/rules/*、限流熔断、导出验证、自检 | 10–13 |
