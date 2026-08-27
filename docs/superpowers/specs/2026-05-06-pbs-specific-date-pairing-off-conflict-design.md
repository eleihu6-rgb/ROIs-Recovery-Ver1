# PBS Specific Date Pairing / Days Off 批量添加冲突规则设计

日期：2026-05-06  
作者：Codex  
状态：待用户 review，未实施

## 背景

上一轮已完成：

- `Pairing Number - Entire Month` 展开时排除同 `Tx` touch `Off` 的 occurrence。
- `Days Off` 页面添加 `Off` 时，如果同 `date + Tx` 已有 pairing bid 覆盖，会禁用并拦截。

但还有两个缺口：

1. 在 `Pairing` 页面左侧日历点击日期添加 `Specific Date pairing` 时，如果同 `Tx` 已经有 `Off`，当前仍然可以添加 pairing。这会导致同一 `date + Tx` 同时存在 `Off` 和 specific pairing bid。
2. 在 `Days Off` 页面点击星期表头批量添加 Off 时，pairing 冲突没有被正确排除，仍可能批量写入与 pairing 冲突的 Off。

另外，当前 Days Off 保存失败会在左侧日历面板标题下方显示红色 inline error。该位置会挤压日历视觉，且项目已经有全局 `message` 反馈，本轮移除这块 inline error，仅保留 message。

本项目术语统一使用 `Tier / Tx`。AA 原文 `Layer / Lx` 对应本项目 `Tier / Tx`。

## 目标

1. 在 `Pairing` 页面左侧日历添加 `Specific Date pairing` 时，不能覆盖同 `Tx` 已有 `Off`。
2. 冲突判断按 pairing occurrence 的完整日期范围执行，而不是只看 origin date。
3. `Days Off` 星期表头批量添加时，也必须按同一套 pairing 覆盖范围跳过冲突 `date + Tx`。
4. 前端在弹窗中禁用冲突 `Tx`，并通过全局 `message` 给出明确反馈。
5. 后端保存 Pairing Number specific-date bid 时也做校验，避免绕过前端写出冲突数据。
6. 移除 Days Off 日历面板标题下方红色 inline error，仅保留全局 `message`。
7. 保持 `Entire Month` 当前语义不变：允许添加规则，但日历/有效 occurrence 中排除 touch `Off` 的运行日。

## 不做范围

- 不实现 “Specific Date pairing override Off”。
- 不自动删除 existing Off。
- 不改数据库 schema。
- 不改 planned absence 逻辑。
- 不改 `View Pairing Set` 最终 pairing pool。
- 不把保存失败原因长期渲染在左侧日历面板内。

## 业务规则

### Specific Date Pairing 添加

用户在 `Pairing` 页面左侧日历点某一天，选择一个或多个 pairing occurrence，再选择 `Tx` 保存。

对每个 selected occurrence 和 selected `Tx`：

- 枚举 occurrence 的 `[startDate, endDate]`。
- 如果任意日期命中同 `Tx` 的 existing `day_off_bid`，该 `Tx` 对这个保存动作不可用。
- 如果一个 `Tx` 被任意 selected occurrence 的日期范围挡住，则该 `Tx` 禁用。

示例：

```text
T1 Off: 2026-04-05
Selected pairing: 2026-04-04 - 2026-04-06
结果：T1 不能保存这条 pairing bid；T2 如果无 Off 仍可保存。
```

### 多选 Pairing

如果用户一次多选多个 pairing：

- 对所有 selected occurrences 合并判断。
- 只要任意一个 selected occurrence touch 某个 `Tx` 的 Off，这个 `Tx` 就禁用。
- 用户仍可选择没有冲突的其他 `Tx`。

### Entire Month

`Entire Month` 不新增保存时阻断。

原因：`Entire Month` 是一个月内所有运行日的偏好规则，已在日历/有效 occurrence 展开时排除 touch Off 的运行日。如果直接禁止整条规则，会让用户因为某一天 Off 而无法表达“本月其他运行日我想飞这个 pairing number”。

### Days Off 星期表头批量添加

用户在 `Days Off` 页面点击星期表头时，会批量选择当前 bid month 内该星期对应的日期。

保存时必须对每个 `date + Tx` 独立判断：

- 如果同 `date + Tx` 已有 pairing bid 覆盖，则该条 Off 不写入。
- 没有冲突的 `date + Tx` 仍正常写入。
- 如果本次批量操作有冲突项，通过 `message.warning` 提示跳过数量。
- 如果所有目标都冲突，`SAVE BID` 禁用或保存时不产生写入。

示例：

```text
T1 pairing: 2026-04-04 - 2026-04-06
用户点击 SAT 表头批量加 Off
结果：T1 / 2026-04-04 不写入；T2-T7 或其他无冲突日期正常写入。
```

