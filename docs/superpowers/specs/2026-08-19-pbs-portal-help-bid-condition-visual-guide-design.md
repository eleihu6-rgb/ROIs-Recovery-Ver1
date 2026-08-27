# PBS Portal Help Bid Condition 条件级图文讲解设计

## 背景

上一版 Help 只做了“分类级截图 + 每个条件一句示例”，不满足用户要求。真实需求是把 `Bid Conditions` 做成能按具体条件阅读的操作说明：用户看到某个 bid 条件时，能知道入口在哪里、弹窗长什么样、每个关键字段怎么填、保存后影响哪里，以及这个条件适合什么业务场景。

这次必须补齐两个遗漏：

- `Pairing` 和 `Days Off` 除了右侧 `ADD BID PROPERTIES` 入口外，左侧日历也可以触发添加，需要在 Help 里体现。
- 当前可见 catalog 约 19 个条件，每个条件都需要独立的弹窗截图和详细说明，不能只用几张分类截图概括。

## 目标

1. `Bid Conditions` Help 覆盖当前可见的全部 19 个 bid 条件。
2. 每个条件都有独立段落，包含：
   - 条件用途。
   - 入口路径。
   - 独立弹窗截图。
   - 关键字段解释。
   - 保存后的结果在哪里看。
   - 适合使用的例子。
   - 常见误解或注意事项。
3. `Days Off` 和 `Pairing` 增加左侧日历入口图文说明。
4. 所有截图必须来自真实 PBS Portal UI，通过现有 Help screenshot mock 脚本生成。
5. Help Playwright 测试必须验证每个条件都有截图，且截图能正常加载。

## 非目标

- 不改 bid 条件本身的业务逻辑。
- 不改配置弹窗 UI 或保存 API。
- 不改 catalog 可见性。
- 不新增数据库表或 migration。
- 不把隐藏、未开放、import-only 的条件写进 Help。
- 不引入新的图片标注库或 UI 依赖。

## 条件覆盖清单

### Days Off

1. `Prefer Off`
2. `Long Stretch Off / Compressed Flying`

### Pairing

3. `Pairing Preference`
4. `Pairing Check-In / Check-Out Time`
5. `Flight Legs per Duty`
6. `Work Day Preference`
7. `Pairing Length`
8. `Flight Number Preference`
9. `Redeye Preference`
10. `Deadhead Flying`
11. `Time Between Flights`
12. `Month-End Carryover`
13. `Airport Preference`
14. `Efficient Flying First`

### Roster / Line

15. `Minimum Base Layover`
16. `Commuter Pattern`
17. `Mixed Line Bid`
18. `Credit Window Preference`

### Reserve

19. `Reserve Preference`

如果实现时发现 catalog 里又新增或隐藏了条件，以代码中的可见 catalog 为准，并同步更新 Help 数据和测试断言。

## 推荐方案

采用“入口流程图 + 条件级弹窗截图 + 条件级详细说明”的方式。

原因：

- 用户能先知道从哪里进入，再按具体条件看操作。
- 每个条件都有自己的截图，不会出现“只看到几张图，看不懂具体条件”的问题。
- 条件说明可以复用同一套结构，维护时可以用测试保证没有漏条件、漏截图。
- 截图仍由 Playwright 脚本生成，避免手工截图过期或混入敏感信息。

## Help 页面结构

### 1. All Bid Conditions 总览

总览页保留四类分类解释，但不再把分类截图当成主要内容。

新增内容：

- `ADD BID PROPERTIES` 入口截图。
- `Days Off` 左侧日历入口截图。
- `Pairing` 左侧日历入口截图。
- 一段清楚说明：
  - 右侧入口适合按条件添加。
  - 左侧日历入口适合先看日期 / pairing，再从具体日历上下文添加。
  - 最终保存仍需要在弹窗里完成 `ADD BID`。

### 2. 分类页

分类页保留分类说明，但重点改成“这个分类下有哪些条件，每个条件怎么用”。

