# PBS Portal Help 操作手册深化设计

> 日期：2026-06-17  
> 模块：`pbs-portal`  
> 范围：将已有 `/help` 从基础说明升级为详细用户操作手册，并补充内部业务方向审阅  
> 状态：已获用户确认并完成实施

## 1. 背景

当前 PBS Portal 已新增 `/help` 和第一版 Help Center，覆盖 `Dashboard`、`Days Off`、`Pairing`、`Line`、`Reserve`、`Tier`。第一版已经建立了路由、导航、topic registry、截图、E2E 回归和基础文章结构，但内容仍偏“功能概览”，不足以作为真实用户操作手册。

用户反馈希望 Help 更像完整操作手册：尽可能详细写清操作步骤、按钮、搜索框、tab、表格字段、弹窗、保存行为，并且通过写 Help 的过程反向检查当前 PBS 业务开发方向是否正确。

本次设计是在既有 Help 框架上深化内容和测试，不重新设计路由结构。

## 2. 目标

- 把 PBS Portal Help 升级成可交付给用户的详细操作手册。
- 每个已开发页面都要按真实 UI 写清楚用户如何操作。
- Help 内容必须逐项对照当前代码和真实界面，避免凭记忆描述。
- 增加更细的内容回归测试，防止按钮名、字段名、旧术语、未开发功能说明漂移。
- 生成一份内部业务方向审阅报告，用于判断当前 PBS Portal 功能和业务流程是否符合预期。
- 保持用户手册和内部审阅分离：Help 页面只服务最终用户，业务审阅报告只放在开发文档中。

## 3. 非目标

- 不开发 `Standing Bid`。
- 不为 `Standing Bid` 写用户操作手册。
- 不把内部业务审阅、技术债、接口缺口写进用户可见 Help 页面。
- 不重构 PBS Server API。
- 不重写 Help 路由、顶部导航或整体两栏布局。
- 不把 `pbs-portal` Help 和 `gantt` Help 抽象成共享组件库。
- 不在 Help 中承诺尚未落地的未来行为。

## 4. 内容深化原则

### 4.1 用户手册写作视角

Help 每篇文章要回答用户实际使用时的问题：

- 从哪里进入？
- 页面上有哪些区域？
- 先看哪里，再点哪里？
- 每个按钮会做什么？
- 搜索框能搜索什么？
- tab 会切换什么数据？
- 表格每列代表什么？
- tier 按钮如何影响当前 bid？
- 弹窗里每个字段怎么填？
- 保存、更新、删除后用户会看到什么变化？
- 哪些操作只是本地草稿状态，哪些会调用服务保存？
- 遇到空状态、加载失败、没有数据时应该怎么理解？

### 4.2 必须对照代码

每个 topic 修改前必须读取对应组件源码。优先读取：

- 页面入口：`pbs-portal/src/features/<feature>/pages/*.tsx`
- 右侧面板：`components/*right-panel*.tsx`
- 共享 Rule Bid：`pbs-portal/src/features/rule-bids/components/**`
- 弹窗：`components/*dialog*.tsx`
- hooks 和 service：`hooks/**`、`shared/services/**`
- 现有单元测试：`*.test.tsx`

Help 中的按钮名、标题、tab 名、字段名必须和 UI 一致。例如：

- `ADD DAYS OFF PROPERTIES`
- `ADD PAIRING PROPERTIES`
- `ADD LINE PROPERTIES`
- `ADD RESERVE BID`
- `ADD SHORT CALL TYPE`
- `EXISTING ... PROPERTIES`
- `ALL PROPERTIES`
- `FAVORITED PROPERTIES`
- `Search Properties`
- `BID SUMMARY`
- `TIER REVIEW`
- `T1-T7`
- `SEARCH PAIRINGS`
- `View Rules / View Properties`
- `View Pairing Set`

### 4.3 禁止内容

- Help 正文不得出现 Standing Bid 操作步骤。
- Help 正文不得把 `Layer / L1-L7` 当作 PBS Portal 当前业务术语。
- 不写“未来将支持”“计划支持”这类承诺。
- 不把内部实现细节写成用户动作，例如 query cache、mutation key、API route。
- 不写敏感账号、token、数据库连接串。

## 5. 建议的信息架构

保留当前 6 个分类和 29 个 topic，但每个 topic 从“短说明”扩写为“操作手册文章”。

每篇文章建议采用统一结构：

1. **Purpose**：这个页面/功能用来做什么。
2. **Before you start**：用户进入前需要确认什么，例如当前 bid period、active tier、mode。
3. **Screen layout**：页面区域说明。
4. **Steps**：编号步骤，按真实操作顺序写。
5. **Controls on this screen**：按钮、搜索框、tab、字段、图标含义。
6. **What changes after the action**：保存后、删除后、切换后发生什么。
7. **Notes / Warnings**：限制、易错点、空状态。

