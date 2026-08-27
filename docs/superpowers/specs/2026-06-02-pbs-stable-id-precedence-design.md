# PBS 稳定 ID 优先使用修复设计

日期：2026-06-02  
状态：待用户确认  
范围：PBS Portal / PBS Server 中带有数据库稳定 id 的查询、选择、保存、预览和日历回查链路。本文件只定义修复方案，不包含代码改动。

## 背景

Pairing Number autocomplete 当前返回过类似数据：

```json
{
  "value": "YEG/YLW/YYC/YLW/YEG",
  "label": "YEG/YLW/YYC/YLW/YEG (2026-06-29 - 2026-06-30)",
  "pairingId": "12484",
  "startDate": "2026-06-29",
  "endDate": "2026-06-30"
}
```

用户指出：既然已有 `pairingId`，系统不应把 `YEG/YLW/YYC/YLW/YEG` 这种路线 / label 字符串作为真正值使用。`value` 和 `label` 如果只是展示可以接受，但当前前端会把 `option.value` 写入 bid，因此这个字符串已经进入保存、preview、calendar 回查链路。

现状排查结论：

- `pbs-server/src/services/pairing-search/pairing-id-search-query.ts` 中 `value = pairing_label`。
- `pbs-portal/src/features/pairing/components/pairing-bid-control.tsx` 选择 autocomplete option 后直接 `addTokens([option.value])`。
- `pbs-server/src/services/lineholder/rule-bid-value.ts` 将 `tag-list` / `tag-list-date` 的 `values` 保存到 `param_a`。
- `pbs-server/src/services/pairing-search/pairing-search-core-conditions.ts` 用 `upper(p.pairing_label)` 做 Pairing Number preview/search。
- `pbs-server/src/services/pairing-search/pairing-occurrence-query.ts` 用 `upper(p.pairing_label)` 查 occurrence。
- `pbs_bid_pairing_occurrence` 表已经有 `pairing_id` / `occurrence_id` 字段，但普通 Pairing Number bid 保存链路没有完整使用稳定 id。

这说明问题不是一个 UI 展示字段错误，而是一条身份语义链路错误：有稳定 id 时，系统仍用展示字段或业务 label 做定位。

## 核心原则

本次修复必须建立一条通用原则：

```text
只要数据源提供稳定 id，系统选择、保存、更新、删除、预览、回查都必须优先使用 id。
展示字段只能用于 UI 展示和搜索文本匹配，不能作为主定位键，也不能作为错误旧数据的兼容入口。
```

推荐语义：

| 字段 | 用途 |
| --- | --- |
| `id` / `pairingId` / `crewId` / `propertyId` / `favoriteKey` | 稳定定位、保存、更新、删除、预览、回查。 |
| `value` | 如果会进入保存或选择态，应承载稳定 id；如果只是纯 UI 控件内部值，必须明确不落库。 |
| `label` | 展示给用户看的文本，不参与主定位。 |
| `displayLabel` / `pairingLabel` / `pairingNumber` | 展示、摘要，不作为查询键。 |

## 目标

1. 修复 Pairing Number / Pairing occurrence 链路，优先使用 `pairing.id`。
2. 避免路线字符串、pairing label、日期拼接 label 被保存为主定位值。
3. 不兼容错误旧数据。项目尚未上线，历史错误数据应删除或重建，不能让错误语义继续污染代码。
4. Pairing Number UI 必须是严格下拉选择：只能选择接口返回的真实 pairing，不允许手工输入后按 Enter / blur 添加。
5. 对 PBS 中其它“有 id 却可能用展示字段”的地方做审计，形成统一规范。
6. 测试覆盖前端选择、后端搜索、保存、读取、preview、calendar 回查。

## 非目标

- 不改变机场、城市、航班号这类本身就是业务 code 的语义。若数据源没有单独稳定 id，`airport code`、`city code`、`flight number` 仍可作为值。
- 不兼容旧错误数据。若数据库已有 label 型 Pairing Number bid，应通过清理脚本删除或重建为正确 id 型数据。
- 不重构全部 bid value 类型。第一阶段只修复高风险链路，并增加可复用工具减少同类问题。
- 不把 `label` 从 API 中删除；前端仍需要展示文本。