每个分类页先放该分类入口说明，然后逐个渲染条件级卡片。

### 3. 条件级卡片

每个条件卡片统一结构：

1. **What it does**
   - 用一句业务语言说明这个条件的用途。
2. **Where to open it**
   - 写清楚入口，例如：
     - `Bid > ADD BID PROPERTIES > PAIRING > Pairing Length`
     - `Bid > left BIDDING CALENDAR > date shortcut > Prefer Off`
3. **Dialog**
   - 放该条件自己的弹窗截图。
4. **Fields to understand**
   - 解释弹窗关键字段，例如 `Award / Avoid`、`T1-T7`、`Time Window`、`Date Scope`、`Operator`、`Station`、`Credit`。
5. **After saving**
   - 写清楚保存后会出现在 existing bid properties、日历、或对应 Tier。
6. **Example**
   - 给一个普通业务例子，例如 “I want mostly 2-day pairings”。
7. **Watch out**
   - 写常见误解，例如 “Filters only narrow the list; they do not save a bid.”

## 截图资产设计

### 入口截图

新增入口截图：

- `bid-conditions-entry.png`
- `bid-conditions-days-off-calendar-entry.png`
- `bid-conditions-pairing-calendar-entry.png`

### 条件弹窗截图

每个条件独立截图，建议命名：

- `bid-condition-prefer-off-dialog.png`
- `bid-condition-long-stretch-off-dialog.png`
- `bid-condition-pairing-preference-dialog.png`
- `bid-condition-check-in-check-out-time-dialog.png`
- `bid-condition-flight-legs-per-duty-dialog.png`
- `bid-condition-work-day-preference-dialog.png`
- `bid-condition-pairing-length-dialog.png`
- `bid-condition-flight-number-preference-dialog.png`
- `bid-condition-redeye-preference-dialog.png`
- `bid-condition-deadhead-flying-dialog.png`
- `bid-condition-time-between-flights-dialog.png`
- `bid-condition-month-end-carryover-dialog.png`
- `bid-condition-airport-preference-dialog.png`
- `bid-condition-efficient-flying-first-dialog.png`
- `bid-condition-minimum-base-layover-dialog.png`
- `bid-condition-commuter-pattern-dialog.png`
- `bid-condition-mixed-line-bid-dialog.png`
- `bid-condition-credit-window-preference-dialog.png`
- `bid-condition-reserve-preference-dialog.png`

放置路径：

`pbs-portal/public/help/screenshots/`

截图要求：

- 截图必须截弹窗本体或关键入口局部，不截整屏造成重点过小。
- 弹窗默认状态如果过空，可以在 mock 数据下选择代表性默认值后截图，但不能伪造不存在的 UI。
- 每张图都要有准确 `alt` 和 `caption`。
- 截图里不得出现 token、内部错误、数据库信息。
- 如果某个条件的弹窗需要特殊数据才能打开，必须在 screenshot mock 中补稳定数据。

## 文案要求

文案必须面向业务用户，而不是开发人员：

- 讲“什么时候用”，不是只讲字段名。
- `Award` 解释为 “I want this”。
- `Avoid` 解释为 “I do not want this”。
- `Tier / T1-T7` 解释为偏好优先级位置。
- 不使用旧术语 `Layer`。
- 不写隐藏或未开放条件。
- 不用身份标签或嘲讽性语言。

每个条件至少写到以下信息：

- 一个真实使用场景。
- 一个关键字段说明。
- 一个保存后的结果说明。
- 一个注意事项。

## 代码改动范围

预计修改：

- `pbs-portal/src/features/help/topics/bid-conditions/condition-help-data.ts`
  - 扩展每个条件的数据结构，增加 `openFrom`、`screenshot`、`fields`、`afterSaving`、`watchOut` 等字段。
- `pbs-portal/src/features/help/topics/bid-conditions/condition-reference.tsx`
  - 把条件卡片升级为完整说明块。
  - 每个条件渲染自己的 `HelpScreenshot`。
