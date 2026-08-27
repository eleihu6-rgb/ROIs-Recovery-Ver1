# PBS Tier Bid Summary 语义化展示设计

日期：2026-06-05

## 背景

Tier 页面 `BID SUMMARY` 当前用于汇总 Pairing、Days Off、Line、Reserve 四类 bid 在各个 tier 下的最终条件。它对业务用户非常关键：客户会通过这里确认每个 Tx 到底包含哪些 bid、每条 bid 的意图是什么、是否存在过严或冲突。

当前展示存在明显问题：摘要更像数据库字段拼接，不像业务语言。例如：

- `Set Short Call Type: PRAM - {"mode":"whole_month"}`
- `Award Reserve: Enabled`
- `Set Max Credit Window: Enabled`
- `Set Most Flying In Least Days = 75:00 / 15 / strong`

这些文案暴露了内部参数结构，客户难以理解，尤其是 Reserve 的 date scope、Line 的 flag bid、强语义的 `Only Reserve` / `No Reserve`。

## 目标

将 Tier 页面 `BID SUMMARY` 的每条摘要改成客户可读的业务句子。

核心目标：

- 文案保持英文，符合当前 PBS Portal UI 语言。
- 日期显示使用客户可读格式，例如 `Jun 24, 2026`。
- 动作词保持 `Award` / `Avoid`，不把 `Award` 替换成 `Prefer` 或 `Require`。
- Pairing、Days Off、Line、Reserve 四类 bid 都输出语义化文案。
- 首期尽量覆盖数据库中当前可见的属性；隐藏的 AA 属性暂不纳入首期覆盖范围。
- 不在 Tier 前端临时替换字符串，而是在后端 summary 接口生成稳定的 `readableText`。
- 保持前端 Tier 页面简单消费 `readableText`。
- 保留 `label`、`operator`、`value` 等字段供调试或后续详情使用，但列表主文案以 `readableText` 为准。
- 不改变 bid 数据模型、保存接口、算法导出规则。

## 非目标

- 不重做 Tier 页面视觉布局。
- 不改变 Tx / tier 的排序、统计、diagnostics 逻辑。
- 不改变 Pairing preview、小眼睛、favorite、Add/Edit flow。
- 不新增新的 bid 条件。
- 不改变算法导出 CSV 的 `Description` 规则，除非后续单独确认。
- 不覆盖数据库中隐藏的 AA 属性；这些属性后续显示到 Portal 时再单独补语义化文案。

## 当前问题定位

当前汇总来自：

- 后端：`pbs-server/src/services/lineholder/lineholder-summary-service.ts`
- 前端 mapper：`pbs-portal/src/features/tier/tier-draft-mappers.ts`
- 前端展示：`pbs-portal/src/features/tier/components/tier-summary-sections.tsx`

后端当前使用通用拼接逻辑：

- `action_id=1` 显示为 `Award`
- `action_id=2` 显示为 `Avoid`
- 无 action 显示为 `Set`
- `param_a/param_b/param_c` 用 `formatSummaryValue()` 简单拼接
- 最后用 `formatReadableText()` 拼成 `Set/Award/Avoid + label + operator/value`

这个逻辑没有理解不同 bid type 的业务语义，因此会把 JSON 参数或内部枚举直接暴露给用户。

## 推荐方案

在后端 summary service 增加语义化 formatter 层。

设计原则：

- formatter 输入仍来自 `pbs_bid_group` / `pbs_bid_condition` 的 row 数据。
- formatter 根据 `bidType + propertyCode + actionId + operator + paramA/paramB/paramC` 输出客户可读的 `readableText`。
- 未覆盖的 property 仍保留当前通用 fallback，避免出现空白。
- date scope、date list、flag、range、strength 等通用格式化能力抽成小函数，供 Days Off、Line、Reserve 复用。

## 文案规则

### 通用规则

- 避免显示 `Enabled`，除非没有更具体语义。
- 避免显示原始 JSON，例如 `{"mode":"whole_month"}`。
- 避免把内部字段名直接展示给客户，例如 `paramA`、`paramB`、`SetCondition`。
- 日期使用短月份格式，例如 `Jun 24, 2026`。
- 多值列表用逗号分隔。
- 语气应表达 bid 意图，而不是数据库动作。
- Pairing 与需要方向的 bid 保留 `Award` / `Avoid`，不要替换成 `Prefer` / `Require`。
- 首期覆盖范围以数据库里 `is_visible_in_portal = 1` 或当前 Portal 实际展示的属性为准；隐藏 AA 属性暂不要求覆盖。

### Pairing

示例规则：

