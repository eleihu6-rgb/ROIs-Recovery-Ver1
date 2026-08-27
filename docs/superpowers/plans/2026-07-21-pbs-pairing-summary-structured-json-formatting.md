# PBS Pairing Summary 结构化文案实施计划

1. 在 `lineholder-summary-formatters.ts` 建立结构化 Pairing formatter registry，统一返回安全 `value` 与 `pairingPhrase`。
2. 补齐 Pairing Length、Flight Number、Work Day、Redeye，并把现有 Json Pairing formatter 纳入 registry。
3. 对无法解析或未注册的 Json Pairing bid 返回 review-only，不输出原始 JSON。
4. 增加 registry/serializer 自动对账、指定文案、安全回退和 route/service 回归测试。
5. 增加 PBS Portal 真实页面 Playwright 断言，并运行聚焦测试、build、UI gate 和影响检查。

约束：不修改 bid 存储协议、搜索逻辑、算法导出或数据库；不提交 Git。
