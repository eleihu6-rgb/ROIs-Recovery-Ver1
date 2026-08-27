# PBS Pairing Number 运行日选择与日历显示设计

日期：2026-05-01
作者：Codex
状态：已确认，已实施第一阶段

## 背景

当前 Pairing 页面已经支持 `Pairing Number / Pairing ID` 作为一个 pairing 条件保存到指定 `Tx`，并且左侧 `BIDDING CALENDAR` 已经有读取 specific pairing bid 并显示蓝色 pairing event 的基础链路。

但 AA 文档中 `Pairing ID` 有两个不同动作：

- `Pairing ID for the Entire Month`：选择这个 pairing number 在当前 bid period 内所有运行日。
- `Pairing ID on a Specific Date`：只选择这个 pairing number 在某一个运行日的 occurrence。

目前系统更接近第一种，但数据语义还不够明确；如果同一个 pairing number 在当前 RP 内运行多次，后续必须确保左侧日历显示全部 occurrence，而不是只显示某一条代表记录。

## 目标

1. 用户添加 `Pairing Number` 时，可以选择 `Entire Month` 或 `Specific Date`。
2. 如果选择 `Entire Month`，保存后左侧日历显示该 pairing number 在当前 RP 内全部运行 occurrence。
3. 如果选择 `Specific Date`，保存后左侧日历只显示用户选中的那一次 occurrence。
4. 运行日期必须由后端从 live `pairing / pairing_segment` 查询，前端不猜日期。
5. 保持当前 Pairing 页面代码风格：复用现有 search criteria、draft mutation、calendar query invalidation，不新增大而散的状态。

## 不做范围

- 不做 Days Off 过滤 Pairing Pool。
- 不做 `Specific Date` override day off 的完整冲突逻辑。
- 不做 planned absence 橙色不可点。
- 不做左侧日历上点击 pairing 后编辑/删除。
- 不做 Tier 页面全局累计语义。
- 不做最终 Award / DO 计算。

## AA 语义口径

`Pairing Number` 不是单一固定航班，而是一个 pairing 编号。这个编号在一个 RP 内可能运行多次。

例如 `M4959` 在当前 RP 内运行 4 次：

- 2026-03-03
- 2026-03-10
- 2026-03-17
- 2026-03-24

选择 `Entire Month` 表示 4 次都加入 bid。

选择 `Specific Date` 表示只加入其中某一次，例如只加入 2026-03-17 这一趟。

## 用户操作流

### 从 Search Pairings 添加

1. 用户进入 `Search Pairings`。
2. 添加或编辑 `Pairing Number` criteria，例如 `M4959`。
3. 用户点击 `BID THESE PROPERTIES`。
4. 如果 criteria 中包含 `Pairing Number`，打开 pairing occurrence 选择弹窗。
5. 弹窗先展示 pairing number 的选择模式：
   - `Entire Month`
   - `Specific Date`
6. 如果选 `Specific Date`，弹窗展示该 pairing number 在当前 RP 内所有运行日期。
7. 用户选择日期和 `Tx`。
8. 点击 `ADD BID`。
9. 系统保存并刷新 Pairing draft、Tier summary、左侧 `BIDDING CALENDAR`。

### 从 Pairing 页面加号添加

如果用户直接在 `ADD PAIRING PROPERTIES` 中添加 `Pairing Number`，当实际保存到 `Tx` 时也使用同一套 occurrence 选择弹窗。

第一阶段可以优先覆盖 `Search Pairings -> BID THESE PROPERTIES`，再复用到主页面加号入口。

## 数据设计

继续使用 `pbs_bid_group` 保存 Pairing bid，不新增主表。

第一阶段建议通过现有 `param` 字段表达 occurrence 语义：

- `Entire Month`
  - `property_code = 102`
  - `param_a = pairing number`
  - `param_b = null`
  - `param_c = null`
- `Specific Date`
  - `property_code = 102`
  - `param_a = pairing number`
  - `param_b = selected origin date`
  - `param_c = "specific_date"` 或等价稳定标记

实现前需要核对当前 `RuleBidValue` 序列化是否适合承载 `Specific Date`。如果现有 `tag-list` 不适合，优先在 Pairing 专用 mapper 中封装，不把特殊字符串逻辑散落在组件里。

## API 设计

新增轻量查询能力：

