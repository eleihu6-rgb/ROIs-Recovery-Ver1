# PBS Pairing Summary 结构化文案与防 JSON 泄漏设计

## 1. 背景与问题

Current Summary 页面出现以下错误文案：

```text
Award pairings with flight {"type":"flight-number-preference",...}
Award pairings with length {"type":"pairing-length-preference",...} days
```

截图对应的前端页面直接展示 `pbs-server` 返回的 `summaryItems[].readableText`。根因不在 Pairing 编辑器或 PREVIEW 搜索，而在服务端 `pbs-server/src/services/lineholder/lineholder-summary-formatters.ts`：

- 新版 Pairing bid 通过 `serializeRuleBid()` 以 `operator = "Json"`、`paramA = JSON.stringify(bid)` 存储。
- Current Summary formatter 的部分 property 仍按旧版标量 `paramA/paramB` 生成文案。
- property 112（Pairing Length）和 116（Flight Number Preference）直接把 `paramA` 拼入 `readableText`。
- 通用 `formatFallbackValue()` 在无法识别 `Json` 时也会返回原始 `paramA`，因此同类问题会随着新结构化 bid 继续出现。

这不是单纯的两个文案缺失，而是“结构化存储已升级、Summary formatter 未建立统一结构化分发和安全回退”的机制问题。

## 2. 目标

1. Current Summary 对所有 Pairing 结构化 bid 输出自然、稳定、与现有标准答案风格一致的英文文案。
2. `summaryItems[].readableText`、`summaryItems[].value` 和嵌套 `conditions[].value` 不得显示序列化 JSON。
3. 后续新增 `operator = "Json"` 的 Pairing bid 时，缺少 formatter 必须被测试发现，不能静默回退为 JSON。
4. 不改变 bid 的保存格式、搜索逻辑、算法导出、数据库 schema 或 Pairing 条件语义。

## 3. 方案比较

### 方案 A：只修 property 112 和 116

改动最小，但 `Work Day Preference`、`Redeye Preference` 或未来新增 Json bid 仍可能出现错误或信息丢失，不能解决重复发生的问题。

### 方案 B：服务端统一结构化 Pairing Summary 分发（推荐）

在现有 canonical Summary formatter 中集中解析 `operator = "Json"` 的 Pairing bid，按 `bid.type` / property code 调用专用 formatter，并提供永不返回原始 JSON 的安全回退。前端继续消费服务端 `readableText`。

优点是数据源唯一、Current Summary 各入口一致，并能通过矩阵测试阻止回归。

### 方案 C：前端重新解析 JSON 并生成文案

会与服务端 formatter 形成两套规则，API、移动端或其他消费者仍可能看到错误文本，不采用。

## 4. 设计

### 4.1 服务端作为文案唯一来源

保留 `lineholder-summary-formatters.ts` 为 Current Summary 的 canonical formatter。在 `formatPairingText()` 进入旧 property-code switch 前，增加统一的结构化 Pairing bid 分发：

1. 仅当 `operator === "Json"` 时调用 `safeParseJson(paramA)`。
2. 验证解析结果为 object，且 `type` 与当前 property 支持的结构一致。
3. 调用对应的专用 formatter，返回不包含 action 的 Pairing 语句。
4. 最外层继续通过 `withAction()` 统一添加 `Award` / `Avoid`。
5. 解析失败、type 不匹配或字段不完整时返回安全的 review 状态，不进入旧标量 formatter。

结构化 formatter 使用显式 registry，例如 `STRUCTURED_PAIRING_SUMMARY_FORMATTERS`，key 为 `bid.type`，value 返回：

```ts
type StructuredPairingSummary = {
  value: string;         // 不含 action 的简短条件值
  pairingPhrase: string; // 不含 action、用于 readableText 的完整 Pairing 语句
};
```

`readableText` 由 `withAction(input, pairingPhrase)` 统一生成；成功解析时的 `summaryItems[].value` 必须取 registry 返回的 `value`，不能再调用通用 Json fallback。

