# PBS Portal Help Bid Condition 三级目录改版设计

## 背景

当前 `Help Center -> Bid Conditions` 目录是两层结构：

- `Bid Conditions`
  - `All Bid Conditions`
  - `Days Off Conditions`
  - `Pairing Conditions`
  - `Roster / Line Conditions`
  - `Reserve Conditions`
  - `Standing Bid Conditions`

上一版已经把 19 个可见 bid condition 的说明和独立弹窗截图补齐，但目录仍然偏粗。用户想找某一个具体 bid 时，需要先进入分组页面再滚动查找；`All Bid Conditions` 与分组页面内容重复，也会增加认知负担。

## 目标

把 `Bid Conditions` 左侧目录改成更细的索引，让用户可以直接点击具体 bid condition：

- 移除左侧目录里的 `All Bid Conditions`
- 保留二级分组：
  - `Days Off Conditions`
  - `Pairing Conditions`
  - `Roster / Line Conditions`
  - `Reserve Conditions`
  - `Standing Bid Conditions`
- 在每个二级分组下展示三级条目，即该分组下的具体 bid condition
- 点击三级条目后，右侧打开对应分组页面，并定位到对应 bid condition 卡片

## 当前问题

1. `All Bid Conditions` 与分组页面重复。
2. 分组页面说明完整，但目录无法直接跳到某个条件。
3. Pairing 条件较多，用户在 `Pairing Conditions` 内滚动查找成本最高。
4. `Standing Bid Conditions` 需要继续排除 Current-only 的 `Pairing Preference`，不能因为复用导航数据把它错误加回 Standing Bid。

## 方案比较

### 方案 A：保留当前二级目录，只在页面内加目录锚点

优点：
- 改动小。
- 不影响左侧 Help Nav 结构。

缺点：
- 用户仍需要先点分组页面。
- 左侧目录没有体现具体 bid，查找效率改善有限。

### 方案 B：左侧目录增加三级 bid condition 条目（推荐）

优点：
- 用户可以从左侧直接看到全部具体条件。
- Pairing 条件多的问题最明显改善。
- 不需要拆 19 个独立页面，仍然复用现有分组页和截图内容。

缺点：
- `HelpNav` 需要支持 topic 下的 child anchors。
- 搜索匹配和 active state 需要同步处理。

### 方案 C：每个 bid condition 独立成一个 Help topic 页面

优点：
- URL 和页面最细。
- 每个条件页面内容最聚焦。

缺点：
- topic 数量突然增加 19 个，Help registry 和 routing 变重。
- 分组页面与单条件页面会重复渲染同一套内容。
- 后续维护截图和说明更容易分叉。

## 推荐设计

采用方案 B。

左侧导航新增“三级条目”概念，但不把每个 bid condition 变成独立 Help topic。三级条目只是锚点入口：

- 二级 topic 仍然是：
  - `bid-conditions-days-off`
  - `bid-conditions-pairing`
  - `bid-conditions-roster-line`
  - `bid-conditions-reserve`
  - `bid-conditions-standing-bid`
- 三级 item 对应 `BID_CONDITION_HELP_ENTRIES` 中的 `entry.id`
- 点击三级 item 时：
  - 切换到对应二级 topic
  - 把 selected condition id 传给 Help page
  - 右侧文章滚动到 `data-testid="help-bid-condition-${entry.id}"` 对应卡片

`All Bid Conditions` 从左侧目录移除。是否保留对应组件和 slug 作为内部 fallback，可以在实现时决定；但不再作为用户可见导航入口。

## 导航结构

建议左侧展示：

```text
Bid Conditions
  Days Off Conditions
    Prefer Off
    Long Stretch Off / Compressed Flying
  Pairing Conditions
    Pairing Preference
    Pairing Check-In / Check-Out Time
    Flight Legs per Duty
    Work Day Preference
    Pairing Length
    Flight Number Preference
    Redeye Preference
    Deadhead Flying
    Time Between Flights
    Month-End Carryover
    Airport Preference
    Efficient Flying First
  Roster / Line Conditions
    Minimum Base Layover
    Commuter Pattern
    Mixed Line Bid
    Credit Window Preference
  Reserve Conditions
    Reserve Preference
  Standing Bid Conditions
    Prefer Off
    Long Stretch Off / Compressed Flying
    Pairing Check-In / Check-Out Time
    Flight Legs per Duty
    Work Day Preference
    Pairing Length
    Flight Number Preference
    Redeye Preference
    Deadhead Flying
    Time Between Flights
    Month-End Carryover
    Airport Preference
    Efficient Flying First
    Minimum Base Layover
    Commuter Pattern
    Mixed Line Bid
    Credit Window Preference
    Reserve Preference
```

Standing Bid 的三级列表来自 `getStandingBidConditionEntries()`，明确不包含 `Pairing Preference`。

## UI 要求

