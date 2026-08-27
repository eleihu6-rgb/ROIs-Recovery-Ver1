# PBS Search Pairings 条件展示卡片化对齐设计

## 背景

`Pairing` 页面里点击 `SEARCH PAIRINGS` 后，如果是“带搜索条件看 pairing”，页面会进入 `Search Pairings` 的 criteria preview 模式。

当前这个模式下，`SEARCH CRITERIA` 仍然展示成老式表格：

```text
PROPERTY | BID | ACTIONS
Any Landing In Airport | Award · Any · EWR | edit
```

这和我们最近对 PBS Portal 做的几类展示改造不一致：

- `EXISTING ... PROPERTIES` 已经从 input-like 表格改成只读规则卡片。
- `FAVORITED / ALL PROPERTIES` 已经弱化输入框感，强调可读条件。
- `Pairing Number` 长条件已经改成分组摘要，避免把机器可读长串直接丢给用户。
- `Search Results` 里的 pairing 卡片也已经按用户可读摘要展示。

所以用户指出的问题成立：`Search Pairings` 页面里的普通 `SEARCH CRITERIA` 分支漏掉了这轮视觉和信息架构对齐。

## 当前代码观察

当前 `Search Pairings` 页面有两套 criteria 展示路径：

1. `currentRulesPreview` 路径：
   - `pbs-portal/src/features/pairing/components/pairing-search-panel.tsx`
   - 已经通过 `PairingSearchRuleExpression` + `PairingRuleConditionSummary` 展示 readable rule condition。

2. 普通 criteria preview 路径：
   - `pbs-portal/src/features/pairing/components/pairing-search-panel.tsx`
   - `pbs-portal/src/features/pairing/components/pairing-search-criteria-row.tsx`
   - 仍然渲染 `criteriaTableHeader` 和 `PairingSearchCriteriaRow`。
   - `PairingSearchCriteriaRow` 内部还是 `PROPERTY / BID / TIERS / ACTIONS` grid。
   - `BID` 使用 `PairingBidSummaryView`，数据内容部分可读，但外层仍像表格和输入框。

这导致页面观感割裂：同一个用户在主页面看到的是卡片化条件，点进 Search Pairings 后又退回表格。

## 目标

把 `Search Pairings` 页面普通 criteria preview 的 `SEARCH CRITERIA` 区域改成和当前 PBS Portal 规则卡片一致的只读条件卡。

用户应该看到的是：

```text
SEARCH CRITERIA

Any Landing In Airport                       [edit]
Award · Any · EWR
```

而不是：

```text
PROPERTY          BID                         ACTIONS
Any Landing...    [input-like bid box]         [edit]
```

## 范围

### 需要覆盖

- `Search Pairings` 页面普通 criteria preview。
- 从主页面单个 property 的 preview / view 进入 Search Pairings。
- 从 `ADD PAIRING PROPERTIES` 加入条件后进入 Search Pairings。
- `Pairing Number` criteria：
  - 继续使用已有 grouped readable summary。
  - 不回退到长文本。
- 普通 property criteria，例如：
  - `Any Landing In Airport`
  - `Prefer Pairing Type`
  - 其他 short bid value property
- action 区：
  - `Edit`
  - `Remove`
  - `Add`
  - `Favorite / Unfavorite`
  - 根据调用方能力保持原有按钮可用性。

### 不做

- 不改后端接口。
- 不改查询条件语义。
- 不改 `previewCriteria` / `previewCurrentRules` 请求体。
- 不改 pairings 搜索结果列表。
- 不改 Pairing Number 配置弹窗。
- 不新增筛选能力。
- 不把 current rules preview 再重做一遍；它已经走 `PairingRuleConditionSummary`，这里只保证视觉一致。

## 方案选择

### 方案 A：只调宽 BID 列

做法：保留表格，把 `BID` 列拉宽，避免文本截断。

优点：
- 改动最小。

缺点：
- 仍然是老表格结构。
- 仍然保留 `PROPERTY / BID / ACTIONS` 的机械感。
- 和前面已确认的“规则卡片化、只读条件表达”方向不一致。

结论：不推荐。

### 方案 B：仅隐藏表头

做法：移除 `PROPERTY / BID / ACTIONS` 表头，但保留 `PairingSearchCriteriaRow` 的 grid 结构。

优点：
- 比方案 A 更清爽。
- 改动较小。

