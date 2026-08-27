# PBS Portal Help Bid Conditions Reference 设计说明

## 背景

用户反馈 PBS Portal 里的 bid 条件很多，但 Help 目前主要覆盖页面流程和少量重点功能，没有把每一个可配置的 bid 条件解释清楚。这样用户在配置条件时，需要靠试错理解字段、开关、Award/Avoid 含义、Tier 作用范围、Standing Bid 与 Current Bid 的差异。

本需求目标是让 Help 成为 bid 条件的可读参考手册：用户能在 Help 里找到当前 Portal 页面上能看到、能添加、能配置的每一个 bid 条件，并理解它的用途和主要配置方式。

## 目标

- 在 PBS Portal Help 中新增或扩展一个专门的 `Bid Conditions` 参考区域。
- 覆盖当前 Portal 可见、可添加、可配置的 bid 条件。
- 按用户心智分组，而不是让用户在一个超长列表里找条件。
- 每个条件都给出简明解释：它控制什么、主要字段是什么、保存后影响哪个 bid。
- 加测试防止后续新增可见 bid 条件时 Help 遗漏。

## 范围

### 包含

只包含当前 Portal 里真实可见、可添加、可配置的 bid 条件：

- Current Bid 里的 Days Off 条件。
- Current Bid 里的 Pairing 条件。
- Current Bid 里的 Roster / Line 条件。
- Reserve 页面里可见的 Reserve 条件。
- Standing Bid 页面里可见的 Standing Lineholder / Standing Reserve 条件。

### 不包含

- 数据库或 contracts 中存在，但 Portal 当前隐藏的条件。
- 没有 editor、不能添加、不能配置的半成品条件。
- import-only、algorithm-only、CSV 内部字段、后端兼容字段。
- 这次不新增 bid 条件，不改变 bid 保存逻辑，不改变 CSV 生成逻辑。
- 这次不修改条件 visibility 配置，不做数据库 migration。

## Source of Truth

Help 的覆盖范围不能靠前端手写猜测，必须对齐当前系统实际展示逻辑。

当前可见条件的 source of truth：

- `pbs-server/src/services/lineholder/property-catalog.ts`
- 数据库表 `pbs_bid_property_context`
- context 包括：
  - `Current`
  - `StandingLineholder`
  - `StandingReserve`

`pbs_bid_property_context` 是 Portal 条件目录显示的唯一数据源；`pbs_bid_property.is_visible_in_portal` 只作为历史兼容字段，不作为本次 Help 覆盖判断依据。

contracts 和 editor 负责补充说明：

- `packages/contracts/pbs-days-off-bids.js`
- `packages/contracts/pbs-pairing-bids.js`
- `packages/contracts/pbs-line-bids.js`
- `packages/contracts/pbs-reserve-bids.js`
- `packages/contracts/pbs-standing-bids.js`
- `pbs-portal` 中对应 bid editor 组件

## Help 信息架构

推荐新增一个顶层 Help 分类：

- `Bid Conditions`

分类下建议放这些 topic：

- `All Bid Conditions`
- `Days Off Conditions`
- `Pairing Conditions`
- `Roster / Line Conditions`
- `Reserve Conditions`
- `Standing Bid Conditions`

设计原因：

- 用户如果只想查某个条件，可以先进 `All Bid Conditions`。
- 用户如果正在某个页面配置，可以进入对应分组。
- Standing Bid 会复用很多 Current Bid 条件，但使用场景不同，需要单独解释适用范围，避免用户误解。

## 每个条件的说明结构

每个 bid 条件在 Help 里至少包含这些字段：

- `Condition`：Portal 中显示的条件名称。
- `Available in`：出现在哪个页面或上下文，例如 Current Bid、Reserve、Standing Bid。
- `Purpose`：这个条件解决什么问题。
- `Main controls`：用户需要配置的主要字段。
- `Tier behavior`：T1-T7 如何影响条件生效范围。
- `Preference behavior`：Award / Avoid / Reserve Only / Pairing Only 等偏好开关的含义。
- `Date or time scope`：如果该条件支持日期、周几、时间窗口，需要说明为空时的行为。
- `Notes`：重要边界，例如是否只影响筛选、是否只影响偏好排序、是否不会改变保存后的 CSV 逻辑。

文案风格：

- UI 文案保持英文，和产品页面一致。
- 解释文字要短、直接、面向 crew 用户。
- 不使用旧称 `Layer`，统一使用 `Tier` / `T1-T7`。
- 不暴露数据库字段、内部 exception、算法细节。

## 数据组织方案

实现时建议新增一个 Help 专用的数据文件，例如：

- `pbs-portal/src/features/help/topics/bid-conditions/condition-help-data.ts`

