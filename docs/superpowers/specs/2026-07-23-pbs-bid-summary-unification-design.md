# PBS Bid 条件摘要统一设计

## 1. 背景

当前 Bid 工作台已经合并 `DAYS OFF`、`PAIRING`、`LINE` 三类条件，但已保存条件的摘要仍由多套逻辑分别生成：

- Bid 主页面顶部的 `EXISTING BID PROPERTIES` 来自 Tier / Lineholder Summary API 的 `TierSummaryItem.readableText`。
- `PAIRING` 的 `EXISTING BID PROPERTIES` 使用 Pairing 专用摘要。
- `Search Pairings` 的 `SEARCH CRITERIA` 另行拼接条件名称、Action、Quantifier 和 Bid 值。
- `DAYS OFF` 主要复用通用 Rule Bid 值格式化。
- `LINE` 在页面内部维护额外的 `renderLineExistingBidSummary`。
- Lineholder Summary 在服务端还有一套更接近自然语言的 formatter，但它不是 Portal 当前摘要的共同来源。

这导致同一条条件在不同位置可能出现以下问题：

- 文案不一致，例如 `Award · Up to 1 days` 与 `Award pairings up to 1 day long`。
- 内部值直接暴露，例如 ISO 日期、技术操作符或 `Configured`。
- 相同 Pairing label 被重复显示。Crew `906` 的 13 个不同 Pairing ID 都对应 `V4507`，当前页面显示 13 次 `V4507`。
- Action、Quantifier、单复数、日期和范围表达不统一。
- 每修复一个页面或一个条件，其他入口仍可能继续漂移。

本设计将 Portal 中三类 Bid 条件的用户可读摘要收敛到一个公共入口，并让 `SEARCH CRITERIA` 与 `EXISTING BID PROPERTIES` 对同一条数据给出相同结果。

## 2. 已确认的产品决策

1. 统一范围不是只有 Pairing，而是 Bid 页面中的：
   - `DAYS OFF`
   - `PAIRING`
   - 可见 Tab `ROSTER` 对应的内部 `Line` 条件
2. 当前可见条件共 19 个，全部纳入本次摘要审计和回归。
3. `SEARCH CRITERIA` 与 `EXISTING BID PROPERTIES` 必须消费同一份摘要结果。
4. 重复 Pairing label 必须合并，例如：
   - `Award pairings V4507 ×13`
5. 不向员工展示内部 Pairing ID。
6. 长多选列表采用紧凑展示：
   - 摘要显示选择总数。
   - 默认只显示前几个值。
   - 提供 `Show all N selected` / `Show less`。
7. Crew `906` 作为三类真实数据回归样本。
8. 本次不修改接口、数据库、导入结构或已经导入的五个人数据。
9. 当前工作区尚未提交的 Pairing Length 摘要修改纳入本次统一实现，不另建一套逻辑。

## 3. 目标

1. 建立 Portal 内唯一的 Bid 条件摘要入口。
2. 为 Days Off、Pairing、Line 分别提供清晰、可测试的业务 formatter。
3. 统一自然语言、日期、操作符、Action、Quantifier 和单复数。
4. 为长多选数据提供可复用的紧凑摘要模型和展开交互。
5. 消除 Pairing Preference 重复 label 的不可读展示。
6. 保证同一条条件在 Existing、Search Criteria 和相关预览入口中不会再次出现文案漂移。
7. 用真实 UI Playwright 回归证明 Crew `906` 的三类条件可读且一致。
8. 对主页面 Tier Summary 中可编辑的 current bid，使用 `editableSource` 对账到已经加载的规范化 draft property 后生成摘要，而不是继续直接信任另一套 `readableText`。

## 4. 非目标

