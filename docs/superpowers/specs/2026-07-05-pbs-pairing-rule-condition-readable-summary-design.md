# PBS Pairing Rules 条件摘要可读化设计

## 背景

当前 `EXISTING PAIRING PROPERTIES` 切到 rules 视图后，`Pairing Number` 条件会展示类似下面的长文本：

```text
Pairing Number: Award · E4101 on 2026-06-05; E4103 on 2026-06-05, 2026-06-08, ...
```

这串文本本质上是机器可读的完整 bid 表达，不适合直接作为用户界面展示。它会把一个 rule condition 撑成很长的文本墙，破坏右侧面板的可读性，也和我们已经在 `Existing Properties`、`Search Criteria`、`Search Results` 中做过的可读摘要风格不一致。

## 当前代码观察

- `pbs-portal/src/features/pairing/pairing-existing-bid-summary.ts` 已经提供了 Pairing Number 的 grouped readable summary：
  - `Award · Pairing Number · 25 selected`
  - 按 pairing number 分组展示日期。
  - 折叠态只展示前几个 pairing / 日期，并显示 `+N more`。
- `pbs-portal/src/features/pairing/components/pairing-bid-summary-view.tsx` 已经能把这种 summary 渲染成用户可读卡片。
- 截图里的长串不是来自 `PairingBidSummaryView`，而是来自 rule expression 路径：
  - `pbs-portal/src/features/pairing/pairing-rule-logic.ts`
  - `buildPairingRuleConditionText()` 当前用 `formatPairingBidValue()` 生成纯文本。
  - `PairingRuleExpressionView` 和 `PairingSearchRuleExpression` 都直接渲染 `condition.text`。

## 目标

把 Pairing rules 视图里的 `Pairing Number` 条件，从完整长文本改为用户可读摘要。

用户应该一眼看到：

```text
Pairing Number
Award · 25 selected

E4101  Jun 05
E4103  Jun 05, Jun 08, Jun 10 +3
E4106  Jun 02, Jun 04, Jun 06 +4
+9 more pairings
```

而不是看到完整的 `E4101 on 2026-06-05; E4103 on ...` 长串。

## 范围

### 需要覆盖

- Pairing 主页面右侧 `EXISTING PAIRING PROPERTIES` 的 rules 视图。
- `Search Pairings` 页面中从 `SEARCH PAIRINGS` 进入的 current rules preview。
- `Pairing Number` 条件的 `pairing-id-list` 和 `pairing-occurrence-list` 两种 bid 数据。
- `AND / OR` 关系仍然清晰可见。
- 现有 `Existing Properties` / `Search Criteria` 的 readable summary 行为保持不变。

### 不做

- 不改后端接口。
- 不改 bid 保存格式。
- 不改 Pairing Number 配置弹窗。
- 不改左侧 `BIDDING CALENDAR`。
- 不把所有普通 property 都强行卡片化；普通短条件可以继续保持 pill 文本。

## 方案选择

### 方案 A：只做 CSS 截断

做法：给 rule condition 加 `max-width`、`line-clamp` 或 `truncate`。

优点：
- 改动最小。

缺点：
- 用户仍然看不到有效信息。
- 长串只是被藏起来，不是被重新设计。
- 和前面做过的 readable summary 方向不一致。

结论：不推荐。

### 方案 B：在 `buildPairingRuleConditionText()` 中硬编码短文本

做法：如果 property 是 `Pairing Number`，直接返回 `Pairing Number: Award · 25 selected`。

优点：
- 实现简单。
- 能避免长串。

缺点：
- 只显示数量，不显示选了哪些 pairing。
- 复用了太少现有 summary 能力。
- 后续 Search Criteria / Existing Properties / Rules 三套展示容易再次分裂。

结论：可用但不够好。

### 方案 C：规则视图复用现有 grouped readable summary

做法：
- 调整 rule expression 的 condition 模型，不只保存纯文本。
- 对每个 condition 保留原始 `PairingExistingProperty` 或构建好的 summary 数据。
- 渲染层根据 property 类型决定：
  - `Pairing Number` 且能构建 grouped summary：渲染 compact readable summary。
  - 普通 property：保留现有短 pill 文本。
- 主页面 rules 视图和 Search Pairings current-rules preview 共用同一套 rule condition renderer。

优点：
- 和已有设计一致。
- 用户既能看到数量，也能看到关键 pairing/date 摘要。
- 不改变数据保存和后端契约。
- 以后其他复杂 bid 也可以按同样模式扩展。

缺点：
- 需要小范围重构 rule expression condition 类型和两个渲染入口。

结论：推荐采用。

## 推荐设计

### 1. 数据模型

将 `PairingRuleExpressionCondition` 从纯文本：

```ts
{
  key: string;
  text: string;
}
```

扩展为能支持结构化渲染：

```ts
{
  key: string;
  property: PairingExistingProperty;
  fallbackText: string;
}
```

其中：
- `property` 用于构建 readable summary。
- `fallbackText` 用于普通 property 或异常数据兜底。
- 不在 logic 层塞 React 组件，保持逻辑和 UI 分离。

### 2. 渲染组件

新增或抽取一个 rule condition 专用组件，例如：

```ts
PairingRuleConditionSummary
```

行为：
- 如果 `propertyCode === 102` 且 `buildExistingPairingBidSummary(property)` 返回 grouped summary：
  - 使用 compact grouped card 展示。
  - headline 改成更适合 rules 语境的格式：`Award · 25 selected`，不要重复显示 `Pairing Number` 两次。
  - card 顶部单独显示 property name：`Pairing Number`。
- 其他 property：
  - 使用现有 pill 样式。
  - 文案仍为 `Property Name: Action · Value`。

### 3. 展示规则

折叠态建议：

