# PBS Search Pairings Search Criteria 展示重设计 Spec

## 背景

在 Pairing 主页面，我们已经把 `EXISTING PAIRING PROPERTIES` 的 `BID` 展示从 input-like 单行文本，改成更用户可读的只读摘要卡片：复杂条件可以换行、分组、折叠/展开，并且不会挤压右侧列。

但 `Search Pairings` 页面顶部的 `SEARCH CRITERIA` 仍然沿用旧展示：

- `PROPERTY` 看起来像输入框，但实际不是可输入字段。
- `BID` 把长条件塞进单行 readonly 控件，内容被截断。
- `Pairing Number` 多值条件无法完整表达，只能看到一段很长的字符串。
- edit 图标夹在 property 和 bid 中间，用户不容易判断它编辑的是哪一项。
- 同一条条件在 Pairing 主页面和 Search Pairings 页面展示语言不一致。

这会让用户误解当前条件是否可直接编辑，也看不清搜索结果到底由哪些条件筛出来。

## 目标

把 `Search Pairings > SEARCH CRITERIA` 改成“只读搜索条件摘要卡片”，和前面已优化的 Pairing existing bid summary 保持一致。

用户应该能一眼看懂：

- 当前搜索条件是什么 property。
- 当前 bid 条件具体内容是什么。
- 多值条件有多少项、前几项是什么、还能展开查看全部。
- 去哪里编辑这条 criteria。

## 非目标

- 不改变搜索条件的数据结构。
- 不改变搜索请求、preview 请求、分页、结果列表逻辑。
- 不改变 Pairing results card 的展示。
- 不新增新的 bid 类型语义。
- 不把 Search Criteria 改成可直接 inline 编辑；编辑仍走现有配置弹窗。

## 当前实现定位

相关文件：

- `pbs-portal/src/features/pairing/components/pairing-search-panel.tsx`
  - 渲染 `SEARCH CRITERIA` 区块。
  - 使用 `PairingSearchCriteriaRow` 渲染每一条 criteria。
- `pbs-portal/src/features/pairing/components/pairing-search-criteria-row.tsx`
  - 当前 row 使用 `PairingBidControl readOnly` 显示 bid。
  - 当前 property 名称使用 input-like 样式。
- `pbs-portal/src/features/pairing/components/pairing-search-panel.module.css`
  - 当前 `.criteriaTableHeader` / `.criteriaRow` / `.criteriaBid` 控制旧表格式布局。
- `pbs-portal/src/features/pairing/pairing-existing-bid-summary.ts`
  - 已有 `buildExistingPairingBidSummary()`，支持 Pairing Number 分组摘要。
- `pbs-portal/src/features/pairing/components/pairing-property-table.tsx`
  - 已有 `ExistingPairingBidSummaryView` 的展示模式，可以作为 Search Criteria 摘要设计参考。

## 推荐方案

### 方案 A：复用现有 Pairing bid summary 逻辑，重做 Search Criteria row

做法：

1. 新增一个 Search Criteria 专用的只读 summary view。
2. 通过现有 mapper，把 `PairingSearchCriteriaItem` 转成 summary builder 可接受的 property-like 数据。
3. `Pairing Number` 等复杂 bid 使用和 existing properties 相同的折叠/展开摘要。
4. `SEARCH CRITERIA` 不再使用 input-like `PairingBidControl readOnly` 展示。
5. edit / remove / favorite / add 这些动作统一放到 criteria card 右侧或右上角。

优点：

- 用户在 Pairing 主页面和 Search Pairings 页面看到的 bid 语言一致。
- 不重复发明 Pairing Number 多值展示规则。
- 可以最小化业务逻辑改动。

缺点：

- 需要抽出或复用当前 `ExistingPairingBidSummaryView`，避免组件只绑定 existing property 类型。

推荐采用该方案。

### 方案 B：只把当前 BID input 改成多行文本

做法：

- 保留当前表格结构。
- 把 `PairingBidControl readOnly` 改成 textarea-like 或普通 div，允许换行。

优点：

- 改动小。

缺点：

