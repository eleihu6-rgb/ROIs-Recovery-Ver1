# PBS Portal Help Center 设计说明

> 日期：2026-06-16
> 模块：`pbs-portal`
> 范围：新增 PBS Portal 顶部导航 `Help` 与 `/help` 操作手册页面
> 状态：设计已由用户确认，等待实现计划与实施

## 1. 背景

`gantt` 模块已经有一套成熟的 in-app Help Center：顶部导航进入、左侧分类树、搜索、文章懒加载、步骤式操作说明、截图、控件说明表，以及对应的 Help 专项 Playwright 回归测试。用户希望在 `pbs-portal` 中复刻同等级别的操作手册能力。

本次目标不是开发 `Standing Bid`，也不是把 Help 放在某个右侧业务面板里，而是在 `pbs-portal` 顶部导航新增独立 `Help` 入口，打开一个全站操作手册页面。

## 2. 目标

- 在 PBS Portal 顶部导航新增 `Help`。
- 新增受登录保护的 `/help` 路由。
- 建立 Portal 专用 Help Center 框架，行为与 `gantt` Help 尽量一致。
- 第一版 Help 内容覆盖当前已经开发并可验证的功能：
  - `Dashboard`
  - `Days Off`
  - `Pairing`
  - `Line`
  - `Reserve`
  - `Tier`
- 建立截图采集、内容回归测试、QA 测试案例和 Portal Help 写作规范。
- 保证 Help 文案与当前 UI 和代码一致，不描述未开发功能。

## 3. 非目标

- 不开发 `Standing Bid` 页面。
- 不为 `Standing Bid` 编写 Help topic。
- 不把 `gantt` 的 Live / Scenario / Legality / R'Bot 内容复制到 Portal。
- 不改 PBS Server API contract。
- 不把 Help 组件抽到 `packages/ui`。
- 不重构 `PairingRightPanel` 或 `RuleBidRightPanel` 的业务行为。
- 不把 Help 放进共享 `BIDDING CALENDAR` 工作台布局。

## 4. 当前代码基础

### 4.1 Gantt Help 参考实现

参考文件：

- `gantt/src/components/help/help-data.ts`
- `gantt/src/components/help/help-view.tsx`
- `gantt/src/components/help/help-article.tsx`
- `gantt/src/components/help/topics/**`
- `gantt/public/help/screenshots/*.png`
- `e2e/tests/gantt/help/*.spec.ts`
- `e2e/scripts/capture-help-screenshots.ts`
- `.agents/skills/online-help-writing/SKILL.md`

可复刻的能力：

- topic 注册表。
- lazy topic map。
- Help 首页和左侧导航。
- 搜索过滤。
- article shell。
- `HelpStep` / `HelpNote` / `HelpTip` / `HelpWarning` / `HelpScreenshot` / `HelpControlsRef`。
- screenshot loaded + width guard。
- 内容回归测试：断言关键文案出现或不出现。

### 4.2 PBS Portal 现状

当前已落地页面和功能集中在：

- `pbs-portal/src/features/dashboard/`
- `pbs-portal/src/features/days-off/`
- `pbs-portal/src/features/pairing/`
- `pbs-portal/src/features/line/`
- `pbs-portal/src/features/reserve/`
- `pbs-portal/src/features/tier/`

当前导航项定义在：

- `pbs-portal/src/shared/constants/top-nav-items.ts`

当前路由定义在：

- `pbs-portal/src/app/router/app-routes.tsx`

`Standing Bid` 当前仍是保留入口，不是已开发页面；Help 第一版不得写入 Standing Bid 操作说明。

## 5. 页面与路由设计

### 5.1 顶部导航

在 PBS Portal 顶部导航中新增：

```ts
{ key: "help", label: "Help", path: "/help" }
```

建议放在 `Standing Bid` 之后，作为全站帮助入口。

### 5.2 路由

新增受保护路由：

```tsx
<Route path="/help" element={renderLazyRoute(HelpPage)} />
```

该路由应放在 `ProtectedRoute` + `MainLayout` 下，但不放在 `SharedBiddingWorkbenchLayout` 下。

原因：

- Help 是全站操作手册，不属于某个 bidding workbench 页面。
- 不需要左侧 `BIDDING CALENDAR`。
- 需要完整内容宽度展示左侧 Help 导航和右侧文章。

### 5.3 页面布局

`/help` 页面采用两栏结构：

- 左侧固定宽度：分类导航和搜索。
- 右侧自适应：Help 首页或文章内容。

行为对齐 Gantt Help：

- 首次进入显示 Help Center 首页。
- 点击分类卡片进入该分类第一个 topic。
- 点击左侧 topic 切换文章。
- 搜索时只显示 title 匹配的 topic，并自动展开匹配分类。
- 切换 topic 后右侧内容滚动回顶部。