缺点：
- 行内仍是旧 grid，BID 仍像输入框。
- action、tiers、bid 的布局仍然按表格列约束，复杂条件容易别扭。
- 后续还会出现“别处是卡片，这里像表格”的割裂。

结论：可以短期缓解，但不够彻底。

### 方案 C：普通 criteria preview 改为只读条件卡

做法：
- 移除普通 criteria preview 的 `criteriaTableHeader`。
- 将 `PairingSearchCriteriaRow` 改成 card layout，或新增 `PairingSearchCriteriaCard`。
- 卡片内部按用户理解顺序展示：
  1. property 名称。
  2. action buttons 放右上角。
  3. bid summary 作为只读内容块。
  4. 需要时展示 tiers chips。
- `Pairing Number` 继续复用 `PairingBidSummaryView` 的 grouped summary。
- 普通 property 使用 compact readable summary，不再做 input-like 外观。

优点：
- 和 `EXISTING ... PROPERTIES`、`FAVORITED / ALL PROPERTIES`、`Search Results` 的设计方向一致。
- 用户看到的是“我正在用哪些条件搜索”，不是“我在编辑一张表”。
- 对长条件和短条件都更稳。
- 不动数据和请求，只改展示层。

缺点：
- 需要小范围调整组件和 CSS。
- 需要更新相关 UI 测试快照/断言。

结论：推荐采用。

## 推荐设计

### 1. 页面结构

`Search Pairings` 普通 criteria preview 中：

- 保留 `SEARCH CRITERIA` strip header。
- 移除 `PROPERTY / BID / ACTIONS` 表头。
- criteria 列表直接展示 condition card。

空态继续保留：

```text
No search criteria selected.
```

或 all pairings preview 的：

```text
Showing all pairings available for this bid period.
```

### 2. 条件卡布局

推荐卡片结构：

```text
┌──────────────────────────────────────────────────────────────┐
│ Any Landing In Airport                              [edit]   │
│ Award · Any · EWR                                           │
└──────────────────────────────────────────────────────────────┘
```

如果有 tiers：

```text
┌──────────────────────────────────────────────────────────────┐
│ Pairing Number                    [add] [favorite] [edit]    │
│ Award · Pairing Number · 6 selected                          │
│ E4101  Jun 05                                                │
│ E4103  Jun 05, Jun 08, Jun 10 +1                              │
│ T1 T2                                                        │
└──────────────────────────────────────────────────────────────┘
```

布局要求：

- property 名称是主标题，不再放进窄列。
- bid summary 是只读描述，不使用输入框视觉。
- action icons 固定右上角，垂直居中即可，不参与 bid 宽度计算。
- tiers 作为 chips 放在 bid summary 下方或标题下方，不能把 bid 内容挤窄。
- 多条件时每个条件一张卡，保持 10-12px 间距。

### 3. Pairing Number 条件

`Pairing Number` 在 Search Criteria 里已经具备 grouped summary 能力，改造后需要继续保留：

- 折叠态展示 selected count、前几个 pairing/date。
- 展开态通过 `Show all N selected` 展示完整内容。
- 禁止重新显示 `E4101 on 2026-06-05; E4103 on ...` 这种长串。

### 4. 普通属性条件

普通属性的 bid value 展示成 readable text/chip，例如：

```text
Award · Any · EWR
```

样式上应是只读内容块，不是 input：

- 可以有浅色背景和边框。
- 不出现 caret、input padding、输入框 hover 风格。
- 文本允许换行，不能横向截断关键内容。

### 5. Actions

保留现有交互能力：

- `Edit search criteria ...`
- `Remove search criteria ...`
- `Add search criteria ...`
- `Favorite / Unfavorite search criteria ...`

行为不变，只改位置和样式。

设计要求：

- icon 必须有 hover cursor 和 focus-visible。
- disabled 状态保留。
- 不因为 card 化丢失 `aria-label`。

### 6. 组件边界

推荐新增或改造：

```text
PairingSearchCriteriaCard
```

职责：

- 接收 `PairingSearchCriteriaItem`。
- 负责展示 property title、bid summary、tiers、actions。
- 不做数据转换之外的业务判断。

可复用现有：

- `PairingBidSummaryView`
- `buildPairingExistingPropertyFromSearchCriteria`
- `TierToggleGroup`

不建议：

