# PBS Pairing COUNT 行级独立计数设计

## 背景

`/fpqe/pbs/pairing` 的 Existing Pairing Properties 中，顶部汇总条和表格行级 `COUNT` 原本混用了同一套“当前 Tx/tier 已启用规则”的计数结果。用户确认后，新的语义应当拆开：

- 顶部汇总条：跟随左侧 Bidding Calendar 当前 Tx/tier，显示当前 Tx 启用的规则数量，以及这些规则共同筛出的 pairing 数量。
- 行级 `COUNT`：永远只显示该单条 property/condition 自己可以筛出多少 pairing，不跟随当前 Tx/tier 切换。

上一版 `2026-06-12-pbs-pairing-count-loading-skeleton-design.md` 中“切 Tx 时行级 COUNT 按当前 Tx 重新 skeleton”的设计已不再适用。本设计覆盖并修正该部分语义。

## 目标

- 每一行 `COUNT` 固定表示“这一条条件单独筛出的 pairing 数”。
- 切换左侧 `tier-01`、`ui-149`、`ui-81` 等 Tx/tier 时，只刷新顶部汇总条。
- 顶部汇总条继续显示当前 Tx 的：
  - active rule 数量，例如 `5 rules`。
  - 所有 active rules 合并后的 pairing 数，例如 `42 pairings`。
- 行级 `COUNT` 不因为当前 Tx 没有启用该 property 而隐藏。
- 行级 `COUNT` 不因为切 Tx 而短暂消失；已有结果可继续显示。
- 当 property 本身被新增、删除、编辑或 tier 勾选被修改后，计数进入 stale，需要刷新后再展示新结果。

## 非目标

- 不新增接口字段。
- 不新增“按每个 tier 细分的行级 COUNT”，因为单行规则在多 Tx 下的解释成本较高，容易误导。
- 不改变 Search Pairings 的真实搜索逻辑；搜索当前规则仍按当前 Tx/tier 的 active rules 执行。
- 不改变顶部汇总条的显眼 UI 设计。

## 后端设计

`countCurrentRules` 的响应结构保持不变，但计算来源拆开：

1. `rowProperties`
   - 使用 `normalizeCriteriaPreviewProperties(request.properties)`。
   - 表示所有 Existing Pairing Properties。
   - 为每条 property 构造 `rule:<propertyKey>` 计数目标。
   - 每个 row 的 `rule` 来自这个结果。

2. `activeTierProperties`
   - 使用 `normalizeCurrentRulePreviewProperties(tier, request.properties)`。
   - 表示当前 Tx/tier 下启用的 properties。
   - 为 active properties 构造逐步漏斗 `funnel:<propertyKey>` 计数目标。
   - `summary.activePropertyCount` 使用 `activeTierProperties.length`。
   - `summary.allRules` 使用最后一个 active property 的 funnel 结果；如果当前 Tx 没有 active property，则为 `null`。

3. `rows`
   - 按 `rowProperties` 返回所有行。
   - `row.rule` 是单条件 count。
   - `row.funnel` 仅保留兼容字段；前端不展示它。

## 前端设计

`PairingRightPanel` 中拆开显示逻辑：

- `pairingPoolCountRowsByPropertyKey` 从最近一次成功 response 的 `rows[].rule` 构建，不再要求 response tier 等于当前 Tx。
- 切 Tx 自动刷新时，`refreshPairingPoolCounts` 进入 `loading`，但保留已有 `response`，让行级 COUNT 继续稳定显示。
- 顶部 summary 仍在 `loading` 时显示 `Refreshing / Calculating...`，避免用户误以为当前 Tx 已经计算完成。
- 如果当前没有任何可用 response，例如首次刷新或 stale 后刷新，行级 `COUNT` 可显示 skeleton，作为“正在首次计算行级结果”的缓冲。
- 行组件不再根据 property 是否启用当前 Tx 来决定是否显示 count。

## 验收标准

- 点击 `REFRESH` 后，行级 `COUNT` 显示每条单独条件的 pairing 数。
- 切换左侧 Tx/tier 后，顶部汇总条会重新计算并显示当前 Tx 的 rule 数和总 pairing 数。
- 切换左侧 Tx/tier 时，已经显示的行级 `COUNT` 不消失、不变空白。
- 当前 Tx 没启用某条 property，该 property 行仍可显示自己的单条件 pairing 数。
- 修改 property 或 tier 勾选后，计数进入 stale，不自动刷新，用户刷新后得到新结果。
- 单元测试覆盖后端 row/summary 分离，以及前端切 Tx 时保留行级 count。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 变更集中在一个后端 service、一个前端状态流和对应测试，拆分会增加集成成本。
- Suggested split: 无。
- Write boundaries: `pbs-server/src/services/pairing-search/pairing-search-service.ts`、`pbs-server/src/services/pairing-search/pairing-search-service.test.ts`、`pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`、`pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`、测试夹具。
- Conflict risk: 低。
- Execution gate: 用户已确认该语义后进入实现。
