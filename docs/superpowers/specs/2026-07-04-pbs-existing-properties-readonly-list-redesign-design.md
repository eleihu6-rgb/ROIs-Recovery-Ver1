# PBS Existing Properties 只读列表展示改造设计

## 背景

当前 PBS Portal 的 `EXISTING ... PROPERTIES` 区域用于展示用户已经添加到当前 bid draft 里的规则。业务上，同一个 property 可以出现多条记录，例如用户可以添加两条 `Prefer Off`：一条是日期范围，另一条是离散日期集合。

现在的问题不是“同名规则重复”，而是 UI 让这些已保存规则看起来像可直接输入的表单：

- `PROPERTY` 和 `BID` 都使用 input-like 外观，用户容易误以为可以直接编辑。
- `BID` 列宽过窄，长条件会被截断，而右侧仍有大量空白。
- delete / edit icon 夹在字段附近，没有清晰的操作区。
- 展示态、编辑态、操作态混在同一行，语义不清晰。

本设计只解决 Existing 区域展示态问题，不改变用户可以添加多条同名 property 的业务规则。

## 目标

- 把 Existing 区从“像表单的行”改成“已添加规则列表”。
- 完整展示每条规则的 bid summary，避免日期、范围、条件文本被截断。
- 明确区分只读展示态和编辑操作入口。
- 保留现有编辑、删除、tier toggle、Pairing pool count、Pairing preview 能力。
- 与刚完成的 `FAVORITED PROPERTIES` 卡片语义保持一致：展示态不伪装成 input。

## 非目标

- 不限制同一个 property 多次添加。
- 不改变 draft 保存 API、后端 schema、property catalog、favorite / top-used 逻辑。
- 不改变 `ADD ... PROPERTIES` 区域的已完成设计。
- 不重做右侧整个工作台布局。
- 不引入新的 UI 依赖。

## 现状组件范围

### 共享 Rule Bid 路径

影响 Days Off、Line、Reserve 等使用共享 rule-bid 组件的页面：

- `pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx`
  - `RuleBidExistingPropertyRow`
  - `RuleBidPropertyTableHeader`
- `pbs-portal/src/features/rule-bids/components/rule-bid-right-panel-sections.tsx`
  - `RuleBidExistingPropertiesSection`

当前 `RuleBidExistingPropertyRow` 的 property name 和 bid summary 都是 input-like 圆角框，并通过 `truncate` 截断长内容。

### Pairing 独立路径

影响 Pairing 页面：

- `pbs-portal/src/features/pairing/components/pairing-property-table.tsx`
  - `ExistingPairingPropertyRow`
  - `PairingPropertyTableHeader`
- `pbs-portal/src/features/pairing/components/pairing-right-panel-sections.tsx`

Pairing Existing 区还包含 preview icon 和 pool count，因此需要保留 `COUNT` 列。

## 方案对比

### 方案 A：只调列宽和去掉截断

做法：

- 保留现有表格结构。
- 扩大 `BID` 列。
- bid summary 允许换行。

优点：

- 改动小。
- 回归风险低。

缺点：

- `PROPERTY` / `BID` 仍然像 input，核心误导仍在。
- 操作 icon 仍然没有清晰 action 区。
- 视觉上还是“表单行”，不是“规则列表”。

### 方案 B：Existing 行改成只读列表卡片（推荐）

做法：

- 每条 existing property 改成独立列表卡片。
- `PROPERTY` 只显示文本，不再使用 input-like 框。
- `BID` 作为主要信息区，占据最大宽度，完整换行展示。
- `TIERS` 用 chip / compact toggle 区展示。
- `ACTIONS` 单独放在最右侧，包含 edit / delete / preview。
- Pairing 保留 `COUNT` 信息，放在 tiers 和 actions 之间或 actions 前。

优点：

- 语义最清楚：这是已添加规则，不是输入表单。
- 长 bid summary 可完整阅读。
- 多条同名 property 看起来是多条独立规则，不像重复输入框。
- 和 `FAVORITED` 卡片展示逻辑一致。

缺点：