- 不修改 Bid property catalog。
- 不新增、隐藏或删除任何条件。
- 不修改条件编辑弹窗的字段、默认值或保存行为。
- 不修改 Pairing Search 的筛选 SQL、返回数量或匹配逻辑。
- 不修改当前导入接口和 Playwright 导入映射。
- 不迁移、清理或重新导入 Crew `264、844、906、1131、1185`。
- 不修改数据库 schema、seed 或 migration。
- 不在本次强制统一服务端 Lineholder Summary；服务端现有自然语言 formatter 只作为语义参考。
- 不用 Portal formatter 覆盖 legacy、unsupported 或无法与当前 draft 对账的 Tier Summary 行；这类行继续保留服务端 review-only / legacy 表达。
- 不把整个 Rule Bid 表格重构为新架构。

## 5. 当前可见条件范围

### 5.1 Days Off：2 个

| Code | 条件 | 当前 payload |
|---:|---|---|
| `201` | Prefer Off | `tag-list` |
| `204` | Long Stretch Off / Compressed Flying | `stepper-date-range` |

### 5.2 Pairing：11 个

| Code | 条件 | 当前 payload |
|---:|---|---|
| `102` | Pairing Preference | `pairing-preference` |
| `103` | Pairing Check-In / Check-Out Time | `pairing-check-time` |
| `107` | Flight Legs per Duty | `flight-legs-per-duty` |
| `110` | Work Day Preference | `work-day-preference` |
| `112` | Pairing Length | `pairing-length-preference` |
| `116` | Flight Number Preference | `flight-number-preference` |
| `117` | Redeye Preference | `redeye-preference` |
| `122` | Deadhead Flying | `deadhead-flying` |
| `129` | Time Between Flights | `duration` |
| `163` | Month-End Carryover | `month-end-carryover` |
| `168` | Airport Preference | `airport-preference` |

### 5.3 Line：6 个

| Code | 条件 | 当前 payload |
|---:|---|---|
| `407` | Minimum Base Layover | `minimum-base-layover` |
| `408` | Commuter Pattern | `days-off-on-pattern` |
| `410` | Mixed Block Pattern | `reserve-flying-date-pattern` |
| `427` | Reserve Avoidance | `reserve-avoidance` |
| `428` | Efficient Flying First | `flag` |
| `429` | Credit Window Preference | `credit-window-preference` |

只有后端返回且当前 Portal 可见的 catalog 条件属于本次范围。隐藏的 legacy / AA 条件不因为本次摘要统一重新进入员工端。

Bid 页面对用户显示的分类 Tab 名为 `ROSTER`；代码、API 和本 spec 中的业务分类仍使用 `Line / line`。Playwright 应通过可见名称 `ROSTER` 定位 Tab。

## 6. 推荐架构

### 6.1 公共摘要入口

Portal 新增一个公共 Bid 摘要入口，接收分类和已规范化的 property：

```ts
type BidSummaryCategory = "days-off" | "pairing" | "line";

type BidPropertySummary =
  | {
      kind: "text";
      text: string;
      title: string;
    }
  | {
      kind: "selection-list";
      headline: string;
      groups: BidSummaryGroup[];
      totalItemCount: number;
      collapsedGroupLimit: number;
      collapsedValueLimit: number;
      title: string;
    };
```

公共入口只负责分发：

```ts
buildBidPropertySummary(category, property)
```

具体业务语义分别放在三个小型 formatter 中：

- `buildDaysOffBidPropertySummary`
- `buildPairingBidPropertySummary`
- `buildLineBidPropertySummary`

这样既保持一个消费入口，又避免把 19 个条件堆进一个无法维护的大型 switch。

### 6.2 公共展示组件

新增或泛化一个 `BidPropertySummaryView`：

- `text`：展示完整自然语言摘要。
- `selection-list`：
  - 展示 headline。
  - 默认显示有限 group / value。
  - 超出限制时显示 `+N more`。
  - 提供 `Show all N selected` / `Show less`。
  - 展开区域自身限制高度并滚动，不推动整个 Bid 页面无限增长。

Pairing 现有的 grouped summary 交互应迁移到该公共模型，不能再保留只支持 `pairing-id-list` / `pairing-occurrence-list` 的特殊孤岛。