可在 `help-article.tsx` 上补充轻量组件来承载手册内容，例如：

- `HelpSection`
- `HelpControlTable`
- `HelpFieldTable`
- `HelpDoDont`
- `HelpOutcome`

如果现有 `HelpControlsRef` 足够，则优先复用，不为了样式新增组件。

## 6. 分模块深化范围

### 6.1 Dashboard

需要写清：

- Dashboard 是登录后的 review 起点。
- 左侧 profile / bid information / user information 的字段含义。
- `BIDDING CALENDAR` 的 month、tier row、day cell、calendar entry 怎么读。
- Pairing 和 Days Off calendar entry 打开后能看到什么。
- Dashboard 上哪些区域是只读，哪些操作会跳转到业务页面。
- Dashboard 与 `Days Off`、`Pairing`、`Tier` 数据之间的关系。

建议重点 topic：

- `Overview`：页面总览和只读定位。
- `Reading the bidding calendar`：tier matrix、month grid、entry 类型。
- `Viewing pairing and days-off entries`：如何打开 detail/popover，能看哪些信息。
- `User profile and bid period information`：字段说明与使用场景。

### 6.2 Days Off

需要写清：

- `EXISTING DAYS OFF PROPERTIES` 和 `ADD DAYS OFF PROPERTIES` 的区别。
- `ALL PROPERTIES` / `FAVORITED PROPERTIES` tab 的含义。
- `Search Properties` 搜索的是 available property 名称。
- 每行 property、bid、tiers 怎么读。
- 加号、编辑、删除、favorite、remove favorite 的行为。
- Days Off dialog 的字段和 `ADD BID` / `UPDATE BID` 行为。
- Calendar 上如何选 tier、如何添加 date-based days off。
- 保存后 Dashboard calendar 和 Tier summary 如何反映变化。

### 6.3 Pairing

需要写清：

- `EXISTING PAIRING PROPERTIES` 区域、pool count、rule count、pairing count。
- `REFRESH`、`VIEW RULES` / `VIEW PROPERTIES`、`SEARCH PAIRINGS` 的行为。
- `ADD PAIRING PROPERTIES` 下 `ALL PROPERTIES` / `FAVORITED PROPERTIES`。
- 搜索框能过滤哪些 pairing property。
- `Pairing Number` 和其他 configurable property 如何打开 `Configure Pairing Bid`。
- `Configure Pairing Bid` 中 action、bid value、date/time/range/tag/select 等控件怎么填。
- `Preview` 与 `SEARCH PAIRINGS` 的区别。
- `Search Pairings` 结果页能看到什么、如何回到 Pairing。
- favorite 保存的是配置后的 property 模板，不等同于当前 draft row。

### 6.4 Line

需要写清：

- Line 使用 shared Rule Bid 面板，但字段和 property catalog 属于 line bid。
- `EXISTING LINE PROPERTIES` 和 `ADD LINE PROPERTIES`。
- 哪些 line property 是直接添加，哪些会打开配置弹窗。
- `Reserve / Flying Date Pattern`、`Commuter Pattern`、`Most Flying In Least Days` 等复杂 property 的可见控件。
- `T1-T7` 的启用/禁用如何影响该 line bid。
- favorite 与 existing row 的区别。
- `ADD MORE PROPERTIES`、`Cancel`、`Reset All` 的含义。

### 6.5 Reserve

需要写清：

- `Legacy Reserve` / `AA Prefer Off` mode toggle 的差异。
- mode 切换后 visible properties 为什么会变。
- `ADD SHORT CALL TYPE` 的入口和弹窗字段。
- `RESERVE COVERAGE` calendar 的 `Need` / `Off` 信息怎么读。
- 点击 calendar date 后会出现什么 action。
- `ADD RESERVE BID` 的含义。
- `EXISTING RESERVE PROPERTIES` 的 property、bid、tiers 如何理解。
- Short Call Type 的 call type、date scope、tier selection 如何配置。

### 6.6 Tier

需要写清：

- Tier 是 review 页面，不是所有 bid 的原始编辑入口。
- `PAIRING POOLS` 表格中 package total、Total Pairings、Pairings by Tx、Pool Graph 如何读。
- `TIER REVIEW` warnings 的含义。
- `BID SUMMARY` 按 T1-T7 分组。
- Summary row 上的 bid type badge、description、tier chips、action buttons。
- `View Pairing Set` 打开什么、能看什么。
- Detail dialog 中 `Action`、`Label`、`Conditions`、`Review Reasons`。
- 哪些 item 可以 `Edit Tx` / `Delete Bid`，哪些是 review-only。

## 7. 内部业务方向审阅报告

新增一份内部开发文档，不放进 Help 页面：

```text
docs/modules/pbs/2026-06-17-pbs-portal-business-direction-review.md
```

报告建议结构：

- 当前已开发功能地图。
- 当前用户操作流是否完整。
- 页面间数据闭环：
  - Dashboard review
  - Days Off / Pairing / Line / Reserve edit
  - Tier summary review