- 涉及共享组件和 Pairing 组件，测试需要同步更新。
- 需要仔细保留 inline edit / dialog edit 的既有行为。

### 方案 C：保持表格，但增加展开详情

做法：

- 默认行仍是表格。
- 长 bid summary 显示一部分，点击展开完整详情。

优点：

- 行高度更稳定。

缺点：

- 用户仍然不能一眼看到完整条件。
- 增加展开交互，复杂度高于实际需要。
- 对用户当前反馈的“右侧空间没有用上”解决不直接。

## 推荐方案

采用方案 B：Existing 行改成只读列表卡片。

原因：

- 这正面解决用户反馈的核心问题：展示态不应该像 input。
- Existing 区是用户已添加规则的确认区，优先级应是“读得清楚”，不是压缩成表单行。
- 同名多条 property 是业务允许的，卡片化列表能自然表达“多条独立规则”。
- 实现可以局限在现有 row/header 组件，不需要后端和数据模型变更。

## 目标交互

### Existing 行展示态

每条记录显示为一张浅色列表卡片，结构为：

```text
PROPERTY        BID SUMMARY                                      TIERS       ACTIONS
Prefer Off      Between 2026-06-18 - 2026-06-21                  T1          edit delete
Prefer Off      2026-07-02, 2026-07-03, 2026-07-04 ...           T1          edit delete
```

具体规则：

- `PROPERTY`
  - 纯文本或轻量标签，不使用 input 框。
  - 长名称允许一行截断，但必须有 `title` 或可访问文本。
- `BID SUMMARY`
  - 使用只读文本块。
  - 占据主要宽度。
  - `white-space: normal`，允许换行。
  - 禁止 `truncate` 造成关键信息不可见。
- `TIERS`
  - 使用现有 `TierToggleGroup` 或更轻量的 chip 样式。
  - 如果仍允许直接 toggle tier，保持可点击状态。
  - mutation pending 时维持 disabled / readonly。
- `ACTIONS`
  - 单独靠右。
  - Rule Bid 行：delete + edit。
  - Pairing 行：delete + edit + preview。
  - icon 的 aria label 保持可测试、可访问。

### 编辑行为

不改变现有编辑入口：

- `existingBidEditMode="dialog"` 的页面仍点击 edit 打开配置 dialog。
- `showModifiers && isEditing` 的 inline editor 仍在当前行下方展开。
- 只是在未编辑状态下，bid summary 不再像 input。

### 删除行为

不改变删除逻辑：

- delete 仍直接调用现有 `onDelete(property.id)`。
- 是否需要二次确认不在本次范围；如果后续需要，应单独设计。

### Pairing 特殊项

Pairing Existing 行需要保留：

- preview icon。
- `COUNT` / pool count 展示。
- loading skeleton。
- `VIEW RULES` / `SEARCH PAIRINGS` 等上层行为不变。

建议 Pairing 行布局：

```text
PROPERTY | BID SUMMARY | TIERS | COUNT | ACTIONS
```

其中 `BID SUMMARY` 仍是最大列。

## 布局建议

### Rule Bid Existing 行

推荐 grid：

```text
minmax(180px, 240px) minmax(360px, 1fr) minmax(250px, auto) 80px
```

说明：

- `PROPERTY` 固定较窄，避免挤占 bid。
- `BID SUMMARY` 使用 `1fr` 吃掉空白。
- `TIERS` 按 T1-T7 的真实宽度保留。
- `ACTIONS` 固定窄列。

### Pairing Existing 行

推荐 grid：

```text
minmax(180px, 240px) minmax(360px, 1fr) minmax(250px, auto) minmax(150px, 170px) 96px
```

说明：

- Pairing 多一个 `COUNT`。
- actions 需要容纳 delete / edit / preview 三个 icon。

### 行高

- 单行 bid 时保持紧凑。
- 长 bid 自动增高，不出现横向滚动和文本截断。
- 卡片之间保持 `8px-10px` 间距。

## 表头设计

表头继续保留，帮助用户理解列含义，但需要同步增加 `ACTIONS`：

Rule Bid：

```text
PROPERTY | BID | TIERS | ACTIONS
```