## 方案比较

### 方案 A：只把 `/pairing-ids` 的 `value` 改成 `pairingId`

做法：

- 后端 autocomplete option 返回 `value = pairingId`。
- 前端继续使用 `option.value`。

优点：

- 改动最小。

缺点：

- UI tag 会直接显示数字 id，用户体验变差。
- `tag-list` 语义仍不区分稳定 id 和展示文本。
- `pairing-occurrence-list`、preview、calendar 仍可能继续按 `pairing_label` 查询。
- 不能彻底禁止手输错误值，也不能解决 occurrence 明细链路。

结论：不推荐单独采用。

### 方案 B：为 Pairing Number 建立专用 selection model

做法：

- Pairing Number autocomplete option 明确区分：
  - `value`: stable `pairingId`
  - `label`: UI 展示文本
  - `pairingId`: stable id
  - `pairingLabel` / `pairingNumber`: 用户可读 label
  - `startDate` / `endDate`
- 前端 Pairing Number 不再复用普通 `tag-list` 的纯字符串 token 逻辑，而是转换为专用 occurrence / selected item。
- 保存具体 run 时优先写 `pbs_bid_pairing_occurrence.pairing_id` 和 `occurrence_id`。
- preview/search/calendar 只按 `p.id` 查询。

优点：

- 语义正确。
- 能兼顾展示、保存、preview、calendar。
- 能彻底切断错误 label 主键语义。

缺点：

- 改动跨前后端，多文件，需要完整测试。

结论：推荐。

### 方案 C：全系统通用 option selection abstraction

做法：

- 所有 autocomplete/select 控件都改为 `{ id, value, label, display }` 的通用模型。
- 一次性替换 Pairing、Crew、Airport、City、Favorite 等所有选择链路。

优点：

- 长期最统一。

缺点：

- 改动面过大。
- 容易影响本来可以使用 code 的字段，例如 airport code / flight number。
- 当前紧急 bug 会被大重构拖慢。

结论：不作为第一阶段。可以在 Pairing Number 修复后，将通用规范沉淀为 helper 和审计清单。

## 推荐方案

采用方案 B，并加一层轻量审计：

1. 第一阶段修复 Pairing Number / occurrence / preview / calendar。
2. 同时清理或拒绝现有错误 Pairing Number 数据，不做 legacy fallback。
3. 同时审计 PBS 中其它明确带稳定 id 的 option 链路，记录是否需要后续修复。
4. 不把没有独立 id 的业务 code 强行改成 surrogate id。

## Pairing Number 修复设计

### API contract

更新 `PbsPairingIdOption`，建议结构：

```ts
type PbsPairingIdOption = {
  value: string;          // stable pairingId
  label: string;          // display label
  pairingId: string;      // same stable id, explicit field
  pairingLabel: string;   // original p.pairing_label
  startDate: string | null;
  endDate: string | null;
};
```

返回示例：

```json
{
  "value": "12484",
  "label": "YEG/YLW/YYC/YLW/YEG (2026-06-29 - 2026-06-30)",
  "pairingId": "12484",
  "pairingLabel": "YEG/YLW/YYC/YLW/YEG",
  "startDate": "2026-06-29",
  "endDate": "2026-06-30"
}
```

注意：`label` 可以继续显示路线字符串，但不能进入主定位。

### 前端选择态

Pairing Number 不应再依赖普通 `TagListControl.selectAutocompleteOption -> addTokens([option.value])` 的纯字符串逻辑。

建议做法：

- 为 Pairing Number autocomplete 增加专用 `onSelectOption` 或 `mapSelectedOption`。
- 选择 option 时保留：
  - `pairingId`
  - `pairingLabel`
  - `originDate` / `startDate`
  - `occurrenceId`，可由 `pairingId:originDate` 生成。
- tag 展示用 `pairingLabel` 或 `label` 的简化版本。
- 保存和 preview 使用 `pairingId`。

严格禁止用户手动输入 Pairing Number 并提交：

- 搜索框只用于过滤候选列表。
- Enter 只能在当前高亮候选项存在时选择该候选项。
- blur 不能把自由文本自动提交为 token。
- 如果接口没有返回候选项，用户不能添加该 pairing。
- 所有保存到 bid 的 Pairing Number 必须来自候选列表，并携带 `pairingId`。