### 6.3 消费位置

以下位置必须使用公共摘要入口：

1. Bid 主页面顶部 `EXISTING BID PROPERTIES`
   - 对 `TierSummaryItem.isEditable=true` 且存在 `editableSource` 的 current item：
     - 根据 `editableSource.module` 选择已经加载的 Days Off / Pairing / Line draft。
     - 根据 `editableSource.propertyGroupKey` 找到规范化 property。
     - 使用公共摘要入口生成显示结果。
   - 对 legacy、unsupported、review-only 或无法匹配 draft property 的 item：
     - 不猜测 payload。
     - 保留服务端安全的 `readableText` 和 review 状态。
2. `Search Pairings` 的 `SEARCH CRITERIA`
   - Current Rules 表达式
   - 单条件预览 / 已选条件行
3. 三个模块自身的 Existing 只读摘要入口，用于编辑跳转后的模块内容或独立页面复用。
4. Bid 页面中展示已配置 favorite 值的只读摘要位置，如果其数据结构与 Existing 相同。

编辑控件、表单字段和 Available Property 的空默认值不强制改成完整自然语言句子。

### 6.4 Tier Summary 与 draft 对账

主 Bid 页加载时已经并行持有：

- Tier Summary
- Days Off draft
- Pairing draft
- Line draft

不得新增 API，也不得为了摘要再次请求 property。建立只读索引：

```ts
Map<`${module}:${propertyGroupKey}`, NormalizedBidProperty>
```

处理顺序：

1. `TierSummaryItem` 没有 `editableSource`：使用服务端 `readableText`。
2. `editableSource.module` 不属于 `DaysOff / Pairing / Line`：使用服务端 review fallback。
3. 对应模块 draft 中找不到 `propertyGroupKey`：使用服务端 `readableText`，并保持 item 原有 review / legacy 标记。
4. 找到规范化 property：调用 `buildBidPropertySummary`。

该对账只改变 Portal 显示，不改变 Tier Summary API contract、删除/编辑定位或缓存身份。

## 7. 通用文案规则

### 7.1 Action

- `award` → `Award`
- `avoid` → `Avoid`
- property 没有 Action 时，不伪造 `Award / Avoid`。
- Days Off 的 `Prefer Off` 直接使用 `Prefer off ...`。

### 7.2 Quantifier

- `any` → `any`
- `every` → `every`
- 量词必须放进完整业务句子，不能只显示孤立的 `Any ·` / `Every ·`。

### 7.3 操作符

面向员工的摘要不直接显示技术操作符：

| Operator | 自然语言 |
|---|---|
| `>` | `more than` / `greater than` |
| `<` | `fewer than` / `less than` |
| `=` | `exactly` |
| `Between` | `between ... and ...` |

具体词语根据业务单位选择，但同一条件必须保持固定。

### 7.4 日期

- ISO 日期 `2026-07-01` 显示为 `Jul 1, 2026`。
- 日期范围使用 `from Jul 1, 2026 to Jul 10, 2026`。
- 多日期按业务句子连接，不显示原始数组或 JSON。
- 日期解析失败时不能静默生成误导文案；应返回明确的安全 fallback，并由测试覆盖。

### 7.5 单复数

- `1 day`，不能显示 `1 days`。
- `1 pairing` / `N pairings`。
- `1 selected date` / `N selected dates`。

### 7.6 属性名称

- 卡片或表格的 `PROPERTY` 列继续显示 property 名称。
- 摘要文本表达完整业务含义，但不机械重复标题。
- `SEARCH CRITERIA` 与 Existing 的摘要内容相同；Search 外层可以保留 property 标题和 AND / OR 结构。

## 8. 多选与分组规则

### 8.1 Pairing Preference

`pairingIds` 是稳定身份，`pairingLabels` 是员工可读编号。摘要按 label 保持首次出现顺序并计数：