Pairing：

```text
PROPERTY | BID | TIERS | COUNT | ACTIONS
```

表头不需要像强表格那样重边框，保持现有 `PanelStripHeader` 下方的轻量标签即可。

## 数据与 API

不需要后端改动。

使用现有字段：

- `property.name`
- `property.bid`
- `property.tiers`
- `property.id`
- Pairing 的 `poolCount`

展示文本继续复用现有 formatter：

- Rule Bid：`renderBidSummary?.(property)` 或 `PairingBidControl` 内部 formatter。
- Pairing：`formatPairingBidSummaryPrefix(property)` + `PairingBidControl` 现有 summary formatter。

如果当前 formatter 只能在 `PairingBidControl` 里输出，需要抽出只读 summary 组件或只读 formatter，避免为了展示文本继续渲染 input-like control。

## 测试要求

### 单元 / 组件测试

更新或新增：

- `pbs-portal/src/features/days-off/pages/days-off-page.test.tsx`
- `pbs-portal/src/features/line/pages/line-page.test.tsx`
- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`

覆盖点：

- Existing 区不再显示 input-like 的 `Bid for existing ...` 控件外观断言。
- 长 bid summary 能完整出现在 DOM 文本中。
- 同一个 property 两条 existing row 都可见，不被合并。
- delete / edit / preview aria label 仍可用。
- tier toggle 仍可点击或在 pending 时禁用。
- Pairing pool count / skeleton 仍正常。

### E2E

建议扩展现有 PBS Portal 条件页 E2E：

- 打开 Days Off。
- 添加或 mock 两条 `Prefer Off`。
- 确认两条都显示为独立 existing row。
- 确认第二条长日期摘要完整可见。
- 确认 edit / delete 可定位。

可放在：

- `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`

或新增：

- `e2e/tests/pbs-portal/existing-properties-readonly-list.spec.ts`

### UI 门禁

前端样式改动后必须运行：

- `npm run check:ui`
- `npm run lint` in `pbs-portal`
- `npm run build` in `pbs-portal`
- 相关 `vitest`
- 相关 Playwright E2E

## 验收标准

- `EXISTING DAYS OFF PROPERTIES` 中两条 `Prefer Off` 可以同时存在，且视觉上是两条独立规则。
- `BID` 内容完整可读，不因列宽过窄被截断。
- `PROPERTY` 和 `BID` 展示态不再像可输入 input。
- edit / delete / preview 进入单独 actions 区。
- Existing 区的功能行为不变：编辑、删除、tier toggle、Pairing preview/count 均保留。
- Days Off、Line、Pairing 至少覆盖自动化回归。
- UI standard gate 无 hard violations。

## 风险与注意事项

- `RuleBidExistingPropertyRow` 是共享组件，影响 Days Off、Line、Reserve；需要回归共享调用方。
- Pairing 有独立 row，不能只改 Rule Bid。
- 不能把 tier toggle 改成纯展示 chip，除非确认现有 Existing 区不再支持直接改 tier；本 spec 默认保留可 toggle。
- 不要修改后端数据结构来解决展示问题。
- 不要合并同名 property；重复显示是业务允许的。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是一个聚焦的 UI 展示态改造，主要集中在两个 row 组件和相关测试，拆分多 agent 容易产生样式和测试断言冲突。
- Suggested split: 不建议拆分；由一个 agent 完成 shared Rule Bid、Pairing、测试和 QA 文档同步。
- Write boundaries: 若必须拆分，可前端组件一个 agent、测试一个 agent，但二者会高频修改同一测试文件，冲突风险偏高。
- Conflict risk: Medium
- Execution gate: 先由用户确认本 spec，再进入实现。

## 实施建议顺序

1. 抽出只读 bid summary 展示组件，避免继续用 input-like control。
2. 改 `RuleBidExistingPropertyRow` 和 header。
3. 改 `ExistingPairingPropertyRow` 和 header。
4. 更新 Days Off / Line / Pairing 单测。
5. 更新或新增 Playwright E2E。
6. 跑 UI / lint / build / test 门禁。