## 后端设计

后端需要在 Pairing draft 保存路径中补校验，优先覆盖以下入口：

- Pairing 页面左侧日历 `ADD BID` 保存的 `Pairing Number` specific-date bid。
- Search Pairings / Pairing Number occurrence dialog 保存的 specific-date bid。
- 其他最终调用同一 Pairing draft save/add 逻辑的入口。

校验口径：

- 仅检查 `propertyCode = 102`。
- 仅检查 specific-date 语义，也就是 bid value 带具体 origin date。
- 根据 bid value 中的 pairing number 和 origin date 查询 live occurrence。
- 读取当前 bid 的 `pbs_bid_day_off`。
- 如果 occurrence `[startDate, endDate]` touch same-`Tx` Off，则返回 `409`。

错误文案建议：

```text
Cannot add pairing because T1 has day off on 2026-04-05.
```

多冲突时压缩为：

```text
Cannot add pairing because 3 selected tier/date entries have days off.
```

## 前端设计

### Days Off 日历弹窗

Days Off 单日和星期表头批量添加使用同一套 blocked index：

```ts
Map<isoDate, Set<Tx>>
```

来源仍是 `/api/bidding-calendar/current` 的 `pairing_bid` events。构造时必须按 event 的 `[startDate, endDate]` 展开日期范围，而不是只看 event 起始日。

保存前：

- 单日：禁用被 pairing 覆盖的 `Tx`。
- 星期表头：批量应用时跳过被 pairing 覆盖的 `date + Tx`。
- `Clear` 仍只清空勾选，不自动保存。
- 如果跳过了冲突项，用 `message.warning` 提示，例如 `2 tier/date entries blocked by pairing bids.`

### 移除 Days Off inline error

左侧 `BIDDING CALENDAR` 面板不再渲染标题下方红色错误条。

保存失败或冲突时：

- 使用现有 `message.error(...)`。
- 必要时保留弹窗内部简短提示，但不要在面板标题下方常驻红色错误框。

### Pairing calendar popover

`PairingCalendarBidPopoverContent` 当前已负责 occurrence 多选、`Tx` 多选、search、Clear、ADD BID 状态。

新增输入：

```ts
blockedTiers: string[]
blockedMessage: string | null
```

或等价结构。

表现：

- 被 existing Off 挡住的 `Tx` checkbox disabled。
- 打开弹窗时默认 selected tiers 自动排除 blocked tiers。
- 如果用户切换 occurrence 后某些已选 `Tx` 变 blocked，则自动移除。
- `ADD BID` 在没有 selected occurrence 或没有可保存 `Tx` 时 disabled。
- 使用 `message.warning` 或弹窗内部轻提示说明，例如 `T1 blocked by day off.` 或 `2 tier/date entries blocked by days off.`

### 后端错误

即使前端已禁用，保存仍可能因为并发变化返回 409。

前端需要：

- 显示 `message.error(...)`。
- 不在左侧日历面板标题下方显示红色 inline error。
- invalidate `biddingCalendarQueryKey`、`pairingPageDataQueryKey`、`tierPageDataQueryKey`，让左侧日历与右侧 Existing Pairing Properties 回到服务端最新状态。

## 测试计划

后端：

- Specific Date pairing touch same-`Tx` Off 时拒绝保存。
- Specific Date pairing touch other-`Tx` Off 时允许保存。
- Entire Month 仍不在保存时被 Off 整条拒绝。

前端：

- Pairing 日历添加弹窗中，selected occurrence touch T1 Off 时禁用 T1。
- T2-T7 无 Off 时仍可保存。
- 所有 `Tx` 都被 Off 挡住时 `ADD BID` disabled。
- 后端返回冲突错误时显示 message，不在左侧日历面板常驻红色 inline error。
- Days Off 星期表头批量添加时，pairing 覆盖的 `date + Tx` 不写入。
- Days Off 保存失败不再出现左侧日历面板标题下方红色 inline error。

回归：

- Pairing 日历按日期搜索 occurrence 不变。
- Pairing Numbers 搜索框不受影响。
- Days Off 已完成的“已有 pairing 禁止加 Off”逻辑不回退。

## 验收标准

1. 有 `Off` 的同 `date + Tx` 不能再从 Pairing 页面加 specific-date pairing。
2. 多天 pairing 只要覆盖范围 touch Off，就会禁用对应 `Tx`。
3. 无冲突 `Tx` 仍可正常添加 pairing。
4. 后端保存路径也能阻止冲突数据。
5. Days Off 星期表头批量添加会跳过已有 pairing 的 `date + Tx`。
6. Days Off 保存失败只通过 `message` 反馈，不在左侧面板常驻红色错误条。
7. 不新增 schema / migration。
8. 定向测试、lint/build 或等价验证通过。