```json
{
  "pairingIds": ["98938", "99070", "99276"],
  "pairingLabels": ["V4507", "V4507", "V4507"]
}
```

显示：

```text
Award pairings V4507 ×3
```

多个 label：

```text
Award pairings C4107 ×3, C4130 ×3, C4155 ×1
```

规则：

- 不展示内部 Pairing ID。
- label 与 ID 数量不一致、label 为空或 payload 不完整时，显示安全的 review 文案，不能回退为 JSON 或内部 ID。
- `×1` 在分组计数模式中保留，以便所有 group 表达一致。

### 8.2 Prefer Off 与其他长列表

Crew `906` 的 15 个 Prefer Off 日期采用：

```text
Prefer off on 15 selected dates
```

下方默认展示前几个友好日期，超出部分显示 `+N more`，并提供：

```text
Show all 15 selected
```

同样的紧凑交互可复用于：

- Airport Preference locations
- Flight Number Preference
- Pairing Preference labels
- Work Day Preference
- 其他当前 payload 中可能产生长多选列表的条件

短列表可以直接显示完整自然语言，不强制出现展开按钮。

### 8.3 固定折叠阈值与计数语义

默认阈值固定为：

- `collapsedGroupLimit = 3`
- `collapsedValueLimit = 3`

计数定义：

- `+N more`：N 表示当前 group 中尚未显示的 value 数量。
- `+N more pairings`：N 表示尚未显示的 unique label group 数量。
- `Show all N selected`：N 始终表示底层实际选中项总数，不是 unique group 数量。
- `Show less`：恢复到上述固定阈值。

Crew `906` 的逐字目标：

- Prefer Off：
  - headline：`Prefer off on 15 selected dates`
  - 默认显示 3 个日期
  - 显示 `+12 more`
  - 按钮：`Show all 15 selected`
- Pairing Preference：
  - 13 个真实 Pairing ID、一个 unique label 时显示：`Award pairings V4507 ×13`
  - 不显示 Pairing ID
  - 不把 `V4507` 平铺 13 次
  - 只有一个 unique label group，因此不因为底层数量为 13 而强制显示展开按钮

## 9. 19 个条件的目标表达

以下是表达模式，不要求示例中的值成为硬编码测试数据。

### 9.1 Days Off

| 条件 | 目标示例 |
|---|---|
| Prefer Off | `Prefer off on 15 selected dates`，并可展开日期 |
| Long Stretch Off / Compressed Flying | `Award at least 5 consecutive days off from Jul 10, 2026 to Jul 20, 2026` |

### 9.2 Pairing

| 条件 | 目标示例 |
|---|---|
| Pairing Preference | `Award pairings V4507 ×13` |
| Check-In / Check-Out Time | `Award pairings checking check-in between 05:55 and 17:00` |
| Flight Legs per Duty | `Avoid pairings with any duty having more than 2 flying legs` |
| Work Day Preference | `Award pairings checking in on Monday between 06:00 and 10:00` |
| Pairing Length | `Award pairings up to 1 day long` |
| Flight Number Preference | `Award pairings with flights I7013, I7153 on Jun 30, 2026` |
| Redeye Preference | `Avoid pairings with a redeye leg` |
| Deadhead Flying | `Award pairings with any deadhead on Jul 3, 2026` |
| Time Between Flights | `Award pairings with more than 01:30 between flights` |
| Month-End Carryover | `Avoid pairings with month-end carryover greater than 6 days` |
| Airport Preference | `Avoid pairings landing at LAX, MEX, SFO` |

### 9.3 Line

| 条件 | 目标示例 |
|---|---|
| Credit Window Preference | `High credit window` |
| Minimum Base Layover | `At least 10:00 base layover` |
| Commuter Pattern | `Work 3–5 days, then 2 days off` |
| Efficient Flying First | `Award Efficient Flying First` |
| Mixed Block Pattern | `Reserve CRAM for the first half; flying for the second half` |
| Reserve Avoidance | `Avoid reserve if possible` |