- 仍然只是展示一串长文本。
- `Pairing Number` 多值条件仍然不可读。
- 和 existing properties 的摘要体验不一致。

不推荐。

### 方案 C：Search Criteria 做成完整 rule expression

做法：

- 不显示 property/bid 卡片，改为类似 `T1: Pairing Number is ... AND ...` 的规则表达式。

优点：

- 更接近算法规则表达。

缺点：

- 对普通用户不够直观。
- 当前只是在搜索页面确认筛选条件，不需要把规则表达式复杂化。

不推荐。

## 交互设计

### Search Criteria 区块

`SEARCH CRITERIA` 下方仍保留表头，但建议弱化为卡片式布局：

- `PROPERTY`
- `BID`
- `ACTIONS`

如果当前模式需要 tiers，再保留：

- `TIERS`

不再显示 input-like property / bid。

### 单条 criteria card

建议结构：

```text
┌────────────────────────────────────────────────────────────┐
│ Pairing Number                         [Edit] [Remove]     │
│ Award · Pairing Number · 25 selected                       │
│ E4101  Jun 05                                              │
│ E4103  Jun 05, Jun 08, Jun 10, +2 more                     │
│ E4106  Jun 02, Jun 04, Jun 06, +4 more                     │
│ +9 more pairings                         Show all selected │
└────────────────────────────────────────────────────────────┘
```

普通条件：

```text
┌────────────────────────────────────────────────────────────┐
│ Any Landing In Airport                 [Edit] [Remove]     │
│ Award · Any · EWR                                          │
└────────────────────────────────────────────────────────────┘
```

如果展示 tiers：

```text
┌────────────────────────────────────────────────────────────┐
│ Pairing Total Credit                   [Edit] [Remove]     │
│ Award · 08:00                                              │
│ Tiers: T1 T3                                               │
└────────────────────────────────────────────────────────────┘
```

### Edit 行为

- edit 图标保留现有行为：打开配置弹窗。
- icon 不再放在 property 和 bid 中间，避免歧义。
- aria label 保持 `Edit search criteria ${item.name}`。

### Favorite / Add / Remove 行为

不同入口当前复用 `PairingSearchCriteriaRow`：

- 当前 rules preview 中可能只有 edit / remove。
- criteria picker 中可能有 add / favorite。

改造时不能破坏这些入口。

要求：

- 有 `onAdd` 时，动作显示为 `Add` 图标或按钮。
- 有 `onFavoriteToggle` 时，显示 favorite 状态。
- 有 `onEditToggle` 时，显示 edit。
- 有 `onRemove` 时，显示 remove。
- 不要让动作按钮挤压 bid summary。

## 数据与组件设计

### 新增或调整组件

建议新增：

- `PairingBidSummaryCard`
  - 负责只读展示 Pairing bid summary。
  - 输入可以是：
    - `PairingExistingProperty`
    - `PairingSearchCriteriaItem`
    - 或一个抽象后的 `PairingBidSummarySource`

也可以先做更小改动：

- 将 `ExistingPairingBidSummaryView` 从 `pairing-property-table.tsx` 抽到独立文件。
- 让它接收 summary builder 输出，而不是直接接收 existing property。

推荐后者，避免重复实现折叠/展开逻辑。

### Summary builder

当前 `buildExistingPairingBidSummary(property)` 已经能处理：

- text summary
- grouped `Pairing Number` summary
- collapsed / expanded groups

Search Criteria 应复用这个规则。实现方式：

1. 新增 mapper：
   - `buildPairingSummarySourceFromSearchCriteria(item)`
2. 或复用已有：
   - `buildPairingExistingPropertyFromSearchCriteria(item, index)`

注意：

- mapper 只用于展示，不应改变原始 criteria 数据。
- 不应把展示 mapper 结果写回 state。

## 样式设计

### 替换 input-like 样式

废弃或弱化以下 Search Criteria 展示样式：

- `.criteriaName` 的 input border / height 伪输入框视觉。
- `.criteriaBid` 里 `PairingBidControl readOnly` 的单行控件视觉。

改为：

