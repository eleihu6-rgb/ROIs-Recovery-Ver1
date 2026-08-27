# PBS Pairing 日历蓝条 AA 详情展示与编辑闭环设计

日期：2026-05-07  
作者：Codex + lei  
状态：已确认，实施中

## 背景

当前 `/pairing` 左侧 `BIDDING CALENDAR` 的蓝色 pairing bid 已支持点击打开详情，并可编辑该 bid 覆盖的 `Tx`。但详情内容仍偏摘要，只展示 `Pairing Number / Tier / Internal ID / Origin Date / Date Range / Mode` 等字段。

用户确认新的目标是按 AA 文档口径展示 pairing 详情：点击蓝条后，详情内容应保持 `/pairing/search` 结果卡片的展示方式，而不是另做一个简化信息表。

## AA 文档口径

AA 文档中 `Search Pairings` 的 pairing 结果包含：

- 每条 pairing 旁显示 mini calendar，用于展示该 pairing 在 bid month 内的运行日期。
- Pairing details 展示 `BASE / REPORT`。
- 航段表展示 `DAY / DH / FLTN / DPS / ARS / DEP / ARR / BLKT / GRNT / EQP`。
- duty 或 pairing summary 展示 `TBLK / TCRD / TPAY` 等累计信息。
- `Pairing ID on a Specific Date` 通过点击 mini calendar 的运行日期添加 bid。
- 已添加到月历上的 pairing 可再次点击，用于查看详情、编辑 Tier/Tx 或删除。

本项目术语继续使用 `Tier / Tx`，不把 AA 原文 `Layer` 带回代码或 UI。

## 目标

1. 点击日历蓝色 pairing bid 后，在弹窗内展示与 `/pairing/search` 一致的 pairing detail card。
2. 详情卡展示字段保持现有 Search Pairings 结果风格：
   - `BASE`
   - `REPORT`
   - `PRIORITY` / sequence（沿用当前 Search Pairings 展示）
   - legs 表：`DAY / DH / FLTN / DPS / ARS / DEP / ARR / BLKT / GRNT / EQP`
   - totals：`TBLK / TCRD / TPAY`
   - mini calendar
3. 弹窗仍保留当前编辑闭环：
   - 可编辑该 bid 覆盖的 `Tx`
   - `Clear` 后保存等价删除
   - 保存成功后刷新 Pairing draft、Tier summary、Bidding Calendar
4. 合并蓝条点击后，能展示全部 pairing numbers 对应的详情卡。
5. 不改数据库结构，不新增依赖。
6. `Pairing Number / Pairing ID` 继续使用 `propertyCode=102`。

## 非目标

- 不重新设计 `/pairing/search` 页面。
- 不改变 Search Pairings 结果卡片字段语义。
- 不把 `propertyCode=128` 当作 Pairing ID。
- 不做 planned absence 橙色不可点的新增逻辑。
- 不做 Days Off 与 specific-date pairing override 规则重构。
- 不引入新的完整 pairing 主数据表。

## 推荐方案

采用“抽出并复用 Search Pairings 详情卡 + 日历弹窗按 pairing metadata 查询详情”的方案。

### 方案 A：抽出共享 Pairing Detail Card（推荐）

从 `PairingSearchPanel` 中抽出可复用的 detail card / mini calendar 展示组件，例如：

- `PairingDetailCard`
- `PairingMiniCalendar`

`/pairing/search` 继续使用该组件渲染结果，日历蓝条弹窗也使用同一组件渲染详情。

优点：

- 两处 UI 完全一致，符合用户“保持 pairing search 里面这种展示”的要求。
- 后续 AA 字段补齐时只改一处。
- 避免在 dashboard 弹窗里复制一份 legs table。

缺点：

- 需要轻微调整 `PairingSearchPanel` 的本地组件边界。

### 方案 B：日历弹窗单独实现同款 table

在 `pairing-calendar-bid-detail-dialog.tsx` 中重新写一套相似 UI。