Line property 没有 Action 时不补 `Award`；只有 payload 或 property 本身明确表达 Award / Avoid 时才显示。

## 10. 数据流

```text
Current Bid API response
        ├── Days Off / Pairing / Line draft mapper
        └── Tier Summary
                    │
                    ▼
editableSource.module + propertyGroupKey 对账
                    │
                    ▼
buildBidPropertySummary(category, normalized property)
        │
        ├── Days Off formatter
        ├── Pairing formatter
        └── Line formatter
        │
        ▼
BidPropertySummaryView
        │
        ├── EXISTING BID PROPERTIES
        └── SEARCH CRITERIA / preview
```

摘要是纯展示派生值，不回写 API，不改变 payload，也不参与 Pairing Search 查询构造。

## 11. 错误与 fallback

1. 任何 formatter 都不能向 UI 输出：
   - JSON
   - `[object Object]`
   - 内部 Pairing ID
   - 空白字符串
2. 合法但为空的编辑草稿可以使用 `Not configured`，但已保存条件不应正常出现该状态。
3. 结构不完整且可能误导用户时，使用：
   - `<Property name> needs review`
4. fallback 必须保留 property 名称和 review 状态，不能假装条件有效。
5. 日期、范围、数量等非法值由现有保存校验负责阻止；摘要层仍需防御历史或异常响应。
6. Tier Summary 对账失败时优先保留服务端已有的安全 `readableText`；只有 formatter 自己收到异常 current payload 时才生成 `<Property name> needs review`。

## 12. 实现范围

预计涉及：

- `pbs-portal/src/features/bid/**` 或等价共享摘要目录
- `pbs-portal/src/features/rule-bids/**`
- `pbs-portal/src/features/pairing/**`
- `pbs-portal/src/features/days-off/**`
- `pbs-portal/src/features/line/**`
- `packages/contracts/pbs-pairing-bids.js` 中当前尚未提交的 Pairing Length formatter视最终边界决定保留或迁移
- 对应 Vitest、Playwright 和 QA 文档

实施时应优先复用现有：

- `buildExistingPairingBidSummary`
- `PairingBidSummaryView`
- 服务端 Lineholder Summary 中已经确认的自然语言语义

不允许同时保留新的公共 formatter 和旧的页面级 formatter，使两个入口继续独立演进。

## 13. 测试策略

### 13.1 Formatter 单元测试

建立 19 个当前可见条件的矩阵测试，至少覆盖：

- Award / Avoid。
- Any / Every。
- 单值、Between。
- 单数 / 复数。
- 无日期、specific dates、date range。
- 短列表、长列表、展开和收起。
- Pairing label 不重复、重复和 payload 不完整。
- 非法日期 / 空范围的安全 fallback。

### 13.2 组件测试

验证：

- Existing 与 Search 对同一个 property 使用相同摘要。
- 可编辑 Tier Summary item 能通过 `editableSource.module + propertyGroupKey` 找到当前 draft property。
- legacy / unsupported / unmatched Tier Summary item 不被 current formatter 错误覆盖。
- `selection-list` 默认折叠。
- `Show all N selected` 展开全部值。
- `Show less` 恢复折叠。
- 展开区域内部滚动，不导致整个页面无边界增长。

### 13.3 Playwright

使用真实 Crew `906`，只读验证，不新增或删除条件：

1. 登录并进入 Bid 页面。
2. `ROSTER / T1`（内部 category 为 `line`）：
   - Credit Window Preference 显示 `High credit window`。
3. `DAYS OFF / T2`：
   - Prefer Off 显示 15 个选择的紧凑摘要。
   - 展开后可查看全部友好日期。
4. `PAIRING / T3`：
   - Pairing Preference 显示 `V4507 ×13`，不重复平铺 13 次。
5. 从 Pairing 进入 `SEARCH PAIRINGS`：
   - `SEARCH CRITERIA` 中同一条件显示同样的 `V4507 ×13`。
