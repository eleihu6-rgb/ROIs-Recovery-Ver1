# PBS Portal Help Bid Condition 控件级说明补充设计

## 背景

上一版 Help 已经覆盖了当前可见的 bid condition，并给每个 condition 增加独立弹窗截图。但用户反馈仍然不够细：

- `Pairing Preference` 弹窗里的搜索框没有讲清楚。
- `Pairing Preference` 的 `Filters` 只笼统提到，没有说明它只是筛选 pairing list，不会保存成 bid。
- 多个弹窗都有 `Limit to Event Date` / date scope 类控件，目前说明不统一、不够具体。
- Help 缺少这些控件的局部截图，用户无法快速看懂控件位置和作用。

这说明当前 Help 还是“condition 级别说明”，还没有做到“控件级别说明”。

## 目标

把 Bid Conditions Help 从“每个 bid condition 一张弹窗截图 + 粗略字段表”提升到“关键控件逐项解释 + 必要局部截图”。

完成后，一个不熟悉 PBS 的用户应该能只通过 Help 明白：

1. `Pairing Preference` 搜索框能搜什么。
2. 搜索框、Filters、table checkbox、selected count、ADD BID 之间的关系。
3. Filters 筛出来的是候选 pairing，不等于保存 filter rule。
4. 哪些 condition 有 `Limit to Event Date` / date scope 控件。
5. `Limit to Event Date` 关闭和打开时分别代表什么。
6. date scope 限制的是规则生效日期，不是把当前 bid period 改掉。
7. Standing Bid 中可复用的条件和 Current-only 条件区别仍然清楚。

## 范围

本次重点补充 `Bid Conditions` Help，不改业务页面行为。

需要补充的 Help 内容包括：

- `Pairing Preference`
  - 搜索框局部截图。
  - Filters 按钮 / Filters 弹窗截图。
  - Pairing table checkbox / selected count / total count / ADD BID 的关系说明。
  - 搜索和 Filters 不保存为 bid 的明确说明。
- `Limit to Event Date` / date scope
  - 统一的概念说明。
  - 带有该控件的 condition 卡片中逐一说明。
  - 至少补充关闭态和打开态局部截图；如果某些弹窗形态不同，则单独补充截图。
- 其它容易误解的公共控件
  - `Award / Avoid`
  - `Apply to Tiers`
  - `Save Favorite` 和 `Add Bid`
  - date range / specific dates / days of week 的差异

## 不在本次范围

- 不改 bid condition 业务弹窗功能。
- 不新增或删除 property catalog。
- 不改变 CSV / draft 保存逻辑。
- 不改 screenshot preview 组件行为，除非新增截图暴露出实际 bug。
- 不把 Help 改成教学向导或步骤弹窗。

## 方案比较

### 方案 A：只在现有字段表里补几句话

优点：
- 改动最小。

缺点：
- 仍然没有控件局部截图。
- 用户还是需要从整张弹窗截图里自己找控件。
- `Pairing Preference` 这种复杂弹窗仍然不够清楚。

结论：不推荐。

### 方案 B：在 condition 卡片里增加 `Key controls` 区块（推荐）

做法：

- 在每个 condition 卡片的 `How to configure it` 后面增加 `Key controls`。
- 每个 control 用统一结构展示：
  - 控件名称
  - 控件位置 / 出现条件
  - 用户应该怎么用
  - 常见误解
  - 可选局部截图
- 对公共控件用共享说明模板，但渲染到具体 condition 里，用户不需要跳别的页面理解。

优点：
- 细节足够，结构清晰。
- 不需要拆成大量新页面。
- 复用现有 `BID_CONDITION_HELP_ENTRIES` 数据模型，后续维护可控。

缺点：
- 数据结构要扩展。
- 截图采集脚本需要新增控件级截图。

结论：推荐。

### 方案 C：新增一个独立 `Common controls` Help topic

优点：
- 公共概念集中说明。

缺点：
- 用户正在看某个 condition 时还要跳出去。
- 容易出现“公共页面有解释，但具体 condition 没解释”的问题。

结论：可作为补充，但不能替代方案 B。

## 推荐设计

采用方案 B，并在 Pairing 分组顶部额外放一个短的 `Pairing Preference controls` 总览。

### 1. 数据结构扩展

在 `condition-help-data.ts` 里扩展 `BidConditionHelpEntry`：

```ts
type BidConditionControlGuide = {
  label: string
  details: string
  screenshot?: BidConditionScreenshot
  commonMistake?: string
}
```

每个 entry 可选：

```ts
controlGuides?: BidConditionControlGuide[]
```

渲染逻辑：

