# PBS Tier AA Pairing Pool Statistics 设计

日期：2026-06-22  
范围：PBS Portal `/tier` 页面顶部 `BID STATISTICS` 卡片  
状态：已实现

## 背景

当前 `/tier` 页面顶部 `BID STATISTICS` 展示的是每个 `Tx` 保存了多少条 bid 条件：

- `Total`
- `Pairing`
- `Days Off`
- `Line`
- `Distribution`

这个口径适合早期检查“bid 是否被汇总进 Tier”，但不符合 AA PBS Guide 的 `Layer Tab` 使用方式。用户真正需要在 Tier 页面看到的是：每个 `Tx` 的 pairing pool 结果，而不是用户选了多少个条件。

AA 文档中 `Layer Tab` 的重点是：

- bid package 中可用 pairing 总量。
- 每层累计后的 `TOTAL PAIRINGS`。
- 每层新增/贡献的 `PAIRINGS BY LAYER`。
- bar graph 显示之前层的累计池和当前层新增池。
- `View Pairing Set` 查看某一层本身的 pairing set，且这个列表不是累计结果。
- line properties 不改变 total pairings 或 pairings by layer，只影响 award 构建。

因此，本次改动应把 `/tier` 顶部统计从“bid 条件数量”升级为“AA Layer Tab 风格的 pairing pool 统计”。

## 目标

- 用 AA 文档口径替换当前 `BID STATISTICS` 的条件数量统计。
- 每个 `T1-T7` 显示 pairing pool 数字，而不是保存条件数。
- 展示 `TOTAL PAIRINGS`：从 `T1` 累计到当前 `Tx` 的 pairing pool 总数。
- 展示 `PAIRINGS BY TX`：当前 `Tx` 相对前面 `Tx` 新增/贡献的 pairing 数。
- 展示 AA 风格的累计/新增 bar graph。
- 保留现有 `View Pairing Set`，继续查看单个 `Tx` 的 pairing set。
- 避免首屏为了统计而连续打 7 次 preview 列表接口；应使用一个批量 count 接口。
- 统计结果只用于 review，不代表最终 award，也不替代 RO/PO/法规/coverage/资历计算。

## 非目标

- 不做最终 Award / Reason Report。
- 不在本次实现 pairing set 内移除 unwanted pairing。
- 不把统计结果写入数据库。
- 不改变 Pairing / Days Off / Line 的 bid 保存模型。
- 不把 Days Off / Line 条件硬塞进 pairing search condition。
- 不改变现有 `BID SUMMARY` 的详情、编辑 Tx、删除 bid、`View Pairing Set` 主流程。
- 不继续显示旧的 `Total / Pairing / Days Off / Line` 条件数量表。

## AA 口径解释

### Package Total

表示当前用户上下文下可参与 bid package 的 pairing 总量。

第一阶段按现有 pairing search 的基础过滤计算：

- 当前 crew 的 base。
- 当前 crew 的 rank / acting rank 可飞位置。
- 当前 bid period。
- `pairing.is_deleted = 0`。

AA 文档提到 ODAN、RedEye、satellite pairings 可能默认排除。当前系统是否已经有完整默认排除配置，需要后续单独参数化。第一阶段不硬编码航司特有默认排除逻辑，只复用现有 pairing search 基础过滤。

### Tx Set

某一个 `Tx` 本身的 active Pairing rules 过滤出的 pairing set。

这与现有 `View Pairing Set` 的语义一致：

- 只看当前 `Tx`。
- 不是累计。
- 只基于 Pairing rules。

### Total Pairings

AA 的 `TOTAL PAIRINGS` 是累计池。对于 `Tn`：

```text
TOTAL(Tn) = union(T1 set, T2 set, ..., Tn set)
```

这表示系统从 `T1` 到当前 `Tx` 一共已经覆盖了多少 pairing。

### Pairings by Tx

AA 的 `PAIRINGS BY LAYER` 是当前层新增/贡献的 pairing。项目内使用 `Tx` 术语，因此 UI 显示为 `PAIRINGS BY TX`。