6. 继续检查 Crew `906` 的 T4–T7：
   - `V4505 ×17`
   - Redeye
   - Flight Legs per Duty
   - Airport Preference
7. 断言页面不存在 JSON、`[object Object]` 或内部 Pairing ID。

### 13.4 QA 文档

新增或更新：

```text
docs/test-cases/pbs/bid/2026-07-23-bid-summary-unification.md
```

QA 覆盖 Days Off、Pairing、Line 三类及 Search Criteria 对账。

### 13.5 验证命令

实施后的最小验证顺序：

```bash
npm --prefix pbs-portal test -- <focused summary tests>
npm run check:ui
npm --prefix pbs-portal run build
(cd e2e && npx playwright test tests/pbs-portal/bid-summary-unification.spec.ts \
  --config=config/playwright.config.ts \
  --project=pbs-portal \
  --no-deps)
git diff --check
node .gitnexus/run.cjs detect-changes --scope compare --base-ref main
```

如公共 contract 被修改，再补对应 Node contract tests；如未修改服务端，不要求执行 migration 或数据库验证。

## 14. 验收标准

- 三类 19 个可见条件都有明确的目标摘要测试。
- 同一 Pairing 条件在 `SEARCH CRITERIA` 与 `EXISTING BID PROPERTIES` 中内容一致。
- Crew `906` 的 `V4507` 显示为 `V4507 ×13`，不再重复 13 次。
- Crew `906` 的 15 个 Prefer Off 日期默认紧凑显示，可展开查看全部日期。
- Line 的 Credit Window 不再由页面私有 formatter 与通用表格产生不同文案。
- 主页面可编辑 Existing item 使用规范化 draft property；legacy / unmatched item 继续保留安全 review 文案。
- 日期使用友好英文格式。
- 操作符、量词和单复数符合自然语言。
- UI 不显示 JSON、对象字符串或内部 Pairing ID。
- Pairing Search 结果数量和现有条件保存数据不发生变化。
- Focused Vitest、UI standard gate、build 和 Playwright 全部 PASS。

## 15. 风险与控制

### 风险 1：摘要统一误改查询行为

控制：摘要函数保持纯函数，只消费 property，不参与 request payload 和 SQL condition builder。

### 风险 2：工作区现有 Pairing Length 修改冲突

控制：实施前以当前工作树为基线整合，不回退、不覆盖已有修改；Pairing Length 只保留一个最终 formatter。

### 风险 3：过度扩大到服务端

控制：本次以 Portal 三类条件和两个核心展示区域为边界。服务端 formatter 仅作为语义参考，除非实施中发现共享 contract 是避免真实重复的最小方案，否则不改。

### 风险 4：长列表撑高页面

控制：统一折叠阈值、展开按钮和内部最大高度；只让摘要详情区域滚动。

### 风险 5：异常历史 payload 暴露内部数据

控制：严格 fallback，Pairing label 不完整时显示 needs review，不显示真实 ID。

## 16. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 公共摘要模型、三个 formatter 和展示组件共享同一契约，且当前工作区存在未提交的 Pairing Length 修改；并行写入容易发生冲突或重复设计。
- Suggested split: 不拆分实现；可以在实现完成后进行独立只读 review。
- Write boundaries: Portal 摘要层、Days Off / Pairing / Line 消费入口、focused tests、Playwright、QA 文档。
- Conflict risk: 中等，主要来自当前未提交的 Pairing Length 文件。
- Execution gate: 本 spec 经用户审核并明确批准实施后，才能编写实现计划和修改产品代码。

## 17. 实施门禁

开始实现前必须满足：

- [x] 用户确认范围包含 `DAYS OFF + PAIRING + LINE`。
- [x] 用户确认重复 Pairing label 使用 `V4507 ×13`。
- [x] 用户确认长日期列表采用紧凑摘要并支持展开。
- [ ] 用户审核本书面 spec。
- [ ] 用户明确批准开始实施。

本 spec 不授权主动提交 Git；只有用户明确要求时才提交。
