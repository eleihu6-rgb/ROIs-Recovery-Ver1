# PBS Pairing Tx Counts UI 修订设计

日期：2026-06-12  
范围：PBS Portal `/fpqe/pbs/pairing` 的 `EXISTING PAIRING PROPERTIES` 统计展示  
状态：待用户 review 后进入实现  
关联文档：`docs/superpowers/specs/2026-06-11-pbs-pairing-property-pool-counts-design.md`

## 背景

上一版 Pairing property pool counts 已经明确使用后端批量 count API，并能返回：

- 当前 Tx 下每条 active property 的单条命中数 `rule`。
- 当前 Tx 下逐条累计后的漏斗数 `funnel`。
- 当前 Tx 下所有 active properties 合并后的总过滤结果 `allRules`。

但当前前端展示不符合实际使用习惯：

- 顶部 `All rules: ...` 不够醒目，且没有直接告诉用户当前左侧选中的 Tx 下有多少条条件参与过滤。
- 每条 property 下方同时显示 `Rule` 和 `Funnel`，信息偏多，用户不容易扫读。
- 用户真正关心的单条条件数量应该跟 `TIERS` 放在同一行，而不是藏在 property 下一行。
- “切换 Tx 自动计算一次”指的是左侧 `BIDDING CALENDAR` 中的 Tx 行选择按钮，例如带 `ui-149`、`ui-81` 这类 UI 标识的按钮；不是右侧 property 行里的 `T1/T2/...` tier 勾选按钮。

本修订只调整前端展示口径和交互触发点，后端批量 count API 语义保持不变。

## 目标

- 顶部摘要按左侧 `BIDDING CALENDAR` 当前选中的 Tx 展示。
- 顶部摘要显眼显示当前 Tx 下：
  - 有多少条 active Pairing property 条件参与过滤。
  - 这些条件合并后筛出多少 `pairings / results`。
- 每条 property 只显示“自己这条条件单独能筛出多少”，不再显示逐行 `Funnel`。
- 单条 property 数量展示在 `TIERS` 后面，便于横向扫读。
- 左侧 `BIDDING CALENDAR` Tx 选择变化时，自动为新 Tx 计算一次。
- 右侧 property 行内 tier 勾选、新增、编辑、删除后，只标记统计过期，由用户点击 `REFRESH` 重算。

## 非目标

- 不修改后端 count API 的 request / response contract，除非实现时发现缺少必要字段。
- 不把统计结果写入数据库。
- 不把统计数据放进左侧共享 `BIDDING CALENDAR` 组件，避免影响 Dashboard、Days Off、Reserve 等共用场景。
- 不展示逐行累计漏斗 `Funnel`，至少本次修订不展示。
- 不在页面首屏批量计算所有 Tx。
- 不做最终 Award / RO / PO / 法规 / coverage / 资历计算。

## 术语修订

- **Selected Tx**：左侧 `BIDDING CALENDAR` 当前选中的 Tx 行，例如 `T1`、`T2`、`T3`。这是统计上下文的唯一来源。
- **Rule count**：单条 property 独立筛选时的命中数，展示在该 property 行的 `TIERS` 后面。
- **Rule quantity**：当前 Selected Tx 下 active Pairing properties 的条数，展示在顶部摘要。
- **Filtered result**：当前 Selected Tx 下所有 active properties 合并后的最终筛选结果，使用后端 `summary.allRules`。
- **Stale**：当前页面 property 保存后，已有统计快照不再可信，需要用户手动 `REFRESH`。

## 统计口径

### 顶部摘要

顶部摘要必须基于左侧 `BIDDING CALENDAR` 当前选中的 Tx。

展示内容：

```text
T1
3 rules
42 pairings / 57 results
```

含义：

- `T1`：左侧 calendar 当前选中的 Tx。
- `3 rules`：当前 Tx 下 active 的 Pairing property 条件数。
- `42 pairings / 57 results`：这 3 条条件共同过滤后的最终结果，即后端 `summary.allRules`。

如果当前 Tx 没有 active Pairing property：

```text
T1
0 rules
No active pairing properties
```

如果尚未计算：

```text
T1
Counts not calculated
```

如果统计过期：

```text
T1
Counts need refresh
```

如果请求失败：

```text
T1
Unable to calculate counts
```

### 每行 property 数量

每条 property 只展示 `rule` count：

```text
20 pairings / 30 results
```

展示位置：