| 当前语义 | 推荐文案 |
| --- | --- |
| `Award Any Landing In Airport: ABD` | `Award pairings landing in ABD` |
| `Award Pairing Number: 11780` | `Award pairing 11780` |
| `Award Pairing Number: 11963,11962` | `Award pairings 11963, 11962` |
| `Avoid Report Between: 09:00 - 12:00` | `Avoid pairings reporting between 09:00 and 12:00` |

Pairing 需要保留 `Award` / `Avoid` 的方向，因为这是 pairing bid 的核心语义。

### Days Off

示例规则：

| 当前语义 | 推荐文案 |
| --- | --- |
| `Set Prefer Off: 2026-06-10` | `Award day off on Jun 10, 2026` |
| `Set Prefer Off: 2026-06-10,2026-06-11` | `Award day off on Jun 10, 2026, Jun 11, 2026` |
| `Set Minimum Days Off Between Work Blocks: 3` | `Award at least 3 days off between work blocks` |
| `Set String of Days Off Starting on Date = 4 / 2026-06-10` | `Award 4 consecutive days off starting Jun 10, 2026` |

### Line

示例规则：

| 当前语义 | 推荐文案 |
| --- | --- |
| `Award Reserve: Enabled` | `Only Reserve for the whole bid month` |
| `Avoid Reserve: Enabled` | `No Reserve for the whole bid month` |
| `Set Max Credit Window: Enabled` | `Use max credit window` |
| `Set Min Credit Window: Enabled` | `Use minimum credit window` |
| `Set Most Flying In Least Days = 75:00 / 15 / strong` | `Award at least 75:00 credit in 15 or fewer working days, strong priority` |
| `Set Commuter Pattern: 4 / 4 / 5` | `Award commuter pattern with 4 days off followed by 4-5 days on` |
| `Set Reserve / Flying Date Pattern: ...` | `Award reserve / flying pattern: PRAM reserve in the first half of the bid month; flying in the second half of the bid month, strong priority` |

Line `Reserve` 需要沿用已确认语义：

- `Award Reserve` = `Only Reserve`
- `Avoid Reserve` = `No Reserve`
- 作用范围是 whole bid month
- 不显示 `Enabled`

### Reserve

示例规则：

| 当前语义 | 推荐文案 |
| --- | --- |
| `Set Reserve Day On: 2026-06-24` | `Award reserve day on Jun 24, 2026` |
| `Set Short Call Type: PRAM - {"mode":"whole_month"}` | `Award PRAM short call for the whole bid month` |
| `Set Short Call Type: CRPM - {"mode":"first_half"}` | `Award CRPM short call in the first half of the bid month` |
| `Set Short Call Type: PRAM - {"mode":"specific_dates","dates":["2026-06-10"]}` | `Award PRAM short call on Jun 10, 2026` |

Reserve date scope 映射：

| mode | 推荐文案 |
| --- | --- |
| `whole_month` | `for the whole bid month` |
| `first_half` | `in the first half of the bid month` |
| `second_half` | `in the second half of the bid month` |
| `date_range` | `from <from> to <to>` |
| `specific_dates` | `on <date list>` |

## 技术设计

### 后端 formatter

建议在 `pbs-server/src/services/lineholder/` 下新增或内聚以下函数：

- `formatLineholderSummaryItem(row): { value: string; readableText: string }`
- `formatPairingSummaryText(row)`
- `formatDaysOffSummaryText(row)`
- `formatLineSummaryText(row)`
- `formatReserveSummaryText(row)`
- `formatDateScope(value)`
- `formatDateList(values)`
- `formatStrength(value)`

如果文件过大，可新增：

`pbs-server/src/services/lineholder/lineholder-summary-formatters.ts`

`lineholder-summary-service.ts` 只负责查询、聚合、统计和调用 formatter。

formatter 覆盖清单应从当前数据库可见属性和 contracts 支持属性交叉确认：

- Pairing：覆盖当前 Portal 可见的 Pairing property。
- Days Off：覆盖当前 Portal 可见的 Days Off property。
- Line：覆盖当前 Portal 可见的 legacy Line property，以及已确认可见的 `Reserve` 427。
- Reserve：覆盖当前 Portal 可见的 Reserve property。
- 隐藏 AA 属性可以保留 fallback，不作为首期验收失败项。

### 数据解析

formatter 需要解析以下数据形态：

- `paramA` 为单值。
- `paramA/paramB` 为 range。
- `paramA/paramB/paramC` 为组合参数。
- `paramA` 或 `paramB` 可能是 JSON 字符串，例如 Reserve date scope 或 Line reserve/flying segments。
- `actionId` 映射为 Award / Avoid / SetCondition。
- `propertyCode` 优先使用稳定 `pbs_bid_property.property_code`，没有时 fallback 到 legacy property code。

解析 JSON 时必须容错：