优点：

- 初始改动集中在日历弹窗。

缺点：

- 两处 UI 后续容易漂移。
- Search Pairings 补字段时需要同步改两处。

### 方案 C：只增强摘要字段，不展示 legs

只在现有 detail rows 中补 `BASE / REPORT / TBLK / TCRD / TPAY`。

优点：

- 改动最小。

缺点：

- 不符合 AA 文档，也不符合用户给出的 Search Pairings 展示截图。

结论：采用方案 A。

## 数据获取设计

当前日历 event metadata 已包含：

- `pairingNumber` / `pairingNumbers`
- `pairingId` / `pairingIds`
- `originDate`
- `pairingDateRanges`
- `pairingBidEntries`
- `propertyGroupKey` / `propertyGroupKeys`
- `occurrenceMode`

日历弹窗打开后，根据这些 metadata 拉取 pairing detail：

1. 对每个 `pairingNumber + originDate` 组合构造临时 criteria：
   - `propertyCode=102`
   - `name="Pairing Number"`
   - `action="award"`
   - `bid.type="tag-list-date"`
   - `bid.values=[pairingNumber]`
   - `bid.date=originDate`
2. 复用现有 `/api/pairing-search/preview` 的 `mode: "criteria"` 查询。
3. 使用 response 中的 `results` 渲染弹窗内的紧凑 pairing detail。
4. 如果 metadata 缺少 `originDate`，退化为 `tag-list` 查询，并优先用 `pairingId` 匹配结果。
5. 如果一个蓝条合并了多个 pairing numbers，则按 pairing number / origin date 去重后并行或顺序加载详情，最终在同一弹窗内展示多张 detail card。
6. `propertyCode=102` 的 `tag-list-date` 查询日期要和日历蓝条 occurrence metadata 保持一致：使用 pairing segment 的 `brief_start_utc / sch_str_dt_utc` 起始日期，而不是只用 `pairing.sch_str_dt_utc`，避免蓝条已存在但详情反查为空。
7. 合并蓝条需要通过 `pairingBidEntries` 保留每个摘要行对应的 `propertyGroupKey`，用于明确本次 Tx 编辑目标。

说明：

- Search preview 已能返回 legs、totals、activeDates，足够支撑当前 AA 展示。
- 不新增后端 detail API；仅修正现有 preview 对 specific-date pairing 的日期匹配口径。

## UI 设计

弹窗结构调整为：

1. 顶部 bid 摘要：
   - 标题：`Pairing Bid`
   - 主标题：单个 pairing 显示编号；多个 pairing 显示 `C4101 +N`
   - 摘要区使用 CSS grid 做成“类似表格”的横向对齐，不使用真实 `<table>`。
   - 不出现横向滚动条；列宽压缩、文本必要时截断。
   - 表头使用简称：`PAIRING / ID / TX / ORIG / START / END / MODE`。
   - 只有合并自多个底层 pairing bid 时，`MODE` 右侧额外显示一列 `EDIT` 单选勾；普通蓝条不显示该列。
   - 多个 pairing 或一个 pairing 多个 date range 时，每个 `pairing + start/end date` 单独占一行。
   - 日期以 `yyyyMMdd` 紧凑格式显示，例如 `20260408`。
2. Pairing detail 区：
   - 在弹窗内优先展示 AA legs 明细字段，布局参考 Search Pairings 的数据口径，但采用更紧凑的 grid，不使用横向滚动条。
   - 每个 pairing detail 块展示 `BASE / REPORT / TBLK / TCRD / TPAY` 和 legs：`DAY / DH / FLTN / DPS / ARS / DEP / ARR / BLKT / GRNT / EQP`。
   - 多个 pairing 时纵向展示多个 detail 块。
   - loading 时显示与弹窗尺寸一致的 lightweight loading。
   - 查询失败时保留摘要与 Tx 编辑区，并显示错误提示。