- 最多展示 3 个 pairing group。
- 每个 group 最多展示 3 个日期。
- group 内超出的日期显示 `+N more`。
- group 超出的 pairing 显示 `+N more pairings`。
- 提供 `Show all N selected` / `Show less`，沿用已有交互。

示例：

```text
Pairing Number
Award · 25 selected
E4101   Jun 05
E4103   Jun 05, Jun 08, Jun 10 +3
E4106   Jun 02, Jun 04, Jun 06 +4
+9 more pairings                      Show all 25 selected
```

### 4. AND / OR 布局

规则表达仍保留业务关系：

- 不改变 `AND` / `OR` 计算逻辑。
- `AND` / `OR` 视觉标记仍显示在 condition 之间。
- 当 condition 是 grouped card 时，`AND` / `OR` 应在 card 左侧或上方清晰出现，不能被挤到长文本中间。
- 同一 clause 内多个 `Pairing Number` 条件仍按原有 OR 逻辑排列，只是每个条件的内容变成 compact summary。

### 5. 可访问性

- grouped card 的 `aria-label` 应包含 property 名和 selected count，例如：
  - `Rule condition Pairing Number, Award, 25 selected`
- `Show all N selected` 是按钮，支持键盘操作。
- 不用超长 `title` 作为主要信息来源；可保留作为辅助，但不能依赖 hover 才能理解条件。

## 影响文件

预计修改：

- `pbs-portal/src/features/pairing/pairing-rule-logic.ts`
  - condition 从纯文本改为 property + fallbackText。
- `pbs-portal/src/features/pairing/components/pairing-rule-expression-view.tsx`
  - rules 视图渲染 structured condition。
- `pbs-portal/src/features/pairing/components/pairing-search-panel.tsx`
  - current rules preview 渲染 structured condition。
- `pbs-portal/src/features/pairing/components/pairing-bid-summary-view.tsx`
  - 如果现有组件过重，可抽出内部 grouped summary renderer 供 rules view 复用。
- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
  - 覆盖主页面 rules view。
- `pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx`
  - 覆盖 Search Pairings current rules preview。
- `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`
  - 增加真实 UI 断言。
- `docs/test-cases/pbs/pairing/<date>-pairing-rule-condition-readable-summary.md`
  - 增加 QA 人工测试用例。
- `pbs-portal/src/version.ts` 与 `gantt/src/version.ts`
  - 前端版本号递增。

## 验收标准

### UI 验收

- `EXISTING PAIRING PROPERTIES` 的 rules 视图中，长 Pairing Number 条件不再显示完整长串。
- 用户可见内容包含：
  - `Pairing Number`
  - `Award · 25 selected`
  - 前 3 组 pairing/date 摘要
  - `+N more` / `+N more pairings`
  - `Show all N selected`
- 点击 `Show all N selected` 后能展开完整列表；点击 `Show less` 能收起。
- `Any Landing In Airport: Award · Any · EWR` 这类短条件仍保持简洁，不被过度卡片化。
- `AND` / `OR` 关系可见且不拥挤。

### 数据/行为验收

- 不改变保存到后端的 bid 数据。
- 不改变 pool count 计算。
- 不改变 search 结果。
- 不改变 edit / delete / preview 按钮行为。

### 回归验收

- Existing Properties 表格中的 Pairing Number readable summary 行为不退化。
- Search Criteria 中的 Pairing Number readable summary 行为不退化。
- Search Pairings current rules preview 与主页面 rules view 风格一致。

## 测试计划

### 自动化测试

1. `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
   - 构造一个 T1 下的 `Pairing Number` property，包含 25 个 occurrence。
   - 切到 rules view。
   - 断言：
     - 显示 `Pairing Number`。
     - 显示 `Award · 25 selected`。
     - 显示折叠摘要。
     - 不显示完整长串，例如不应出现包含大量 `2026-06-05; E4103 on ...` 的连续文本。
     - 展开/收起可用。

2. `pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx`
   - 从 current rules preview state 进入。
   - 断言 Search Criteria 的 rules preview 使用同样摘要。

3. `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`
   - 增加 `PBS-3512` 或同类用例。
   - 在真实 UI 中进入 Pairing rules view。
   - 断言 `Pairing Number` 不再是一大串原始文本，而是 readable grouped summary。

### 验证命令

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
pnpm exec vitest run src/features/pairing/pages/pairing-page.test.tsx src/features/pairing/pages/search-pairings-page.test.tsx --reporter=basic
pnpm lint
pnpm build

cd /Users/lei/Codehub/rois-ai
npm run check:ui

cd /Users/lei/Codehub/rois-ai/e2e
npx playwright test tests/pbs-portal/condition-default-favorites.spec.ts -g "PBS-3512" --reporter=list --config=config/playwright.config.ts --project=pbs-portal
```

## 风险与约束

- `PairingRuleExpressionCondition` 类型会影响两个渲染入口，修改时必须同步更新主页面和 Search Pairings。
- 如果直接复用 `PairingBidSummaryView`，要避免样式在 rules view 中过宽或过高；必要时拆出 compact variant。
- 不要通过 CSS 截断掩盖问题；目标是把条件变成用户可读摘要。
- 不要把 full raw string 放进 visible UI。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是一个前端局部展示重构，涉及同一组 Pairing rule summary 文件和测试。并行开发会增加冲突风险。
- Suggested split: 不建议拆分。
- Write boundaries: 单 agent 负责 `pairing-rule-logic`、两个渲染入口、相关测试与 QA 文档。
- Conflict risk: 多 agent 同时改 Pairing 组件和测试容易冲突。
- Execution gate: 用户确认 spec 后再实现。

## 待确认

我建议按方案 C 实现：rules view 复用已有 grouped readable summary，只改展示模型和两个渲染入口，不动后端和保存格式。