- 命名一致性问题：
  - Tier vs old Layer
  - Reserve mode naming
  - ADD RESERVE BID vs ADD RESERVE PROPERTIES
- 业务缺口：
  - Standing Bid 未开发。
  - 提交/最终 bid submission 是否缺位。
  - 保存后用户是否有足够反馈。
  - Dashboard 和 edit pages 的数据刷新是否清晰。
- 需要产品/业务确认的问题。
- 建议优先级。

这份报告允许指出问题，但不直接改业务行为。若发现 UI 文案明显错误，只在报告中列出，除非用户另行确认修复。

## 8. 截图策略

保留当前 Overview 截图，并按需要增加更细截图：

- 页面 Overview：保留当前 6 张。
- 复杂弹窗：新增 dialog 截图，例如 `Configure Pairing Bid`、`Short Call Type`、Tier detail。
- 关键状态：Pairing `View Rules`、Search Pairings、Reserve calendar popover、Dashboard entry popover。

新增截图必须满足：

- 来自真实 Portal UI。
- 截图区域覆盖文章中提到的控件。
- 每个 `HelpScreenshot` 都有 E2E 加载测试。
- 截图脚本失败不能静默接受；缺失图片不得被文章引用。

## 9. 自动化测试策略

在现有 `e2e/tests/pbs-portal/help/` 上深化：

- 每个模块至少一条 content spec，断言详细手册中的关键按钮/字段/步骤。
- 增加负向断言：
  - 不出现 `Standing Bid` 操作步骤。
  - 不使用旧 `Layer` 业务术语。
  - Reserve 不再写 `ADD RESERVE PROPERTIES`。
- 截图 spec 更新为按文章统计图片数量，而不是只测 overview。
- 搜索测试覆盖：
  - 输入 `pairing` 能看到 pairing 相关 topic。
  - 输入 `reserve` 能看到 reserve 相关 topic。
  - 输入不存在关键字时不显示无关 topic。

Portal 单元测试继续覆盖：

- `/help` route。
- 顶部导航 `Help` 高亮。
- 缩窄 viewport 下 `Help` overflow 行为。

## 10. 实施边界

允许修改：

- `pbs-portal/src/features/help/**`
- `pbs-portal/public/help/screenshots/**`
- `e2e/scripts/capture-pbs-portal-help-screenshots.ts`
- `e2e/tests/pbs-portal/help/**`
- `docs/test-cases/pbs/help/**`
- `docs/modules/pbs/**`
- `.agents/skills/portal-help-writing/**`，如需要同步写作规范

原则上不修改：

- `pbs-server/**`
- `sql/**`
- 业务页面行为代码
- API contract

如果在核对 Help 时发现业务页面文案明显错误，应先记录在业务审阅报告中，不在本任务内直接修改，除非用户再次确认。

## 11. 验收标准

完成后应满足：

- Help 文章从“概览说明”升级为“操作手册”。
- 每个已开发模块至少覆盖入口、区域、按钮、搜索、tab、tier、弹窗、保存/删除结果。
- 关键 UI 文案与当前 Portal 完全一致。
- Help 不描述 Standing Bid 操作。
- Help 不使用 Layer 作为 PBS 当前业务术语。
- 内部业务方向审阅报告已生成，并明确列出当前方向判断与待确认问题。
- E2E Help 测试通过。
- `pbs-portal` build 通过。
- 必要截图已重新采集并人工检查。

建议运行：

```bash
cd pbs-portal
npm test -- src/app/layout/dashboard-top-nav.test.tsx src/app/router/app-routes.test.tsx
npm run build
```

```bash
cd e2e
npx playwright test -c config/playwright.config.ts --project=pbs-portal tests/pbs-portal/help/ --reporter=list --no-deps
```

## 12. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本任务核心是同一套 Help 信息架构、业务术语和写作风格一致性。多个 agent 并行容易产生不同粒度、不同术语和重复 topic。
- Suggested split: 不建议并行拆分。主 agent 应按模块顺序读取代码、扩写 Help、更新测试，并最终写业务方向审阅报告。
- Write boundaries: 主要集中在 `pbs-portal/src/features/help/**`、`e2e/tests/pbs-portal/help/**`、Help 截图和文档。
- Conflict risk: 中等。Help registry、topic map、截图测试都属于共享文件，并行编辑冲突概率较高。
- Execution gate: 用户 review 本 spec 并明确批准实施后再开始改 Help 内容。

## 13. 关键假设

- 当前第一版 `/help` 框架保留，不推倒重建。
- 用户希望详细度接近“测试人员可照着走”的操作手册，而不是市场/介绍页面。
- Help 面向最终 Portal 用户，内部业务判断另写开发文档。
- 当前已开发页面以实际代码为准；若业务行为本身不完整，Help 只描述已实现行为，并在内部审阅报告中记录缺口。