3. `Apply to Tx` 编辑区：
   - 保持 `T1-T7` checkbox。
   - 保持 `Clear`。
   - 保持 `Close / SAVE BID`。

## 编辑闭环

### 单一 property blue bar

当蓝条 metadata 只对应一个 `propertyGroupKey`：

- 默认勾选该 property 当前覆盖的 `Tx`。
- 保存时调用现有 `patchCurrentDraftProperty`。
- 如果 selected `Tx` 为空，按当前语义删除该 bid。
- 成功后关闭弹窗并刷新：
  - `pairingPageDataQueryKey`
  - `biddingCalendarQueryKey`
  - `tierPageDataQueryKey`

### 合并 blue bar

当蓝条由多个 `propertyGroupKeys` 合并而来：

- 本轮必须展示全部 pairing detail cards。
- 顶部摘要每行在 `MODE` 右侧显示一个单选勾，用于选择本次要编辑的底层 pairing bid。
- 未选择前禁用 `Apply to Tiers` 和 `SAVE BID`，并提示 `Select one pairing bid to edit Tx.`
- 选择某一行后，`Apply to Tiers` 载入该行对应 `propertyGroupKey` 的当前 Tx。
- 保存只 patch 被选中的 `propertyGroupKey`，不会批量修改同一个蓝条里的其他 bid。
- 如果多个摘要行来自同一个 `propertyGroupKey`，选择其中任意一行都编辑同一个底层 bid；这是因为该 property 本身包含多个 pairing values。

## 错误处理

- detail 查询失败：弹窗仍打开，摘要和 Tx 编辑保留，detail 区显示 `Unable to load pairing details.`
- 找不到 `propertyGroupKey`：禁用 `SAVE BID`，显示当前已有的 not found 提示。
- 合并蓝条未选择编辑目标：禁用 `SAVE BID`，显示 `Select one pairing bid to edit Tx.`
- 保存失败：弹窗不关闭，显示错误并允许重试。
- 并发冲突：沿用现有 draftVersion 409 处理，提示刷新后重试。

## 测试计划

### 前端

新增或扩展：

- `pairing-search-panel` / 新抽出的 `PairingDetailCard` 测试：
  - 能渲染 `BASE / REPORT / legs / totals / mini calendar`。
- `dashboard-schedule-panel` 相关测试：
  - 点击单个蓝条后加载并展示 Search Pairings 风格详情。
  - `Pairing Number + originDate` 使用 `propertyCode=102` 查询。
  - 多 pairing 合并蓝条展示多张详情卡。
  - 单 property 蓝条仍可编辑 Tx 并保存。
  - 多 property 合并蓝条只在摘要右侧显示选择列，未选择前禁用 Tx 编辑。
  - 选择合并蓝条中的一行后，只保存该行对应的 `propertyGroupKey`。

### 后端

本轮优先复用现有 preview API，不新增后端测试。若实现中需要补 helper，应补对应 service 测试。

### 验证命令

```bash
cd pbs-portal
npm test -- src/features/dashboard src/features/pairing
npm run lint
npm run build

cd ..
npm run verify:pbs
```

## 验收标准

1. 点击蓝色 pairing bid 后，弹窗展示 Search Pairings 数据口径的 pairing details。
2. 详情内容包含 `BASE / REPORT / legs / totals`，legs 字段为 `DAY / DH / FLTN / DPS / ARS / DEP / ARR / BLKT / GRNT / EQP`。
3. 顶部摘要区为 grid 伪表格，日期显示为 `yyyyMMdd`，并拆出 `START / END`，不出现横向滚动条。
4. 单个蓝条可继续编辑 Tx，清空 Tx 保存等价删除。
5. 合并蓝条能展示全部 pairing 的详情。
6. 合并自多个 property 的蓝条必须先选择一行才能编辑 Tx，保存时只改被选中行对应的底层 bid。
7. Search Pairings 页面原展示不回退。
8. 不改数据库结构、不新增依赖、不误用 `propertyCode=128`。