- 如果某个 condition 有 `controlGuides`，就在卡片里展示 `Key controls` 区块。
- `controlGuides` 中有截图时，显示局部截图。
- 没有截图时，只显示文字说明。

### 2. Pairing Preference 必补控件

`Pairing Preference` 必须至少有这些 control guides：

- `Search pairing list`
  - 说明可搜索 pairing number、base、route、rank 相关文本。
  - 说明它只过滤候选列表，不会保存为 bid。
  - 截图：搜索框和 Filters 按钮所在区域。
- `Filters`
  - 说明它打开 `Pairing Filters` 弹窗。
  - 说明可按 start dates、check-in/out、length、route station、layover station、layover count、credit、redeye、DHD 缩小列表。
  - 说明 Apply Filters 后只是缩小 pairing table。
  - 截图：Filters 弹窗。
- `Pairing checkbox`
  - 说明勾选 table row 才会进入 selected count。
  - 说明只有 selected rows 会保存。
- `Selected / total count`
  - 说明 `0 selected · 472 total` 这类数字是什么意思。
  - 说明 selected 必须大于 0 才能 Add Bid。
- `Add Bid`
  - 说明保存的是选中的 exact pairing rows，不保存搜索词或 filter 条件。

### 3. Limit to Event Date / Date Scope 统一规则

建立统一说明：

- `Limit to Event Date` 关闭：
  - 规则在整个当前 bid period / reusable standing period 范围内生效。
- `Limit to Event Date` 打开：
  - 规则只在选择的 event dates / date range 内生效。
- 它不是 pairing table filter。
- 它不是修改 bid period。
- 它不会自动帮用户选择 pairing；只是限制这个 rule 被评估的日期。

需要逐项检查并补充所有含 date scope 的 condition。初步包括：

- `Pairing Check-In / Check-Out Time`
- `Flight Legs per Duty`
- `Work Day Preference`
- `Pairing Length`
- `Flight Number Preference`
- `Redeye Preference`
- `Deadhead Flying`
- `Time Between Flights`
- `Airport Preference`
- `Efficient Flying First`
- `Reserve Preference` 的 `Date Scope`
- Days Off 的 `Specific Dates` / `Date Range` / `Days of Week` / `Weekends`

实现前需要按真实弹窗确认每个控件名称，不凭记忆补。

### 4. 新增截图

新增控件级截图，命名建议：

- `bid-condition-pairing-preference-search-controls.png`
- `bid-condition-pairing-preference-filters-dialog.png`
- `bid-condition-pairing-preference-selection-controls.png`
- `bid-condition-limit-to-event-date-off.png`
- `bid-condition-limit-to-event-date-on.png`
- 如某些弹窗 date scope 形态不同，再补：
  - `bid-condition-reserve-date-scope.png`
  - `bid-condition-days-off-date-type-controls.png`

截图要求：

- 必须由 `e2e/scripts/capture-pbs-portal-help-screenshots.ts` 从真实 Portal UI 截取。
- 不能手工裁假图。
- 每个 `HelpScreenshot` 必须有对应 png。

## 小白子智能体验收设计

用户要求引入一个“完全不懂 PBS 的小白子智能体”来试用 Help。设计如下：

### 子智能体角色

名字：`pbs-help-novice-evaluator`

能力设定：

- 不了解 PBS。
- 不读源码。
- 不读 spec。
- 不读测试。
- 只能使用运行中的 PBS Portal UI 和 Help Center。
- 遇到不懂的地方，只能提出问题或记录困惑，不能要求主智能体直接给答案。
- 主智能体不能直接教它答案，只能把缺口补进 Help，然后让它重新通过 Help 学习。

### 子智能体验收流程

1. 主智能体完成第一轮 Help 修改。
2. 启动本地 Portal / Playwright 环境。
3. 派发子智能体，让它执行这些任务：
   - 找到 `Pairing Preference`。
   - 说明搜索框和 Filters 的区别。
   - 说明 selected count 和 total count 的意义。
   - 说明为什么 Apply Filters 后还不能 Add Bid。
   - 找到一个带 `Limit to Event Date` 的 condition，解释打开 / 关闭的区别。
   - 找到 `Reserve Preference` 的 date scope，解释它和 Pairing 的 event date scope 有什么不同。
   - 从 Help 中学习后，尝试配置一个 Pairing Preference，一个 Check-In / Check-Out Time，一个 Reserve Preference。
4. 子智能体输出：
   - 它能独立完成的内容。
   - 它需要反复查找的内容。
   - 它看不懂、问出的问题。
   - Help 中缺失或表达模糊的位置。