为了让“新增 Json bid 缺 formatter 时测试失败”成为可执行门禁，测试必须从 `pbsPairingPropertyCatalog` 的 Pairing `defaultBid` 出发，调用 `serializeRuleBid()`，筛出实际生成 `operator = "Json"` 的 `bid.type` 集合，并与 registry keys 做双向精确比对。任何 serializer 新增 Json 类型但 registry 未登记，或 registry 存在无对应存储类型的陈旧项，测试都必须失败。

现有已正确处理的 Pairing Preference、Pairing Check Time、Flight Legs per Duty、Airport Preference、Month-End Carryover 和 Deadhead Flying 应纳入同一结构化分发路径或保持等价的专用 formatter，不能退化。

本次至少补齐并验证以下结构化类型：

| Property | bid.type | 文案要求 |
|---|---|---|
| 110 Work Day Preference | `work-day-preference` | 显示星期、check-in window 和可选日期范围 |
| 112 Pairing Length | `pairing-length-preference` | 显示 minDays/maxDays 和可选 start-date scope；忽略控件边界 `min/max` |
| 116 Flight Number Preference | `flight-number-preference` | 显示一个或多个航班号和可选 operating-date scope |
| 117 Redeye Preference | `redeye-preference` | 显示 Redeye 和可选 flight-date scope |

### 4.2 指定文案

截图中的两条数据必须输出：

```text
Award pairings with flights I7013, I7153 on Jun 30, 2026
Award pairings with length between 2 and 3 days
```

Pairing Length 规则：

- `minDays = maxDays = 2`：`with length 2 days`
- 只有 `minDays = 2`：`with length at least 2 days`
- 只有 `maxDays = 3`：`with length at most 3 days`
- `minDays = 2, maxDays = 3`：`with length between 2 and 3 days`
- `specific_dates`：追加 `starting on Jun 30, 2026`
- `date_range`：追加 `starting from Jun 1, 2026 to Jun 10, 2026`
- `min` / `max` 是编辑器边界，不进入文案。

Flight Number Preference 规则：

- 一个航班：`with flight I7013`
- 多个航班：`with flights I7013, I7153`
- `specific_dates`：追加 `on Jun 30, 2026`
- `date_range`：追加 `from Jun 1, 2026 to Jun 10, 2026`

成功解析时 `value` 使用不含 action、也不重复 property label 的简短自然语言：

| bid.type | value 示例 | readableText 示例 |
|---|---|---|
| `pairing-length-preference` | `Between 2 and 3 days` | `Award pairings with length between 2 and 3 days` |
| `flight-number-preference` | `I7013, I7153 on Jun 30, 2026` | `Award pairings with flights I7013, I7153 on Jun 30, 2026` |
| `work-day-preference` | `Mon 03:00-11:00; Wed 12:00-18:00 on Jun 30, 2026` | `Award pairings with duty check-in Mon 03:00-11:00; Wed 12:00-18:00 on Jun 30, 2026` |
| `redeye-preference` | `Redeye on Jun 30, 2026` | `Award pairings with a redeye flight on Jun 30, 2026` |

Work Day Preference 固定规则：

- 星期按 `MON` 到 `SUN` 排序，不依赖 payload 输入顺序。
- 每个窗口显示为 `<Day> <checkInFrom>-<checkInTo>`。
- 多个窗口用 `; ` 分隔。
- `specific_dates` 按日期升序并追加 `on <date list>`。
- `date_range` 追加 `from <from> to <to>`。
- 缺少任一 check-in endpoint 的窗口视为不可读，整条条件进入 review-only，不生成半截文案。

Redeye Preference 固定规则：

- 无 date scope：`value = Redeye`，文案为 `<Action> pairings with a redeye flight`。
- `specific_dates`：追加 `on <date list>`，日期升序。
- `date_range`：追加 `from <from> to <to>`。

日期继续复用 `formatSummaryDate()`，保持现有 `Mon D, YYYY` 风格。

### 4.3 安全回退

不得再把 `operator = "Json"` 的 `paramA` 原样返回给 UI。

对于无法解析或暂未支持的结构化 Pairing bid：