## 6. 目录结构

建议新增：

```text
pbs-portal/src/features/help/
├── components/
│   ├── help-article.tsx
│   ├── help-home.tsx
│   ├── help-nav.tsx
│   └── help-view.tsx
├── topics/
│   ├── dashboard/
│   ├── days-off/
│   ├── pairing/
│   ├── line/
│   ├── reserve/
│   └── tier/
├── help-data.ts
├── help-page.tsx
└── use-portal-help-examples.ts
```

暂不抽到 `packages/ui`。Help 组件先作为 `pbs-portal` feature local 实现，避免让 Portal 和 Gantt 在内容、视觉、路由上下文尚未稳定时提前耦合。

## 7. 第一版内容范围

第一版 Help 分类：

```text
Dashboard
Days Off
Pairing
Line
Reserve
Tier
```

建议 topic：

### 7.1 Dashboard

- `Overview`
- `Reading the bidding calendar`
- `Viewing pairing and days-off entries`
- `User profile and bid period information`

### 7.2 Days Off

- `Overview`
- `Adding days-off bids`
- `Editing and deleting existing days-off bids`
- `Calendar interactions and tier selection`
- `Favorites`

### 7.3 Pairing

- `Overview`
- `Adding pairing properties`
- `Configuring Pairing Number and pairing conditions`
- `Previewing and searching pairings`
- `Favorites and available properties`
- `Pool counts and current rules search`

### 7.4 Line

- `Overview`
- `Adding line properties`
- `Editing configured line bids`
- `Favorites and tier selection`

### 7.5 Reserve

- `Overview`
- `Switching reserve mode`
- `Adding reserve bids`
- `Short call type configuration`
- `Reserve coverage calendar`

### 7.6 Tier

- `Overview`
- `Reading bid summary by tier`
- `Opening bid details`
- `Editing tier assignments`
- `Viewing pairing set previews`

## 8. 内容写作规则

- 每个 topic 写作前必须读取对应 UI 组件源码。
- Help 文案中的按钮、字段、菜单、状态名必须匹配当前 UI。
- 可以参考 `docs/test-cases/pbs/**` 和历史 spec，但最终以当前代码为准。
- 不描述未实现功能。
- 如果某个入口只有部分实现，topic title 或首段必须标注 `Partial`。
- PBS Portal 业务术语统一使用 `Tier / Tiers / T1-T7`。
- 不新增 `Layer / Layers / Lx` 作为 PBS 业务术语。
- 页面 UI 文案保持英文。
- 面向用户的开发文档、spec、QA 说明使用简体中文。
- 不记录数据库密码、Token、生产账号或其它敏感信息。

## 9. 截图设计

新增目录：

```text
pbs-portal/public/help/screenshots/
```

新增采集脚本：

```text
e2e/scripts/capture-pbs-portal-help-screenshots.ts
```

截图规则：

- 使用真实 Portal 页面和真实 UI 状态采集。
- 需要登录态，通过现有 PBS Portal E2E auth helper 进入页面。
- 只截文章实际说明的区域，不使用手工拼图。
- 截图后必须人工检查 PNG 是否正确。
- `HelpScreenshot` 需要按 Vite `base` 解析资源路径，确保 `/fpqe/pbs/help` 下不会 404。
- 对交互面板、弹窗、下拉菜单，需要优先用稳定 `data-testid` 定位真实元素。

## 10. 自动化测试设计

新增 Portal Help 专项 E2E：

```text
e2e/tests/pbs-portal/help/help-navigation.spec.ts
e2e/tests/pbs-portal/help/help-screenshots.spec.ts
e2e/tests/pbs-portal/help/help-content-dashboard.spec.ts
e2e/tests/pbs-portal/help/help-content-rule-bids.spec.ts
e2e/tests/pbs-portal/help/help-content-tier.spec.ts
```

测试覆盖：

- 顶部导航显示 `Help`。
- 点击 `Help` 进入 `/help`。
- Help Center 首页渲染。
- 左侧分类包含 `Dashboard / Days Off / Pairing / Line / Reserve / Tier`。
- 搜索可过滤 topic，清空后恢复。
- active topic 高亮。
- topic lazy load 成功。
- 所有截图真实加载。
- 图片 `naturalWidth >= 200px`。
- 不出现截图 404。
- 内容测试断言关键 UI 文案，例如：
  - `ADD PAIRING PROPERTIES`
  - `EXISTING DAYS OFF PROPERTIES`
  - `T1`
  - `T7`
  - `Pairing Number`
  - `Reserve`
  - `Short Call Type`