- 在 `PairingSearchPanel` 里塞过多 JSX。
- 为了一个页面引入新的全局 UI 组件。
- 改后端返回结构。

## 影响文件

预计修改：

- `pbs-portal/src/features/pairing/components/pairing-search-panel.tsx`
  - 普通 criteria preview 不再渲染 `criteriaTableHeader`。
  - 列表渲染 card 组件。
- `pbs-portal/src/features/pairing/components/pairing-search-criteria-row.tsx`
  - 改造成 card，或保留旧文件名但语义从 row 变 card。
- `pbs-portal/src/features/pairing/components/pairing-search-panel.module.css`
  - 删除/弱化 table header 和 grid row 样式。
  - 新增 criteria card 样式。
- `pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx`
  - 更新 Search Criteria shell 测试。
  - 增加普通 property card 展示断言。
  - 保留 Pairing Number grouped summary 断言。
- `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`
  - 如果当前 E2E 已覆盖 Search Pairings criteria，需要更新断言。
  - 增加“Search Criteria 不显示 PROPERTY/BID/ACTIONS 表头”的回归断言。
- `docs/test-cases/pbs/pairing/<date>-search-pairings-criteria-card.md`
  - 增加 QA 人工测试用例。
- `pbs-portal/src/version.ts` 与 `gantt/src/version.ts`
  - PBS Portal 前端运行代码变更，需要递增 PBS/frontend 版本。

## 验收标准

### UI 验收

- `Search Pairings` 页面普通 criteria preview 不再显示 `PROPERTY / BID / ACTIONS` 表头。
- 条件以 card 形式展示。
- card 标题显示 property 名称。
- bid 内容完整可读，不被 input-like 框截断。
- action icons 位于 card 右上角，功能不变。
- `Pairing Number` 条件仍是 grouped readable summary。
- 空态文案不变。
- 搜索结果区域不受影响。

### 行为验收

- 点击 edit 仍打开原有配置弹窗。
- 修改条件后仍重新 preview 搜索结果。
- remove/add/favorite 行为不变。
- tiers toggle 在需要展示 tiers 的入口中不丢失。
- 后端请求参数不变。

### 测试验收

需要运行：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
pnpm exec vitest run src/features/pairing/pages/search-pairings-page.test.tsx --reporter=basic
pnpm lint
pnpm build

cd /Users/lei/Codehub/rois-ai
npm run check:ui

cd /Users/lei/Codehub/rois-ai/e2e
npx playwright test tests/pbs-portal/condition-default-favorites.spec.ts --reporter=list --config=config/playwright.config.ts --project=pbs-portal
```

如果 E2E 依赖本地服务未启动，需要明确说明未运行原因，并提供手动验证步骤。

## QA 人工测试用例要点

新增 QA 文档应覆盖：

1. 打开 Pairing 页面。
2. 选择一个普通 property，例如 `Any Landing In Airport`。
3. 点击 preview/search 进入 `Search Pairings`。
4. 验证 `SEARCH CRITERIA` 展示为卡片，不是表格。
5. 验证 bid 内容完整可读。
6. 点击 edit，确认原配置弹窗正常打开。
7. 保存/取消后返回页面，criteria 卡片仍正常。
8. 使用 `Pairing Number` 条件进入 Search Pairings，确认 grouped summary 正常。
9. 验证搜索结果卡片不回归。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次改动集中在 `Search Pairings` 的一个前端展示分支，组件、CSS、测试高度耦合；多 agent 会增加冲突风险。
- Suggested split: 不拆分。由一个 agent 完成组件/CSS/测试/QA 文档。
- Write boundaries: `pbs-portal/src/features/pairing/components/*search*`、`search-pairings-page.test.tsx`、相关 E2E/QA 文档。
- Conflict risk: Medium。当前 pairing UI 近期改动密集，建议实施前确认工作区干净，并只暂存本次文件。
- Execution gate: 用户确认本 spec 后再实现。

## 风险与注意事项

- 不要把 card 化做成新的全局抽象；先保 feature-local。
- 不要改搜索条件构建和请求契约。
- 不要让 action icon 被 bid summary 的宽度挤出页面。
- 不要删除已有 accessibility label。
- 不要把 `Pairing Number` grouped summary 回退成普通短文本。
- CSS 需要通过 `npm run check:ui`，避免新增 hard violation。