- `value` 使用 `Condition needs review`。
- `readableText` 使用 `<Award|Avoid> <property label> needs review`。
- `isReviewOnly = true`。
- 不包含原始 JSON、内部字段名或数据库参数。

旧版非 Json bid 继续走现有 formatter，保持兼容。

嵌套 `conditions[].value` 也必须使用同一安全原则；若没有足够的 property context 生成完整自然语言，则显示安全摘要或 `Condition needs review`，绝不能返回原始 JSON。

### 4.4 前端职责

前端继续以服务端 `readableText` 为主，不复制服务端 formatter。

在 Tier Summary / Bid Review 的真实页面回归中增加断言：可见文本、title 和 aria-label 均不能包含序列化 bid 标记，例如 `{"type":`。这是一道消费端回归门禁，不承担业务文案生成。

## 5. 数据流

```text
Pairing bid object
  -> serializeRuleBid(operator="Json", paramA=JSON)
  -> pbs_bid_group / pbs_bid_condition
  -> lineholder-summary-service
  -> structured Pairing summary dispatcher
  -> readableText / safe value
  -> pbs-portal Current Summary
```

## 6. 测试设计

### 6.1 Formatter 单元测试

在 `lineholder-summary-formatters.test.ts` 增加表驱动矩阵：

- Pairing Length：等值、下限、上限、区间、specific dates、date range、忽略 `min/max`。
- Flight Number Preference：单航班、多航班、specific dates、date range。
- Work Day Preference：星期排序、多窗口顺序、specific dates、date range、缺失 endpoint 进入 review-only。
- Redeye Preference：无日期、specific dates、date range。
- 已支持的其他 Pairing Json bid 保持原有文案。
- malformed JSON、未知 type、property/type 不匹配进入 review-only 安全回退。
- 对全部 Pairing Json 样例统一断言 `value` 和 `readableText` 不包含原始 JSON。
- 从 Pairing catalog + `serializeRuleBid()` 自动推导 Json bid types，与结构化 formatter registry keys 做双向精确相等断言。

### 6.2 Service / Route 回归

通过 lineholder summary service 或 route fixture 构造 `operator = "Json"` 的 property 112 和 116，验证 API 返回准确的 `readableText`、安全 `value` 和正确 `isReviewOnly`。

### 6.3 Playwright

使用真实 PBS Portal 页面流程加载包含截图两条条件的 Current Summary：

- 断言显示指定自然语言。
- 断言页面、title、aria-label 不包含 `{"type":`、`flight-number-preference` 或 `pairing-length-preference`。
- 断言 T1/T2 tier 标签和 PREVIEW 操作仍正常显示。

## 7. 非目标

- 不修改 Pairing PREVIEW 搜索结果或查询语义。
- 不修改 Pairing bid editor。
- 不修改 `serializeRuleBid()` 的 Json 存储协议。
- 不修改算法导出文件。
- 不重构 Days Off、Line、Reserve 的全部 summary 文案。

## 8. 验收标准

1. 截图中的两条条件显示为指定自然语言，不出现 JSON。
2. 所有当前 Pairing `operator = "Json"` 类型都有明确 formatter 或安全 review-only 输出。
3. Summary API 的 `readableText`、`value`、嵌套 condition value 均不泄漏序列化 JSON。
4. 新增结构化 Pairing bid 却未增加 summary formatter 时，测试必须失败。
5. 旧版非 Json Pairing summary 文案不变。
6. 聚焦单测、lineholder summary route/service 测试、PBS Portal Playwright 和 TypeScript build 全部 PASS。

## 9. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: canonical formatter、API fixture 与 UI 验收围绕同一文案 contract，顺序实现和验证更容易保持一致。
- Suggested split: 不拆分。
- Write boundaries: `pbs-server` summary formatter/tests、对应 PBS Portal Playwright 测试。
- Conflict risk: 中；当前工作区已有 Pairing 搜索相关未提交改动，实施时必须只触碰本规格文件范围。
- Execution gate: 用户审核并批准本规格后再实施。
