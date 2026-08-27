# PBS All Pairings 筛选添加删除 E2E 测试设计

## 背景

Pairing 页面新增了 `All Pairings` 入口和 `SEARCH RESULTS` 后端筛选栏。用户需要一个真实 Playwright 操作测试，覆盖 crew 19 从登录到使用该入口筛选、添加、删除、再次添加并返回 Pairing 页的完整流程。

## 目标

- 使用 crew `19` 通过真实登录页面进入 PBS Portal。
- 在 Pairing 页面打开 `All Pairings` 搜索页。
- 在 `SEARCH RESULTS` 中按日期范围 `2026-06-15` 到 `2026-06-20` 筛选。
- 从结果中添加一个 pairing 到 `T7`。
- 删除刚添加的 `Pairing Number` search criteria。
- 再次添加一个 pairing 到 `T7`。
- 点击右上角 `Back` 返回 Pairing 页面。
- 验证返回后 Pairing 页面正常显示，并能看到刚添加的 `T7` pairing 条件。

## 范围

- 只新增 Playwright E2E 测试用例。
- 不改业务逻辑、不改 API、不改数据库 schema。
- 测试可以清空 crew 19 当前 Pairing draft，以保证流程可重复。

## 关键断言

- 登录后能进入 `/pairing`。
- `All Pairings` 入口能进入 `/pairing/search`。
- 日期筛选输入后结果仍可加载，并出现 `ADD PAIRING`。
- 添加后 `SEARCH CRITERIA` 中出现 `Pairing Number`，且 `T7` 激活。
- 删除后该 search criteria 消失。
- 再次添加并点击 `Back` 后，Pairing 页面 existing list 出现 `Pairing Number`，且 `T7` 激活。

## 风险与处理

- 测试依赖远程/本地 PBS 服务和 June 2026 pairing 数据；若没有可用结果，测试会明确失败。
- 页面已有动态数据和异步刷新，测试需要使用稳定 role/testid 选择器和较宽超时。
- 由于该流程会写入 draft，测试开始前会清空 crew 19 的 Pairing 条件。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单一 E2E 用例，主要修改一个测试文件，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `e2e/tests/pbs-portal/` 下新增测试文件，必要时只读 page object。
- Conflict risk: 低。
- Execution gate: 用户已确认日期范围语义后执行。