它不作为业务逻辑 source of truth，只保存面向用户的说明文案，key 需要能和真实可见 catalog 对齐：

- `context`
- `propertyCode`
- `name`
- `bidType`

Help 页面渲染时使用这份静态说明数据，避免 Help 页面运行时依赖当前登录用户、API 状态或数据库连接。

测试层负责把静态说明数据和可见 catalog fixture 对齐：

- 如果一个条件在 Portal 可见，但没有 Help 文案，测试失败。
- 如果 Help 写了一个当前不可见条件，测试失败或显式标记为 excluded。

## UI 设计原则

- 复用现有 Help 组件和样式，不引入新的 UI 框架。
- 以表格、短卡片、分组索引为主，不做大段说明文字。
- 不为每一个条件都截屏，避免 Help 维护成本过高。
- 复杂条件可以补一个真实 Portal 截图，但截图必须来自实际页面。
- `All Bid Conditions` 提供快速索引，分组 topic 提供详细解释。
- Help 搜索至少能搜到代表性条件名称，例如：
  - `Pairing Preference`
  - `Work Day Preference`
  - `Flight Number Preference`
  - `Credit Window Preference`
  - `Reserve Preference`
  - `Day of Week Off`

## 实施计划

1. 梳理当前可见 catalog
   - 从 `property-catalog.ts`、contracts、editor registry 和现有 API 响应确认实际可见条件。
   - 只把可添加、可配置、有 editor 的条件纳入 Help。

2. 建立 Help 条件说明数据
   - 新增 `condition-help-data.ts`。
   - 为每个可见条件补齐用户说明。
   - Standing Bid 复用条件需要说明它在 Standing 上下文里的含义。

3. 新增 Help topic
   - 更新 `pbs-portal/src/features/help/help-data.ts`。
   - 更新 `pbs-portal/src/features/help/components/help-view.tsx`。
   - 新增 `bid-conditions` topic 组件。

4. 加覆盖测试
   - 新增 Help content coverage 测试。
   - 确认可见条件和 Help 文案一一对应。
   - 更新 Playwright Help 测试，覆盖新分类、新 topic、搜索和代表性条件内容。

5. 更新人工 QA 文档
   - 更新 `docs/test-cases/pbs/help/` 下 Help 相关测试说明。

## 验收标准

- Help 中能看到 `Bid Conditions` 分类。
- 每一个当前 Portal 可见、可添加、可配置的 bid 条件都有说明。
- 隐藏条件、未实现条件、内部条件不会出现在 Help。
- `Days Off`、`Pairing`、`Roster / Line`、`Reserve`、`Standing Bid` 分组都能打开并显示内容。
- Help 搜索能找到代表性 bid 条件。
- 文案统一使用 `Tier`，不得出现旧 `Layer` 术语。
- 后续新增可见 bid 条件但未补 Help 时，测试能失败提醒。

## 验证计划

实现完成后至少运行：

```bash
pnpm --dir pbs-portal build
npm run check:ui
npx playwright test -c config/playwright.config.ts --project=pbs-portal tests/pbs-portal/help/ --reporter=list --no-deps
```

如果新增或修改了 Help 数据覆盖测试，还需要运行对应 Vitest 或测试脚本。

如 touched-area 里存在已知 unrelated 失败，需要在最终交付中明确说明失败用例、失败原因、是否与本次改动相关。

## 风险与处理

- 可见 catalog 可能随环境不同而不同：以 `pbs_bid_property_context` 和当前应用实际返回为准，测试 fixture 需要明确来源。
- 条件数量较多导致 Help 过长：用分类和索引降低阅读负担，不做一个条件一个 topic 的碎片化结构。
- Standing Bid 与 Current Bid 有重复条件：说明数据可以复用，但展示必须标明上下文差异。
- 有些条件名称类似但行为不同：以 editor 的真实配置字段和 contracts payload 为准，不靠名称推断。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次主要是 Help 信息架构、文案、topic map 和覆盖测试，文件集中且一致性要求高，多 agent 并行容易造成术语和结构不一致。
- Suggested split: 不建议拆分；由一个实现者完成数据梳理、Help 更新和测试。
- Write boundaries: 单人集中修改 `pbs-portal/src/features/help/**`、`e2e/tests/pbs-portal/help/**`、`docs/test-cases/pbs/help/**`。
- Conflict risk: 中等，主要风险是 topic registry、Help 数据和测试 fixture 不一致。
- Execution gate: 用户确认本 spec 后才进入实现。

## 待确认

当前范围已经按用户确认理解为：只覆盖当前 Portal 可见、可添加、可配置的 bid 条件。

如果确认这个 spec，下一步进入实现阶段。
