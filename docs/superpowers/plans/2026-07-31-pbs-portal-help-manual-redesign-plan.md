# PBS Portal Help 通用操作手册实施计划

## 目标

按已批准的设计，将当前早期 Help 改为所有机组人员通用的 PBS Portal 操作手册。只修改 Help 内容、Help 截图及其测试，不修改业务页面、服务契约或业务逻辑。

设计依据：

- `docs/superpowers/specs/2026-07-31-pbs-portal-help-manual-redesign.md`

## 实施步骤

### 1. 核对当前 Portal

- 以当前 Dashboard、Bid、Reserve、Standing Bid、Award 页面和相关测试为准，提取真实英文标题、按钮、字段和操作结果。
- 标记现有 Help 中已经失效的术语和流程：
  - 独立 Days Off / Pairing / Line / Tier 页面说明。
  - `Line` 用户术语，统一替换为当前 `Roster`。
  - 尚未覆盖的 Standing Bid、Award。
  - 与当前 Favorite、Tier 和 Bid 汇总行为不一致的描述。

验证：形成实现使用的准确标签清单，Help 不自行发明业务行为。

### 2. 重建 Help 信息架构

- 更新 `help-data.ts`：
  - Quick Start
  - Dashboard
  - Bid
  - Reserve
  - Standing Bid
  - Award
  - Common Questions
- 更新 `help-view.tsx` topic map。
- 更新 `help-home.tsx` 首页文案和分类入口。
- 仅在现有组件不能清楚表达已批准内容时，对 Help 本地组件做最小扩展。

验证：所有 registry topic 都能加载；topic map 无缺项；搜索和折叠仍可用。

### 3. 编写通用操作文章

- Quick Start：Portal 概览、开始前检查、完成一次 Bid。
- Dashboard：页面用途、周期/个人信息、Bidding Calendar。
- Bid：统一工作区、添加条件、Tier、Existing Bid、Favorite、Search Pairings。
- 新增 `Use the Bidding Calendar`：说明左侧共享日历用途、`T1–T7`、日期/星期/Pairing 操作、收起展开，以及 Dashboard / Bid / Reserve 的操作边界。
- Reserve：Reserve Preference、日期范围、Tier、维护已有条件。
- Standing Bid：长期兜底关系、添加/编辑/删除、Tier 筛选、不可用的特定日期类条件。
- Award：结果发布后查看、日历、Roster Details、Selected Duty。
- Common Questions：按钮不可用、保存确认、Current/Standing 选择、加载/保存失败后的处理。

验证：产品 Help 使用简单英文；不含身份标签、岗位拆分、`Layer`、算法或投标策略。

### 4. 更新安全截图

- 将截图脚本从真实 crew 数据改为：
  - 测试身份。
  - 合成 API 响应。
  - 真实 Portal 组件和布局。
- 只截当前正式页面：Dashboard、Bid、Reserve、Standing Bid、Award。
- 删除 Help 不再引用的早期独立页面截图。
- 逐张检查不存在真实姓名、员工号、排班或 Award 数据。

验证：每个 HelpScreenshot 对应一个存在且尺寸有效的 PNG；截图内容与当前页面一致。

### 5. 更新自动化与 QA

- 更新 Help Playwright：
  - 首页和七类目录。
  - Topic 导航与搜索。
  - 关键文章文案。
  - 禁止术语和身份标签。
  - 截图数量及图片尺寸。
- 更新 `docs/test-cases/pbs/help/`：
  - 测试账号和前置数据。
  - 操作步骤。
  - 可观察成功结果。
  - 常见异常与恢复。

验证：

```bash
cd e2e
npx playwright test -c config/playwright.config.ts --project=pbs-portal tests/pbs-portal/help/ --reporter=list --no-deps
```

### 6. 交付验证

按从小到大的顺序运行：

```bash
cd pbs-portal
npm test -- --run
npm run lint
npm run build
```

如 Help 样式有改动，在仓库根运行：

```bash
npm run check:ui
```

最后运行：

```bash
node .gitnexus/run.cjs detect-changes --scope all
git diff --check
git status --short
```

## 影响分析

GitNexus 对 `HelpHome`、`HelpNav`、`HelpView` 的 upstream 影响分析均为 LOW：

- `HelpHome` 和 `HelpNav` 只被 `HelpView` 直接使用。
- `HelpView` 只被 `HelpPage` 直接使用。
- 未发现跨业务流程或后端影响。

## Git 边界

- 本次修改完成后保持未提交状态。
- 只有用户在当前开发阶段明确要求提交时，才执行 `git commit`。