```text
GET /api/pairing-search/pairing-occurrences?pairingNumber=M4959&periodCode=Mar%202026
```

响应：

```ts
type PbsPairingOccurrence = {
  occurrenceId: string;
  pairingNumber: string;
  pairingId: string;
  originDate: string;
  startDate: string;
  endDate: string;
  label: string;
};

type PbsPairingOccurrencesResponse = {
  pairingNumber: string;
  periodCode: string;
  occurrences: PbsPairingOccurrence[];
};
```

说明：

- `originDate` 用于用户选择某一次运行。
- `startDate/endDate` 用于左侧日历展示该 occurrence 覆盖范围。
- 后端必须按当前 RP 限制日期范围。
- 同一个 pairing number 有多个 live `pairing` 行时，必须全部返回。

## 后端设计

1. 在 `pairing-search` service 中新增 occurrence query helper。
2. 按 `pairing_label` 或 `id::text` 匹配 pairing number。
3. 使用 `pairing_segment` 聚合每个 occurrence 的 start/end 日期。
4. 按 `periodCode` 过滤当前 bid period 内 origin date。
5. 返回轻量字段，不返回完整 legs。
6. 综合日历 `bidding-calendar-service` 需要识别：
   - Entire Month：展开该 pairing number 的全部 occurrence。
   - Specific Date：只展开选中 origin date 的 occurrence。

性能要求：

- occurrence 查询必须带 `periodCode` 和 pairing number，不允许扫全表。
- 多个 pairing number 时后续可批量查询；第一阶段至少保证单个查询轻量。
- 综合日历加载时避免 N+1，按当前 bid 中所有 pairing number 批量查 occurrence。

## 前端设计

新增一个小型选择弹窗，命名可接近：

- `PairingOccurrenceBidDialog`

弹窗职责：

- 接收 pairing number、periodCode、默认 `Tx`。
- 拉取 occurrence 列表。
- 选择 `Entire Month` 或 `Specific Date`。
- Specific Date 模式下选择一个 occurrence。
- 选择 `Tx`。
- 确认后返回可保存的 Pairing bid payload。

复用现有能力：

- `pairingService.addCurrentDraftProperty`
- `buildPairingSearchTierOptionsForLabel`
- `invalidatePairingCalendarQueries`
- Pairing draft cache patch 逻辑

不建议把 occurrence 查询和弹窗状态写进全局 store。

## 日历显示

左侧 `BIDDING CALENDAR` 继续显示蓝色 `pairing_bid` event。

显示规则：

- Entire Month：同一 pairing number 在当前 RP 内每个 occurrence 都显示。
- Specific Date：只显示 selected origin date 对应 occurrence。
- event metadata 保留：
  - `propertyGroupKey`
  - `pairingNumber`
  - `pairingId`
  - `originDate`
  - `occurrenceMode`

第一阶段日历 event 仍为 readonly。

## 测试计划

后端：

- occurrence route 返回某 pairing number 的全部运行日期。
- periodCode 过滤生效。
- 同 pairing label 多个 occurrence 不丢失。
- bidding calendar 对 Entire Month 展开全部 occurrence。
- bidding calendar 对 Specific Date 只展开选中 occurrence。

前端：

- 点击 `BID THESE PROPERTIES` 且包含 `Pairing Number` 时打开 occurrence dialog。
- `Entire Month` 保存后调用 add draft property，并刷新左侧日历 query。
- `Specific Date` 必须先选择日期才能保存。
- 保存成功后关闭弹窗并显示成功提示。
- 普通非 `Pairing Number` criteria 仍走原来的 `BID THESE PROPERTIES` 流程。

回归：

- Pairing ID autocomplete 不受影响。
- current rules preview 不显示 `BID THESE PROPERTIES`。
- 其他 pairing property 添加逻辑不受影响。

## 验收标准

1. 用户能对 `Pairing Number` 选择 `Entire Month` 或 `Specific Date`。
2. `Entire Month` 会让左侧日历显示该 pairing number 当前 RP 内全部 occurrence。
3. `Specific Date` 只显示选中的 occurrence。
4. 同一个 pairing number 有多次运行时不会只显示最后一条或第一条。
5. 非 `Pairing Number` 的 `BID THESE PROPERTIES` 行为保持不变。
6. `npm run verify:pbs` 通过。