- `e2e/scripts/capture-pbs-portal-help-screenshots.ts`
  - 增加 3 张入口截图和 19 张条件弹窗截图。
- `e2e/scripts/pbs-portal-help-screenshot-mocks.ts`
  - 补齐打开各条件弹窗所需的稳定 mock 数据。
- `e2e/tests/pbs-portal/help/help-content-bid-conditions.spec.ts`
  - 验证 19 个条件都有详细说明和独立截图。
- `docs/test-cases/pbs/help/2026-07-31-pbs-portal-help-manual.md`
  - 更新人工测试用例。

不预计修改：

- `pbs-server`
- bid 保存 API
- bid property catalog
- 配置弹窗业务组件
- 数据库 schema

## 验收标准

1. `All Bid Conditions` 页面显示：
   - 右侧 `ADD BID PROPERTIES` 入口图。
   - `Days Off` 左侧日历入口图。
   - `Pairing` 左侧日历入口图。
2. 19 个可见条件全部有自己的详细说明块。
3. 19 个可见条件全部有自己的弹窗截图。
4. 每个条件说明块包含：
   - 用途。
   - 入口。
   - 字段说明。
   - 保存后结果。
   - 示例。
   - 注意事项。
5. Help 搜索能搜到代表性条件：
   - `Prefer Off`
   - `Pairing Preference`
   - `Work Day Preference`
   - `Mixed Line Bid`
   - `Reserve Preference`
6. 所有 Help 截图都能打开全屏预览。
7. Playwright 验证每张 Help 图片 `naturalWidth > 0`。
8. 不出现旧术语 `Layer`。
9. 不出现未开放条件。
10. `pnpm --dir pbs-portal build`、`npm run check:ui`、Help Playwright 测试通过。

## 测试计划

截图生成：

```bash
cd e2e && npx tsx scripts/capture-pbs-portal-help-screenshots.ts
```

自动化测试：

```bash
pnpm --dir pbs-portal build
npm run check:ui
cd e2e && npx playwright test -c config/playwright.config.ts --project=pbs-portal tests/pbs-portal/help/help-content-bid-conditions.spec.ts --reporter=list --no-deps
cd e2e && npx playwright test -c config/playwright.config.ts --project=pbs-portal tests/pbs-portal/help/ --reporter=list --no-deps
```

人工 QA：

- 打开 `Help > Bid Conditions`。
- 检查总览页三张入口图。
- 逐个检查 19 个条件：
  - 是否有独立弹窗截图。
  - 图片是否清晰。
  - 说明是否能看懂。
  - 点击图片是否能全屏预览并关闭。
- 搜索代表性条件，确认能跳到对应 Help topic。

## 风险与处理

| 风险 | 处理 |
| --- | --- |
| 19 张弹窗截图维护成本高 | 用统一截图脚本和 mock 数据生成，避免手工维护 |
| 某些弹窗需要复杂数据才能打开 | 在 screenshot mock 中补最小稳定数据 |
| Help 页面过长 | 分类页按条件卡片组织，总览只做入口导航 |
| 截图过大影响阅读 | 截弹窗局部，必要时限制截图元素宽高 |
| UI 之后变化导致截图过期 | Playwright 保证图片存在，人工 QA 检查视觉内容 |

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 虽然截图数量多，但代码集中在 Help 数据、截图脚本和测试，拆分多 agent 容易在同一数据结构和截图脚本上冲突。
- Suggested split: 不建议拆分。主 agent 顺序完成数据结构、截图生成、Help 渲染、测试。
- Write boundaries: 单 agent 修改 `pbs-portal/src/features/help`、`e2e/scripts`、`e2e/tests/pbs-portal/help`、`docs/test-cases/pbs/help`。
- Conflict risk: 中等。19 个截图和 19 个条件说明都依赖同一份 `condition-help-data.ts`。
- Execution gate: 用户确认本 spec 后再实现。

## 待确认

本 spec 已改为“每个条件独立弹窗截图 + 每个条件详细说明 + 左侧日历入口截图”。

确认后进入实现阶段。