- 三级条目视觉上要比二级 topic 更轻：
  - 更小或同字号但较低字重
  - 更深缩进
  - active 状态可以使用较浅背景或左侧细线，避免和二级 topic 抢层级
- 左侧目录需要保持可滚动。
- 搜索时：
  - 搜索命中二级 topic 标题时，展示该 topic 和下面全部三级条目。
  - 搜索命中具体 bid condition 名称或说明时，展示对应二级 topic 和匹配的三级条目。
- 点击二级 topic：打开分组页面顶部。
- 点击三级 condition：打开分组页面并滚动到对应卡片。
- 不新增图标，不把左侧做得过重。

## 数据设计

新增一个轻量导航派生层，优先从现有 Help condition 数据派生，避免手写重复列表：

- `Days Off Conditions` 使用 `getBidConditionEntriesByGroup("days-off")`
- `Pairing Conditions` 使用 `getBidConditionEntriesByGroup("pairing")`
- `Roster / Line Conditions` 使用 `getBidConditionEntriesByGroup("roster-line")`
- `Reserve Conditions` 使用 `getBidConditionEntriesByGroup("reserve")`
- `Standing Bid Conditions` 使用 `getStandingBidConditionEntries()`

需要在 Help topic 数据或导航层表达 child 条目，但不要复制 property code / name / group 的长期数据源。

## 实现范围

需要修改：

- `pbs-portal/src/features/help/help-data.ts`
  - 移除用户可见 `All Bid Conditions`
  - 为 bid-condition 分组 topic 提供可派生 child 条目的结构，或在 nav 中通过 topic slug 映射到 condition 数据
- `pbs-portal/src/features/help/components/help-nav.tsx`
  - 支持三级 child 条目渲染
  - 支持 child active 状态
  - 支持 child 搜索匹配
- `pbs-portal/src/features/help/components/help-view.tsx`
  - 支持携带 condition anchor / selected id
  - topic 切换后滚动到具体 card
- `pbs-portal/src/features/help/topics/bid-conditions/condition-reference.tsx`
  - 确保每个 `BidConditionCard` 有稳定 `id` 或 data attribute 可滚动定位
  - 如果保留 `AllBidConditionsReference`，不再从左侧导航暴露
- `e2e/tests/pbs-portal/help/help-content-bid-conditions.spec.ts`
  - 更新 `All Bid Conditions` 相关断言
  - 增加三级目录点击定位测试
- `e2e/tests/pbs-portal/help/help-navigation.spec.ts`
  - 覆盖搜索和 active state
- `docs/test-cases/pbs/help/2026-07-31-pbs-portal-help-manual.md`
  - 更新人工 QA 步骤

## 不在本次范围

- 不重写 Help 页面整体视觉。
- 不拆成 19 个独立 Help topic 页面。
- 不新增或重拍 bid condition 弹窗截图，除非测试证明已有截图引用受影响。
- 不修改业务 bid 条件弹窗。
- 不修改 catalog 可见性规则。

## 验收标准

1. 左侧 `Bid Conditions` 下不再显示 `All Bid Conditions`。
2. 每个分组 topic 下显示对应的三级 bid condition。
3. 点击 `Pairing Conditions -> Flight Number Preference` 这类三级条目时，右侧打开 Pairing Conditions 并定位到对应卡片。
4. 点击二级 `Pairing Conditions` 时，右侧停留在分组页面顶部。
5. `Standing Bid Conditions` 三级列表不包含 Current-only `Pairing Preference`。
6. Help 搜索能搜到具体 condition 名称，并能点击定位。
7. 现有 Help 截图仍能正常加载。
8. Playwright Help 回归通过。

## 验证计划

自动化：

```bash
cd /Users/lei/Codehub/rois-ai/e2e
npx playwright test -c config/playwright.config.ts --project=pbs-portal tests/pbs-portal/help/ --reporter=list --no-deps
```

前端检查：

```bash
cd /Users/lei/Codehub/rois-ai
npm run check:ui
pnpm --dir pbs-portal build
git diff --check
node .gitnexus/run.cjs detect-changes -r /Users/lei/Codehub/rois-ai
```

人工重点：

- 在 Help 左侧确认 Bid Conditions 的层级是否清楚。
- 搜索 `Flight Number`、`Mixed Line`、`Reserve Preference`。
- 检查 1366px 高度下左侧目录滚动是否可用。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次改动集中在 Help 导航状态、topic 数据和对应 E2E，文件之间耦合较紧，多 agent 并行容易改到同一批文件。
- Suggested split: 不建议拆分；由一个实现者顺序完成导航结构、锚点滚动、测试更新。
- Write boundaries: 单人修改 `pbs-portal/src/features/help/**`、`e2e/tests/pbs-portal/help/**` 和对应 QA 文档。
- Conflict risk: 中等。风险主要在 `help-nav.tsx`、`help-view.tsx` 和现有 Help 测试断言。
- Execution gate: 用户确认本 spec 后再开始实现。