对于 `Tn`：

```text
BY_TX(Tn) = Tn set - union(T1 set, ..., Tn-1 set)
```

如果 `Tn` 的规则筛出的 pairing 已经全部出现在更早的 `Tx` 中，则 `PAIRINGS BY TX = 0`。这类情况应触发 review 提醒，提醒用户该 Tx 没有新增 pairing pool。

### Blank Tx

AA 文档说明，如果跳过某层并完全留空，PBS 会把可用 pairing pool 加入该层，award 可能停在该层。

第一阶段建议这样处理：

- 如果 `Tx` 完全没有 Pairing rules，但有 Days Off / Line bid：pairing pool 统计不把 Days Off / Line 当成 pairing filter；该行显示 `No pairing rules`，`TOTAL PAIRINGS` 沿用上一层累计值。
- 如果 `Tx` 完全没有任何 bid：该行显示 `Blank Tx`，不自动把 package total 加入累计池。

原因：当前系统的 Tier 页面是 bid review，不是最终 AA award simulator；如果直接把空层当作 package pool，会让现在的 `No bids in this tier` 语义和现有 review 大幅变化。完整 AA blank-layer award 语义建议作为后续 algorithm/award review 需求单独设计。

## 推荐方案

采用“新增 AA Tier pool 批量 count API + 前端替换顶部统计卡”的方案。

不复用现有 `/pairing-search/current-rules/counts` 直接拼 UI，因为它当前是“单个 Tx 的 row/rule/funnel 统计”，不是 AA 的跨 Tx 累计 union 统计。现有接口可以复用底层 condition builder 和 count query，但需要一个新的 response contract 来表达 `packageTotal`、`txSet`、`totalPairings`、`pairingsByTx`。

## API 设计

### Route

建议新增：

```text
POST /pairing-search/current-rules/tier-pools
```

### Request

```ts
type PbsPairingTierPoolsRequest = {
  periodCode?: string;
  tiers: string[];
  properties: PbsPairingDraftProperty[];
};
```

说明：

- `tiers` 第一阶段固定传 `["T1", ..., "T7"]`。
- `properties` 传当前 Pairing draft 的 existing properties。
- 后端按 `property.tiers` 判断每条 property 属于哪些 `Tx`。
- 前端不要预先拆 active-only，避免前后端过滤口径不一致。

### Response

```ts
type PbsPairingPoolCountValue = {
  pairingIdCount: number;
  totalItems: number;
};

type PbsPairingTierPoolRow = {
  tier: string;
  activePropertyCount: number;
  txSet: PbsPairingPoolCountValue | null;
  totalPairings: PbsPairingPoolCountValue | null;
  pairingsByTx: PbsPairingPoolCountValue | null;
  status: "success" | "no_pairing_rules" | "error";
  message?: string;
};

type PbsPairingTierPoolsResponse = {
  mode: "current_rules_tier_pools";
  periodCode?: string;
  computedAt: string;
  packageTotal: PbsPairingPoolCountValue;
  rows: PbsPairingTierPoolRow[];
};
```

计数展示优先用 `pairingIdCount`，即 distinct pairing 数。`totalItems` 保留给后续如果出现 pairing-position 或 occurrence 口径差异时使用。

## 后端计算语义

后端复用现有 pairing search 能力：

- `parsePreviewTier`
- `normalizeCurrentRulePreviewProperties`
- `buildCurrentRulesCondition`
- `executePreviewCountQueries`
- actor base / rank 过滤
- periodCode 过滤

新增的关键是构造跨 Tx 的 union / difference 条件：

1. 对每个 `Tx` 生成 `txCondition`。
2. `txSet` 使用当前 `txCondition` count。
3. `totalPairings` 使用 `T1..Tx` 的 `OR` union count。
4. `pairingsByTx` 使用 `current txCondition AND NOT(previous union condition)` count。
5. `packageTotal` 使用基础 package filter + `true` condition count。