5. 主智能体只把这些问题转化为 Help 内容补充，不直接回答子智能体。
6. 补完后，再让子智能体重复关键任务。
7. 直到它能用 Help 解释关键控件，并完成主要任务。

### 子智能体问题处理规则

子智能体提出的问题分三类：

- Help 内容缺失：必须加入 Help。
- Help 内容写了但不好找：调整目录、标题或关键词。
- Help 内容准确但子智能体误读：改写为更直白的用户语言。

不把以下内容加入 Help：

- 内部实现细节。
- 数据库、API、mock、测试实现。
- 用户不需要知道的工程术语。

## 需要修改的文件

预计修改：

- `pbs-portal/src/features/help/topics/bid-conditions/condition-help-data.ts`
  - 扩展控件级说明数据。
- `pbs-portal/src/features/help/topics/bid-conditions/condition-reference.tsx`
  - 渲染 `Key controls` 区块和局部截图。
- `e2e/scripts/capture-pbs-portal-help-screenshots.ts`
  - 新增控件级截图采集。
- `e2e/scripts/pbs-portal-help-screenshot-mocks.ts`
  - 如截图需要稳定数据，补充 mock。
- `e2e/tests/pbs-portal/help/help-content-bid-conditions.spec.ts`
  - 断言 Pairing Preference 搜索框、Filters、selected count、Limit to Event Date 说明存在。
- `e2e/tests/pbs-portal/help/help-screenshots.spec.ts`
  - 确保新增截图加载正常。
- `docs/test-cases/pbs/help/2026-07-31-pbs-portal-help-manual.md`
  - 更新人工 QA。

## 验收标准

1. `Pairing Preference` Help 中明确说明搜索框、Filters、checkbox、selected count、ADD BID 的关系。
2. `Pairing Preference` 至少有搜索区、Filters 弹窗、选择区的控件级截图。
3. 所有带 `Limit to Event Date` / date scope 的 condition 都有明确说明。
4. Help 明确 `Limit to Event Date` 关闭 / 打开的区别。
5. Help 明确 Filters 不等于保存 bid rule。
6. 新增截图全部来自真实 Portal UI。
7. Playwright Help 回归通过。
8. 小白子智能体验收后，提出的问题已分类处理；适合加入 Help 的内容都已加入。

## 小白验收后追加处理

子智能体只读使用 Help 后，主要困惑集中在 date scope label 和入口对比：

- `Event Date` / `Flight Date` / `Pairing Start Date` 名字相似，需要在 `Pairing Conditions` 顶部做对照表。
- `Limit to Flight Date` 和 `Limit to Pairing Start Date` 需要独立真实截图，不能只复用 `Limit to Event Date` 截图。
- `Days Off` 需要说明“左侧日历从日期出发”和“Add Bid Properties 从条件类型出发”的区别。
- `Pairing` 需要说明“左侧日历从可见 exact pairing entry 出发”和“Add Bid Properties 从 pairing rule 出发”的区别。
- `Reserve Date Scope` 需要明确它是 reserve preference 的生效范围，不是 pairing event / flight / start date limit。

这些内容纳入同一轮 Help 更新和回归验证。

## 验证计划

自动化：

```bash
cd /Users/lei/Codehub/rois-ai/e2e
npx tsx scripts/capture-pbs-portal-help-screenshots.ts
npx playwright test -c config/playwright.config.ts --project=pbs-portal tests/pbs-portal/help/ --reporter=list --no-deps
```

构建和规范：

```bash
cd /Users/lei/Codehub/rois-ai
npm run check:ui
pnpm --dir pbs-portal build
git diff --check
node .gitnexus/run.cjs detect-changes -r /Users/lei/Codehub/rois-ai
```

子智能体验收：

- 使用 multi-agent 派发只读 / UI 使用型子智能体。
- 子智能体不得修改文件。
- 子智能体不得读取源码或 spec。
- 子智能体只输出 Help 使用过程中的困惑和问题。
- 主智能体根据问题补 Help，再复验。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 主实现和小白验收可以分阶段并行/串行结合。实现阶段由主智能体修改 Help；验收阶段使用子智能体模拟新手，独立暴露 Help 缺口。
- Suggested split:
  - 主智能体：改 Help 数据、截图、测试、QA 文档。
  - 子智能体：只使用 Help 和 UI，报告困惑，不写文件。
- Write boundaries:
  - 子智能体无写权限，不修改仓库。
  - 主智能体负责所有代码和文档修改。
- Conflict risk: Low。子智能体只读，不会产生文件冲突。
- Execution gate: 用户确认本 spec 后再开始实现；实现后再派发子智能体验收。