- 放在 `TIERS` 后面，作为同一行的统计 badge / count cell。
- 不再放在 property 行下方。
- 不展示 `Funnel`。

展示条件：

- 只对当前 Selected Tx active 的 properties 显示 count。
- 非当前 Tx active 的 properties 不显示 count，避免用户误以为它参与当前 Tx 过滤。
- 统计状态为 `success` 且 response 的 Tx 等于当前 Selected Tx 时才显示。
- `stale`、`idle`、`loading`、`error` 状态不展示旧 row count。

## UI 设计

### 顶部摘要卡

当前顶部 `All rules: ...` 改为更醒目的摘要卡，建议放在 `EXISTING PAIRING PROPERTIES` 标题下方、`REFRESH / VIEW RULES / SEARCH PAIRINGS` 按钮左侧。

视觉要求：

- 比现在的 12px 灰色文本更显眼。
- 当前 Tx 使用高对比色块，例如紫色或深色背景。
- `rules` 数量和 `pairings / results` 使用较大字号或加粗。
- `REFRESH` 按钮靠近摘要卡，过期时可使用更醒目的边框/背景提示。
- 不使用大段说明文字，避免占用业务空间。

建议结构：

```text
[ T1 ] [ 3 rules ] [ 42 pairings / 57 results ]        [ REFRESH ] [ VIEW RULES ] [ SEARCH PAIRINGS ]
```

其中 `T1` 必须来自左侧 calendar 当前选中 Tx。

### 表格行

现有表头：

```text
PROPERTY | BID | TIERS
```

修订为：

```text
PROPERTY | BID | TIERS | COUNT
```

或在视觉上保持 `TIERS` 后紧跟 count badge：

```text
PROPERTY | BID | TIERS                  COUNT
```

响应式约束：

- 1920 宽屏下，count 应与 tiers 同行展示，不换到下一行。
- 较窄 viewport 下，可适度缩短 count badge 文案，但不能覆盖 tiers 按钮。
- 若横向空间不足，优先保留 `pairings` 数量，`results` 可通过更紧凑格式展示，例如 `20 / 30 results`，但最终文案需实现时根据现有布局验证。

## 交互行为

### 左侧 BIDDING CALENDAR Tx 切换

触发源：

- 左侧 `BIDDING CALENDAR` 的 Tx 行按钮，例如用户提到的 `ui-149`、`ui-81` 这类按钮。
- 这些按钮通过共享状态更新当前 `activeTierLabel`。

行为：

1. 用户点击左侧 Tx 行按钮。
2. 右侧 Pairing panel 识别 Selected Tx 变化。
3. 自动调用一次 `countCurrentRules(selectedTx, existingProperties, periodCode)`。
4. loading 期间顶部摘要显示该 Tx 正在计算。
5. 成功后更新顶部摘要和该 Tx 下每条 active property 的 rule count。
6. 如果用户快速连续切换 Tx，只接受最后一次请求结果，旧响应不得覆盖当前 Tx。

### 右侧 property 行内 tier 勾选

触发源：

- `EXISTING PAIRING PROPERTIES` 每行右侧的 `T1/T2/...` tier toggle。

行为：

- 它是“修改这条 property 适用哪些 Tx”，不是“切换当前 Selected Tx”。
- 保存成功后，将当前统计标记为 `stale`。
- 不自动请求 count。
- 顶部提示 `Counts need refresh`，用户点击 `REFRESH` 后重算。

原因：

- 行内 tier toggle 是编辑动作，用户可能连续改多条 property。
- 每次编辑都自动计算会造成不必要请求，也可能让 UI 在保存和刷新之间闪烁。

### REFRESH

点击 `REFRESH`：

- 使用当前左侧 Selected Tx。
- 使用当前 saved / local existing properties snapshot。
- 成功后更新顶部和每行 count。
- 失败时显示错误提示，页面仍可继续编辑。

### 首屏状态

首屏是否自动计算维持上一版约束：

- 不为了首屏加载而批量计算所有 Tx。
- 默认不主动计算，显示 `Counts not calculated`。
- 用户点击 `REFRESH` 或切换左侧 Tx 后才计算。

实现时要确保右侧默认显示的 Tx 与左侧 calendar 默认视觉选中的 Tx 一致。当前左侧 calendar 在 shared store 为空时会使用自己的默认 active Tx；右侧不得回退到“第一条 active property 的 tier”，否则顶部摘要可能和左侧选中行不一致。