如果某个 `Tx` 没有 active Pairing rules：

- `txSet = null`
- `pairingsByTx = null`
- `totalPairings` 沿用上一层累计值；如果前面也没有累计，则为 `0`
- `status = "no_pairing_rules"`

如果某个 `Tx` 的 Pairing rules 存在冲突或 count 失败：

- 该行 `status = "error"`
- `message` 返回可读错误
- 前端显示该行错误状态，不让整个 Tier 页白屏

## 前端 UI 设计

### 顶部卡片名称

旧标题：

```text
BID STATISTICS
```

新标题建议：

```text
PAIRING POOLS
```

这样避免继续让用户以为这里是 bid 条件数量。

### 顶部摘要

卡片顶部显示 package total 和计算状态：

```text
In package: 10,739 pairings
Updated 14:32
```

如果还在加载：

```text
Calculating pairing pools...
```

如果失败：

```text
Unable to calculate pairing pools
```

### 表格列

替换为：

```text
Tx | Total Pairings | Pairings by Tx | Pool Graph | Action
```

说明：

- `Tx`：T1-T7。
- `Total Pairings`：累计到当前 Tx 的 union count。
- `Pairings by Tx`：当前 Tx 新增/贡献 count。
- `Pool Graph`：灰色表示前序累计，绿色/紫色表示当前 Tx 新增。
- `Action`：保留 `View Pairing Set`，只在该 Tx 有 active Pairing rules 时显示。

### 行状态

成功行：

```text
T2 | 1,240 | +380 | [grey previous][purple new] | View Pairing Set
```

没有 Pairing rules：

```text
T3 | 1,240 | No pairing rules | [grey previous] | -
```

新增为 0：

```text
T4 | 1,240 | +0 | [grey previous] | View Pairing Set
```

错误行：

```text
T5 | Error | Review rules | - | -
```

### Bar Graph

按 AA 口径：

- 灰色段：`totalPairings(Tn-1)`
- 紫色段：`pairingsByTx(Tn)`
- 总宽度按 `packageTotal` 或最大 `totalPairings` 归一化。
- `pairingsByTx = 0` 时显示细线或 `0` 标记，避免看起来像 UI 缺失。

### BID SUMMARY 组头

现有 `BID SUMMARY` 组头已经在用户点击 `View Pairing Set` 后显示：

```text
Pool: X pairing numbers / Y results
```

本次建议调整为与顶部统计一致：

- 如果顶部 `PAIRING POOLS` 已经成功计算，组头显示当前 Tx 的 `Tx set` 或 `Pairings by Tx` 简短摘要。
- 点击 `View Pairing Set` 后仍打开单 Tx preview。
- preview 弹窗标题或说明要明确：`T2 set only, not cumulative`。

## 数据流

1. `/tier` 加载 lineholder summary，继续得到 `BID SUMMARY`、`TIER REVIEW`、warnings。
2. `TierRightPanel` 复用现有 `pairingPageDataQueryKey` 获取 Pairing current draft。
3. 如果 Pairing draft 中有 existing Pairing properties，则调用新接口 `/pairing-search/current-rules/tier-pools`。
4. 接口一次返回 `T1-T7` 的 AA pool rows。
5. 前端用返回结果渲染顶部 `PAIRING POOLS`。
6. 用户点击 `View Pairing Set` 时，继续调用现有 preview API，查看单个 Tx set。

性能要求：

- 首屏最多一次 Pairing current draft 请求和一次 tier pools count 请求。
- 不允许为了顶部统计对 T1-T7 各发一次 preview。
- 统计请求失败时，`BID SUMMARY` 仍可用。

## Review 提醒

新增或调整 `TIER REVIEW` 提醒：

- `pairingPoolEmpty`：某个 Tx 的 `txSet` 为 0。
- `pairingPoolNoNewPairings`：某个 Tx 有 Pairing rules，但 `pairingsByTx` 为 0。
- `pairingPoolCountError`：某个 Tx 统计失败。