### 保存模型

`pairing-occurrence-list` 应作为具体 Pairing Number run 的优先保存形态：

```json
{
  "type": "pairing-occurrence-list",
  "occurrences": [
    {
      "pairingId": "12484",
      "pairingNumber": "YEG/YLW/YYC/YLW/YEG",
      "originDate": "2026-06-29",
      "occurrenceId": "12484:2026-06-29"
    }
  ]
}
```

落库：

- `pbs_bid_pairing_occurrence.pairing_id = "12484"`
- `pbs_bid_pairing_occurrence.occurrence_id = "12484:2026-06-29"`
- `pbs_bid_pairing_occurrence.pairing_number = "YEG/YLW/YYC/YLW/YEG"` 仅作为展示字段。

`pbs_bid_group.param_a` 不再保存 Pairing Number 的主定位值。对于 `pairing-occurrence-list`，具体 run 明细以 `pbs_bid_pairing_occurrence` 为准。

如果当前表结构或 service 仍要求 `param_a` 非空，应修改后端方法或数据库结构，让 Pairing Number 的正确数据源变成 occurrence 明细表，而不是继续依赖错误摘要字段。

### Preview / Search

Pairing Number property 处理规则：

1. SQL 只使用 `p.id = any($ids::bigint[])` 或具体 `(p.id, originDate)` 组合。
2. `pairing-occurrence-list` 必须携带 `pairingId`。
3. 如果 payload 中只有 label / route 字符串，没有 `pairingId`，后端直接返回 400，不做 fallback。
4. 如果数据库已有 Pairing Number group 只有 `param_a` label，没有 occurrence 明细，应视为错误数据，清理或重建。

### Occurrence 查询

新增或扩展 occurrence 查询能力：

- `loadPairingOccurrencesByIds(pairingIds, periodCode)`

日历和 conflict 检查只调用 id 查询。后端不再提供 label fallback 查询方法。

### Calendar

`buildPairingEvents` 当前从 `param_a` 提取 pairing id / label，再查 occurrence。修复后：

1. 优先读取 `pbs_bid_pairing_occurrence` 明细中的 `pairing_id`。
2. 如果没有明细，不再从 `param_a` fallback。该 bid 视为无效错误数据，不显示 pairing event，并应在保存 / 数据清理阶段被消除。
3. calendar metadata 中：
   - `pairingId` = live pairing stable id
   - `requestedPairingId` = 用户选择时保存的 id
   - `pairingNumber` = 展示 label

## 同类问题审计范围

需要重点排查以下模式：

```text
API response 带 xxxId，但前端保存 option.value
数据库表有 id 字段，但 service 查询 / update / delete 用 name/code/label
property / favorite 已有 propertyId / favoriteKey，但 UI 操作用 propertyCode / name
calendar / preview / export 读取 param_a 字符串而不是明细表 id
```

初步判断：

| 模块 | 当前判断 | 处理建议 |
| --- | --- | --- |
| Pairing Number / Pairing occurrence | 高风险，已确认使用 `pairing_label` 当主定位 | 本次必须修复 |
| Crew ID autocomplete | `crew_id` 本身是业务 id，`value=crewId` 可接受 | 保留，补充审计结论 |
| Flight Number autocomplete | 航班号本身是业务 code，无独立 stable id | 保留 |
| Airport / City reference | airport code / city code 是业务 code | 保留 |
| Favorite 删除 | 已有 `favoriteKey`，应继续用 `favoriteKey` | 确认无回退到 propertyCode 删除 |
| Property 配置 | 应优先 `propertyDefinitionId/propertyId`，`propertyCode` 只作为显示或外部配置 code | 审计是否仍有仅靠 propertyCode 的写入路径 |
| Existing property 编辑 / 删除 | 应优先 `propertyGroupKey` 或数据库行 id，不用 name/code | 审计 |
| Pairing search result | 展示可用 pairing label，但 result id 应保留 live `pairing.id` | 审计 |

## 测试设计

### 后端

新增 / 更新测试：