## 数据流

继续复用现有 service：

```ts
pairingService.countCurrentRules(selectedTx, existingProperties, periodCode)
```

前端状态建议仍保持：

```ts
type PairingPoolCountsState = {
  tier: string;
  status: "idle" | "loading" | "success" | "error" | "stale";
  response: PbsPairingCurrentRulesCountsResponse | null;
  errorMessage?: string;
};
```

修订点：

- `tier` 必须表示左侧 calendar Selected Tx。
- 顶部 `rule quantity` 使用 `response.summary.activePropertyCount`。
- 顶部 filtered result 使用 `response.summary.allRules`。
- 每行只读取 `row.rule`，不再读取 `row.funnel` 用于 UI 展示。

## 错误处理

- 请求失败：toast 显示 `Unable to calculate pairing counts.`，顶部摘要显示失败状态。
- 当前 Tx 没有 active properties：成功态，顶部显示 `0 rules` 和空态文案；表格行不显示 count。
- 请求期间用户切换 Tx：旧请求结果丢弃。
- 请求期间用户编辑 property：保存成功后标记 stale；如果旧请求随后返回，也不得覆盖 stale 状态。

## 测试计划

### 前端单元 / 集成测试

更新 `pbs-portal` 测试：

- 初始进入 `/fpqe/pbs/pairing` 时，顶部显示当前左侧 Tx 的未计算状态，而不是 `All rules`。
- 当 shared store 为空、左侧 calendar 使用默认 active Tx 时，右侧摘要也必须显示同一个默认 Tx。
- 点击 `REFRESH` 后，顶部显示当前 Tx、active rule 数量、总过滤结果。
- 每条当前 Tx active property 在 `TIERS` 后显示自己的 `rule` count。
- 每条 property 不再显示 `Funnel` 文案。
- 非当前 Tx active property 不显示 count。
- 点击左侧 `BIDDING CALENDAR` Tx 行按钮后，自动调用一次 `countCurrentRules`。
- 右侧 property 行内 tier toggle 保存成功后只标记 stale，不自动调用 count。
- 快速切换左侧 Tx 时，旧响应不会覆盖最新 Tx。
- 当前 Tx 没有 active properties 时，顶部显示 `0 rules` / empty state。

### 人工测试

更新 Pairing QA 用例：

- 选中左侧 `T1`，点击 `REFRESH`，确认顶部 `T1 + rules 数量 + pairings/results`。
- 切换左侧 `T2`，确认自动计算一次。
- 修改某条 property 的 `T2` 勾选，确认顶部变为需要刷新，而不是自动计算。
- 刷新后确认该 property 的 count 出现在 `TIERS` 后面。
- 确认页面上不再出现 `Funnel` 文案。

## 验收标准

- 顶部摘要不再显示 `All rules: ...`，改为 Selected Tx 视角的醒目摘要。
- 右侧摘要的 Tx 与左侧 `BIDDING CALENDAR` 当前视觉选中的 Tx 一致，包括首屏默认选中状态。
- 顶部摘要能看出当前 Tx 下有多少条条件参与过滤。
- 顶部摘要能看出这些条件共同筛出的 `pairings / results`。
- 每条 property 只显示自己的 rule count。
- 每条 property 的 count 位于 `TIERS` 后面，不在 property 下方。
- 左侧 `BIDDING CALENDAR` Tx 按钮切换会自动计算一次。
- 右侧 property 行内 tier 勾选不会被当作 Tx 切换，只会让统计变 stale。
- 不改变后端 API 统计语义。
- 不影响 `VIEW RULES`、`SEARCH PAIRINGS`、单条 preview、property 保存/删除逻辑。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次修订主要集中在前端展示和测试，后端 API 不需要改动；并行开发的协调成本高于收益。
- Suggested split: 不建议拆分。由主 agent 顺序修改 spec、前端组件、前端测试和 QA 文档即可。
- Write boundaries: 主要写入 `pbs-portal/src/features/pairing/components/*`、`pbs-portal/src/features/pairing/pages/*test*`、必要时更新 `docs/test-cases/pbs/pairing/*`。
- Conflict risk: Medium。`PairingRightPanel` 和 `PairingPropertyTable` 已有上一轮未提交改动，需要在同一上下文内继续编辑，避免并行冲突。
- Execution gate: 用户 review 并明确批准本修订 spec 后，再进入实现。