- property 使用纯文本标题，字重高一点。
- bid 使用浅底色 summary card。
- 长内容允许换行。
- 多值内容使用分组行。

### 布局建议

无 tiers 模式：

```css
grid-template-columns: minmax(180px, 260px) minmax(0, 1fr) minmax(96px, auto);
```

有 tiers 模式：

```css
grid-template-columns: minmax(160px, 230px) minmax(0, 1fr) 240px minmax(96px, auto);
```

原则：

- `BID` 列是主要信息区，应拿到剩余宽度。
- `ACTIONS` 独立列，不能夹在 property 和 bid 中间。
- 不允许横向截断 bid summary。
- Search Criteria 区域不需要像结果列表一样铺满很高的视觉重量，保持轻量。

## 测试方案

### 单元 / 组件测试

更新：

- `pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx`
- `pbs-portal/src/features/pairing/pairing-existing-bid-summary.test.ts`
- 必要时新增 summary view 测试。

覆盖：

1. `SEARCH CRITERIA` 不再渲染 input-like bid control。
2. `Pairing Number` criteria 显示：
   - `Award · Pairing Number · N selected`
   - 前几组 pairing number。
   - `+ more`。
   - `Show all selected` / `Show less`。
3. edit 按钮仍能打开配置弹窗。
4. remove / add / favorite 行为不变。
5. 有 tiers 模式下 tiers 不被 bid 挤压。

### Playwright E2E

更新或新增 PBS Portal E2E：

- `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`
- 或新增 Search Pairings 专项 spec。

覆盖：

1. 从 Pairing 页面进入 Search Pairings。
2. `SEARCH CRITERIA` 中 `Pairing Number` summary 可读，不显示被截断长 input。
3. 点击 `Show all selected` 后能看到隐藏 pairing。
4. 点击 edit 后配置弹窗打开。
5. 结果列表仍正常展示、分页仍正常。

### UI gate

前端样式改动后必须运行：

- `npm run check:ui`
- `pnpm lint`
- `pnpm build`
- 相关 Vitest
- 相关 Playwright

## 验收标准

- `Search Pairings > SEARCH CRITERIA` 中不再出现 input-like `BID` 单行截断。
- `Pairing Number` 多值条件使用用户可读的 grouped summary。
- edit/remove/favorite/add 动作入口清晰，不夹在 property 和 bid 中间。
- Search Criteria 展示语言和 Pairing existing properties 保持一致。
- 不改变搜索结果和请求逻辑。
- 自动化测试覆盖 Search Criteria summary 和 edit 行为。
- QA 人工测试文档覆盖该页面展示。

## 风险与控制

- 风险：复用 existing summary 时类型耦合过深。
  - 控制：抽出纯展示组件或用 mapper，不让 Search Criteria 依赖 existing state。
- 风险：criteria picker 也复用同一个 row，误伤 add/favorite 模式。
  - 控制：实现前列清楚 `PairingSearchCriteriaRow` 的所有调用场景，测试 add/favorite/edit/remove。
- 风险：summary 变高后压缩 results 区域。
  - 控制：criteria 数量通常较少，允许自然增高；如果多条 criteria，criteria 区域可限制最大高度并内部滚动，但第一版不主动加滚动，避免过度设计。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是一个集中在 Pairing Search Criteria 展示组件的小范围 UI 改造，主要文件和测试高度耦合，多 agent 并行会增加冲突。
- Suggested split: 不拆分。主 agent 顺序完成组件抽取、样式、测试、QA 文档。
- Write boundaries: `pbs-portal/src/features/pairing/**`、`e2e/tests/pbs-portal/**`、`docs/test-cases/pbs/pairing/**`、版本文件。
- Conflict risk: Medium。当前工作区已有其他窗口的 Award 未提交改动，实施时必须只 stage 本任务文件。
- Execution gate: 用户确认本 spec 后再实现。

## 待确认

我建议按方案 A 实现：复用现有 Pairing bid summary 逻辑，重做 `SEARCH CRITERIA` 为只读摘要卡片。

请确认这个 spec；确认后我再开始实现。