1. `/pairing-search/pairing-ids` 返回 `value = pairingId`，同时返回 `pairingLabel`。
2. Pairing Number preview 只使用 `p.id` 查询。
3. Pairing Number preview 收到只有 label、没有 `pairingId` 的 payload 时返回 400。
4. `pairing-occurrence-list` 使用 `pairingId + originDate` 查具体 run。
5. calendar 对有 `pbs_bid_pairing_occurrence.pairing_id` 的 bid 可以正确显示。
6. calendar 不再对旧 `param_a=TB7930` fallback；错误旧数据应被清理。

### 前端

新增 / 更新测试：

1. Pairing Number autocomplete 选择 route label 后，保存的 bid 内包含 `pairingId`，展示 tag 仍显示用户可读 label。
2. 不再把 `YEG/YLW/YYC/YLW/YEG` 当作新数据的主 `value` 保存。
3. Pairing occurrence dialog 选择具体 run 后保留 `pairingId` / `occurrenceId`。
4. Pairing preview payload 使用稳定 id 语义。
5. 搜索框按 Enter / blur 不能提交自由文本；只能选择候选列表中的 pairing。
6. 没有候选项时不能添加 Pairing Number。

### 回归

- `pbs-server` pairing search / calendar / pairing bid service 测试。
- `pbs-portal` pairing page / pairing bid control / pairing occurrence dialog 测试。
- 手工验证：
  - 搜索并选择 `YEG/YLW/YYC/YLW/YEG`。
  - 保存 bid。
  - 刷新页面。
  - preview 正常。
  - 左侧日历显示对应日期。
  - 数据库中具体 occurrence 有 `pairing_id=12484`。

## 验收标准

- 有 `pairingId` 的 Pairing Number option，前端保存和后端查询都优先使用 `pairingId`。
- 新保存的数据不再把路线字符串作为主定位键。
- 展示层仍能显示 `YEG/YLW/YYC/YLW/YEG (2026-06-29 - 2026-06-30)`。
- 错误旧数据不兼容。旧的 `param_a=TB7930` 或其它 label 型 Pairing Number 数据应删除或重建。
- preview、calendar、conflict 检查、search results 使用同一套 id 优先语义。
- 同类审计结果明确记录：哪些可以继续使用 code，哪些必须改 id。

## 风险与注意事项

- `pairing_label` 可能不是传统 Pairing Number，而是 route label；不能假设它唯一。
- `pairing.id` 是 live pairing 表稳定定位，但如果跨 period / 跨 schema 查询，需要保证 schema 和 periodCode 一起限定。
- `param_a` 历史上承载多种 bid 类型，不适合贸然改变所有类型；但 Pairing Number 的错误使用必须停止。
- `value` 字段在普通 autocomplete 中语义太宽，应避免全局一刀切修改影响 crew/airport/city/flight。
- 如果 optimizer export 当前只读取 `param_a`，后续也要同步读取 occurrence 明细，否则算法侧仍可能拿到旧 label。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 该修复跨前端、后端、测试和审计，且可以拆成相对独立的读写边界。
- Suggested split:
  - Agent A：后端 Pairing Number search / occurrence / preview / calendar id 优先。
  - Agent B：前端 Pairing Number autocomplete / occurrence dialog / payload mapping。
  - Agent C：同类问题审计和测试补充建议。
- Write boundaries:
  - Agent A 只写 `pbs-server/src/services/pairing-search/`、`pbs-server/src/services/calendar/`、相关后端测试。
  - Agent B 只写 `pbs-portal/src/features/pairing/`、`pbs-portal/src/shared/services/pairing-service.ts`、相关前端测试。
  - Agent C 默认只读或写文档 / 测试清单，不碰实现文件。
- Conflict risk: Medium。前后端 contract 文件 `packages/contracts/pbs-search-pairings.d.ts` 是共享边界，需要主 agent 统一集成。
- Execution gate: 需要用户确认本 spec 后再启动实现；启动多 agent 前应再次明确各 agent 写入范围。

## 已确认语义

用户已确认：

```text
有 id 一定要优先使用 id，不可以用字符串展示字段。
项目还没有上线，错误旧数据不做兼容，直接删除或重建。
Pairing Number 是下拉选择，不是下拉输入；搜索后按 Enter 或 blur 不能把手输文本添加进去。
只能选择列表里真实存在的 pairing。
```
