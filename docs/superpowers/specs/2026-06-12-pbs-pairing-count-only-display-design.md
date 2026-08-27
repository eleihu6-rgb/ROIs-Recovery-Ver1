# PBS Pairing Count Only 展示口径修订

日期：2026-06-12  
范围：PBS Portal `/fpqe/pbs/pairing` 的 Pairing property counts 展示文案  
状态：用户要求“写文档，再改”，本文件写完后进入实现  
关联文档：

- `docs/superpowers/specs/2026-06-11-pbs-pairing-property-pool-counts-design.md`
- `docs/superpowers/specs/2026-06-12-pbs-pairing-tx-counts-ui-revision-design.md`

## 背景

当前后端 counts response 中每个 count 同时包含两个数字：

- `pairingIdCount`：去重后的 pairing 数量。
- `totalItems`：结果行数量，偏搜索结果展示 / 技术分页口径。

上一版 UI 显示为：

```text
2 pairings / 2 results
```

用户反馈这个页面的业务问题不是“搜索结果行有多少”，而是：

- 单条条件筛出了多少个 pairing。
- 当前 Tx 下所有条件加一起筛出了多少个 pairing。

因此 `/fpqe/pbs/pairing` 主页面不应该继续展示 `/ results`，避免让用户误以为有两个不同业务指标需要判断。

## 目标

- 顶部 Tx 摘要只展示当前 Tx 下所有 active rules 共同筛出的 pairing 数量。
- 每条 property 的 `COUNT` 只展示该条件单独筛出的 pairing 数量。
- 页面不再显示 `results` 文案。
- 后端 API contract 保持不变，仍可返回 `totalItems`，供未来 search / debug / 分页场景使用。

## 展示口径

### 顶部 Tx 摘要

旧展示：

```text
T1 · 3 rules · 42 pairings / 57 results
```

新展示：

```text
T1 · 3 rules · 42 pairings
```

含义：

- `T1`：左侧 `BIDDING CALENDAR` 当前选中的 Tx。
- `3 rules`：当前 Tx 下 active Pairing properties 条数。
- `42 pairings`：这些规则合并后筛出的去重 pairing 数量，即 `summary.allRules.pairingIdCount`。

### 每条 property COUNT

旧展示：

```text
20 pairings / 30 results
```

新展示：

```text
20 pairings
```

含义：

- 该 property 单独能筛出 20 个去重 pairing。
- 使用 `row.rule.pairingIdCount`。
- 不展示 `row.rule.totalItems`。

## 非目标

- 不删除后端 response 中的 `totalItems`。
- 不修改 `packages/contracts`。
- 不修改 `pbs-server` count 查询。
- 不影响 `/pairing/search` 搜索结果页的 pagination / results 语义。
- 不重新引入 `Funnel`。

## 实现计划

1. 修改 `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`：
   - 顶部摘要 formatter 从 `pairings / results` 改为只显示 `pairings`。
2. 修改 `pbs-portal/src/features/pairing/components/pairing-property-table.tsx`：
   - 行内 count badge formatter 改为只显示 `pairings`。
3. 更新 `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`：
   - 断言顶部和行内 count 不再包含 `results`。
4. 更新 QA 文档：
   - 明确 `/pairing` 主页面只看 pairing 数量。

## 验收标准

- 顶部 Tx 摘要显示类似 `42 pairings`，不出现 `/ 57 results`。
- 每条 property 的 `COUNT` 显示类似 `20 pairings`，不出现 `/ 30 results`。
- 页面上不出现 `results` 作为 Pairing counts 展示口径。
- 后端 API 与 service 类型不变。
- 现有 refresh、Tx 切换自动计算、stale 行为不变。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次是小范围前端展示文案和测试断言调整，并行开发成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: 仅修改 Pairing 前端 formatter / 测试 / QA 文档。
- Conflict risk: Low。主要接续上一轮未提交 UI 改动。
- Execution gate: 用户已明确要求“写文档，再改”；本文件写入后按本 spec 实现。