提醒文案保持 review 语气，不阻止保存：

```text
T4 adds 0 new pairings. Review whether this Tx is duplicated, too restrictive, or conflicting.
```

## 兼容与迁移

- `PbsLineholderSummaryStatistic` 当前仍可保留给后端/旧测试使用，但 Tier 顶部 UI 不再展示它。
- Help 文档中关于 `BID STATISTICS` 的说明需要同步更新为 `PAIRING POOLS`。
- 旧的 QA 文档中“Total / Pairing / Days Off / Line”验收需要更新。
- 现有 `View Pairing Set` 测试继续保留，并补充“preview 不是累计”的断言或文案检查。

## 测试计划

### 后端

- 新 route 校验 request schema。
- `packageTotal` 使用 base/rank/period 基础过滤。
- `T1` 有 rules 时，`totalPairings(T1) = txSet(T1)`。
- `T2` 有与 T1 不重叠的 rules 时，`pairingsByTx(T2)` 为新增 count，`totalPairings(T2)` 为 union count。
- `T2` 完全重复 T1 时，`pairingsByTx(T2)=0`。
- 某 Tx 没有 active Pairing rules 时，返回 `no_pairing_rules`，不抛错。
- 某 Tx condition conflict 时，该行返回 error 或整体按现有错误策略可观测。

### 前端

- `/tier` 顶部显示 `PAIRING POOLS`，不再显示旧列 `Total / Pairing / Days Off / Line`。
- 成功返回后，T1-T7 行显示 `Total Pairings` 和 `Pairings by Tx`。
- package total 显示在卡片顶部。
- bar graph 有前序累计和当前新增两种视觉段。
- `pairingsByTx = 0` 时显示可读状态并进入 `TIER REVIEW`。
- 无 Pairing rules 的 Tx 显示 `No pairing rules`。
- count API loading / error 不影响 `BID SUMMARY`。
- 点击 `View Pairing Set` 仍打开单 Tx preview。
- preview 弹窗或 header 明确单 Tx set 不是 cumulative。

### 人工验收

- 准备 T1 和 T2 有不同 Pairing properties 的 crew bid。
- 进入 `/tier` 后，顶部看到 `PAIRING POOLS`。
- T1 的 `Total Pairings` 等于 T1 set。
- T2 的 `Total Pairings` 大于等于 T1，`Pairings by Tx` 显示 T2 新增部分。
- 如果 T2 条件和 T1 完全重复，T2 `Pairings by Tx` 为 0，并出现 review 提醒。
- 点击 T2 `View Pairing Set`，弹窗显示的是 T2 set only，不是 cumulative total。

## 验收标准

- 顶部统计不再展示“用户保存了多少条件”。
- 用户可以直接看到每个 `Tx` 对 pairing pool 的贡献。
- UI 和文案对齐 AA Layer Tab：`TOTAL PAIRINGS`、`PAIRINGS BY TX`、累计/新增 bar graph、`View Pairing Set`。
- 后端统计是批量 count，不是 7 次 preview 列表请求。
- `View Pairing Set` 的单层语义保持清晰，不与累计 total 混淆。
- Days Off / Line 仍在 `BID SUMMARY` 展示，但不被错误计入 pairing pool filter。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次改动跨 contract、后端 count 语义、Tier UI、Help/QA 文档，但核心语义强耦合；并行开发容易出现 API 字段和 UI 口径不一致。
- Suggested split: 不建议拆分实现。可以由主 agent 顺序完成 contract/backend/frontend/tests/docs。
- Write boundaries: 若后续必须并行，后端 agent 只写 `packages/contracts` 与 `pbs-server/src/services/pairing-search`，前端 agent 只写 `pbs-portal/src/features/tier`，文档由主 agent 最后统一。
- Conflict risk: Medium。Tier 页面近期已有多轮统计、preview、Help 文档调整；并行容易踩同一组件和测试。
- Execution gate: 用户 review 并明确批准本设计后，再进入实现。