- 内容测试断言不出现不应写入的功能或旧词：
  - 不出现 Standing Bid 操作步骤。
  - 不新增 `Layer / Layers / Lx` 作为 PBS 业务术语。

## 11. QA 测试案例

新增人工测试文档：

```text
docs/test-cases/pbs/help/2026-06-16-pbs-portal-help-center.md
```

内容至少包含：

- 前置条件。
- 顶部导航进入 Help。
- 分类和搜索。
- 逐模块 topic 打开。
- 截图加载。
- 未开发功能不出现。
- 关键 UI 文案与实际页面一致。
- 回归范围。

## 12. Portal Help Skill

新增 Portal Help 写作 skill：

```text
.agents/skills/portal-help-writing/SKILL.md
```

该 skill 行为对齐 Gantt `online-help-writing`，但限定在 `pbs-portal`：

- 触发条件：用户提到 PBS Portal Help、帮助页、操作手册、Help topic、Help 截图、Help 反馈。
- 写 Help 前必须读取对应 UI 组件。
- 新增 topic 必须同步：
  - `help-data.ts`
  - `help-view.tsx`
  - topic `.tsx`
  - screenshot
  - E2E content test
  - QA 测试案例
- 禁止凭记忆写 Help。
- 禁止描述 `Standing Bid` 等未开发功能。
- 如果 UI 和 Help 不一致，先以 UI 代码为准；若 UI 明显错误，必须回到需求确认后再改代码。
- 截图必须从真实页面采集并人工确认。
- 每次 Help 修改必须有测试回执。

## 13. 实施建议

建议按以下顺序实现：

1. 新增 `/help` 路由和顶部导航项。
2. 新增 Help 框架组件和空 topic 注册表。
3. 迁移并适配 Gantt Help article primitives。
4. 补第一批 topic 内容。
5. 新增截图目录和截图采集脚本。
6. 采集并确认截图。
7. 新增 Help E2E。
8. 新增 QA 测试案例。
9. 新增 `portal-help-writing` skill。
10. 跑验证并修复问题。

## 14. 验收标准

- `http://localhost:3030/fpqe/pbs/help` 能打开 Help Center。
- 顶部导航显示 `Help`，点击后 active 状态正确。
- 未登录访问 `/help` 会进入现有登录保护流程。
- Help 左侧分类包含 `Dashboard / Days Off / Pairing / Line / Reserve / Tier`。
- Help 搜索可用。
- 每个第一版 topic 可以打开。
- 文章内截图真实加载，无 404。
- Help 内容不描述 Standing Bid。
- Help 内容不新增 PBS 业务旧词 `Layer / Layers / Lx`。
- 新增 E2E 通过。
- 新增 QA 测试案例。
- 新增 Portal Help skill。

## 15. 风险与规避

| 风险 | 影响 | 规避 |
| --- | --- | --- |
| Help 内容与 UI 漂移 | 用户按手册操作失败 | 写作前读对应组件；内容回归测试断言关键文案 |
| 截图采集不稳定 | 测试偶发失败或截图错误 | 用真实 `data-testid` 定位；人工确认 PNG |
| 内容范围过大 | 第一版拖长 | 第一版覆盖基础操作流程，不做每个 property 的规则字典 |
| 旧术语混入 | 与 PBS Tier 术语规范冲突 | E2E 断言不新增 `Layer / Lx` 业务词 |
| Help 页面误进工作台布局 | 浪费空间且产生无关日历 | `/help` 只挂 `MainLayout`，不挂 `SharedBiddingWorkbenchLayout` |

## 16. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 首轮改动集中在导航、路由、Help 框架、内容、截图和测试。多个 agent 容易同时修改路由、导航和 Help 注册表，协调成本高于收益。
- Suggested split: 暂不拆分；由主 agent 顺序实现。
- Write boundaries: 后续实现集中在 `pbs-portal/src/features/help/`、`pbs-portal/src/app/router/app-routes.tsx`、`pbs-portal/src/shared/constants/top-nav-items.ts`、`e2e/tests/pbs-portal/help/`、`e2e/scripts/`、`docs/test-cases/pbs/help/`、`.agents/skills/portal-help-writing/`。
- Conflict risk: 中等，主要来自路由、导航、截图脚本和测试配置。
- Execution gate: 必须在用户 review 本 spec 并批准进入 implementation plan 后，才能开始写实现代码。

## 17. 用户确认记录

- 用户确认新增独立 `Help` 路由页面，而不是 Standing Bid 右侧 Help。
- 用户确认第一版覆盖已开发功能：`Dashboard / Days Off / Pairing / Line / Reserve / Tier`。
- 用户确认不写未开发的 `Standing Bid`。
- 用户确认采用“完整框架 + 已开发功能基础手册”的方案 A。