- 能 parse 就语义化显示。
- parse 失败则 fallback 到当前安全拼接，不能让 summary 接口 500。

### 前端

前端 Tier 页面原则上不需要大改。

确认点：

- `tier-draft-mappers.ts` 继续优先使用 `item.readableText`。
- 如果后端没有 `readableText`，前端 fallback 保持现状。
- UI 只展示语义化后的 `readableText`。

如后续需要进一步提升客户理解，可另开视觉设计任务，例如在摘要行中显示短标签、图标、可展开详情等。

## API 行为

`GET /api/lineholder-bids/current/summary` 返回结构不变。

变化：

- `summaryItems[].readableText` 更语义化。
- `summaryItems[].value` 可继续保留格式化后的 value。
- `summaryItems[].bid` 可继续保留当前值或与 value 一致。

兼容性：

- 不新增必填字段。
- 不删除字段。
- 不改变前端已有消费结构。

## 验收标准

1. Tier `BID SUMMARY` 不再显示原始 JSON，例如 `{"mode":"whole_month"}`。
2. Reserve `Short Call Type` 显示为客户可读范围，例如 `Award PRAM short call for the whole bid month`。
3. Reserve `Reserve Day On` 显示为客户可读日期文案。
4. Line `Award Reserve` 显示为 `Only Reserve for the whole bid month`。
5. Line `Avoid Reserve` 显示为 `No Reserve for the whole bid month`。
6. Line flag 类 bid 不再显示 `Enabled` 作为主要语义，至少覆盖 `Max Credit Window`、`Min Credit Window`。
7. Line complex bid 至少覆盖 `Most Flying In Least Days`、`Commuter Pattern`、`Reserve / Flying Date Pattern`。
8. Pairing 常见 bid 至少覆盖 `Any Landing In Airport`、`Pairing Number`。
9. Days Off 常见 bid 至少覆盖 `Prefer Off`、`Minimum Days Off Between Work Blocks`。
10. 数据库中当前可见的属性应尽量都有专门语义化文案；隐藏 AA 属性允许走 fallback。
11. 未覆盖 property 仍有 fallback 文案，summary 接口不应 500。
12. 现有 diagnostics、tier count、sort、editableSource 行为不被破坏。

## 测试计划

后端测试：

- 新增或扩展 `lineholder-summary-service.test.ts` / formatter 单元测试。
- 覆盖截图中的 case：
  - Pairing `Any Landing In Airport`
  - Pairing `Pairing Number`
  - Days Off `Prefer Off`
  - Line `Award Reserve`
  - Line `Max Credit Window`
  - Line `Most Flying In Least Days`
  - Reserve `Reserve Day On`
  - Reserve `Short Call Type` + `whole_month`
- 覆盖 JSON parse failure fallback。
- 覆盖 `Award Reserve` / `Avoid Reserve` 两种 action。

前端测试：

- 保留 `tier-draft-mappers` 现有行为：优先使用 `readableText`。
- 若需要，可补一个 Tier 页面测试，确认后端给出的语义文案能直接显示。

回归测试：

- `pnpm --filter pbs-server exec tsx --test ...`
- `pnpm --filter pbs-server exec tsc --noEmit`
- `pnpm --filter pbs-portal exec vitest run src/features/tier/...`
- `pnpm --filter pbs-portal exec tsc --noEmit`

## 风险与注意事项

- 最大风险是 property code 覆盖不全。解决方式：先覆盖当前客户最常见和截图暴露的问题，未覆盖保持 fallback。
- JSON 参数历史数据可能格式不一致。formatter 必须容错。
- 文案需要业务确认，尤其是 `Award/Avoid`、`Prefer/Require` 的语气强弱。
- 不应在 formatter 里改变算法语义，只改变客户可读文本。
- 不应把 UI 文案硬编码到多个前端页面，避免未来四个 bid 模块显示不一致。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本任务主要集中在一个后端 summary formatter 与少量测试，拆多 agent 的协调成本高于收益。
- Suggested split: 不建议拆分。单 agent 先完成 formatter、测试和必要前端回归即可。
- Write boundaries: 主要写 `pbs-server/src/services/lineholder/*` 与相关测试；前端最多 touch `pbs-portal/src/features/tier/*` 测试。
- Conflict risk: Low-Medium。风险主要来自与当前未提交的 PBS 改动并行，但文件范围相对独立。
- Execution gate: 用户 review 并确认本 spec 后，才能开始实现。

## 待确认点

1. 已确认：文案保持英文。
2. 已确认：动作词使用 `Award` / `Avoid`。
3. 已确认：日期格式使用 `Jun 24, 2026`。
4. 已确认：首期尽量覆盖数据库中当前显示的属性；隐藏 AA 属性暂不考虑。
