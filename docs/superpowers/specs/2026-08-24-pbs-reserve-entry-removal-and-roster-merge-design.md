# PBS Portal Reserve 入口移除与 Roster 合并设计

## 背景

当前 PBS Portal 中存在两个容易让用户误解的 Reserve 入口：

- 顶部导航的独立 `Reserve` 页面。
- `Standing Bid` 的属性分类 tab：`RESERVE`。

实际产品方向已经变化：当前 Reserve 页面能够配置的核心能力已经可以由 `Bid` 页面中的条件覆盖；`Standing Bid > RESERVE` 下员工侧实际只需要保留 `Reserve Preference` 这一类条件。因此独立 Reserve 页面和独立 Reserve 分类会制造重复入口，也会让用户误以为 Reserve 是一个和 Bid 并列的完整工作台。

## 目标

- 从员工端顶部导航完整移除 `Reserve` tab。
- 移除 `/reserve` 前端页面入口；直接访问 `/reserve` 应进入 404，而不是重定向到 `/bid`。
- 移除 `Standing Bid` 中的独立 `RESERVE` 分类 tab。
- 将原本显示在 `Standing Bid > RESERVE` 下的 `Reserve Preference` 显示到 `ROSTER` 分类下。
- 同步更新 Help，不能再指导用户打开 Reserve 页面或 Reserve 分类。
- 优化共享 `BIDDING CALENDAR` 底部 `requested/max` capacity badge 的视觉精致度，但不改变业务含义和计算逻辑。

## 非目标

- 不删除后端 `reserve` API、contract、draft mapper 或数据库结构。
- 不删除内部 `sourceContext: "reserve"` / `StandingReserve` draft 语义。
- 不改变 Reserve Preference 的保存格式、算法输入、CSV/后续 draft 逻辑。
- 不改变左侧日历上的 `Off` 事件含义。
- 不改变 `requested/max` 的计算公式和颜色规则。
- 不新增数据库 migration。

## 现有结构判断

当前相关入口和代码位置：

- 顶部导航来自 `pbs-portal/src/shared/constants/top-nav-items.ts`。
- `/reserve` route 来自 `pbs-portal/src/app/router/app-routes.tsx`。
- 登录后安全返回路径包含 `/reserve`：`pbs-portal/src/app/router/auth-return-to.ts`。
- 旧路径 `/portal/calendar` 当前会被映射到 `/reserve`：`pbs-portal/src/app/router/legacy-route-redirects.tsx`。
- `Standing Bid` 分类由 `pbs-portal/src/features/standing-bid/standing-bid-draft-mappers.ts` 的 category 映射决定。
- `Standing Bid` 摘要渲染依赖 `pbs-portal/src/features/standing-bid/standing-bid-property-summary.ts`。
- Help category 和 topic map 位于：
  - `pbs-portal/src/features/help/help-data.ts`
  - `pbs-portal/src/features/help/components/help-view.tsx`
  - `pbs-portal/src/features/help/topics/**`
- 左侧共享日历 capacity badge 位于 `pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx`。

## 设计方案

### 1. Reserve 顶部入口删除

从 `TOP_NAV_ITEMS` 中删除：

```ts
{ key: "reserve", label: "Reserve", path: "/reserve" }
```

删除后顶部导航应只保留：

- `Dashboard`
- `Bid`
- `Award`
- `Standing Bid`
- `Help`

注意：如果小屏时出现 overflow 菜单，`Reserve` 也不能出现在 overflow 中。

### 2. `/reserve` 直接 404

删除 `ReservePage` lazy import 和 `/reserve` route。

直接访问 `/reserve` 时应在原路径渲染通用 404 页面，不重定向到其他页面。

旧入口处理：

- `/portal/calendar` 不再映射到 `/reserve`，也不重定向到其他业务页；它应在原路径渲染 404。
- 如果旧路径没有其他明确产品含义，应让它也进入 404。
- `auth-return-to` 的安全白名单移除 `/reserve`，避免登录后跳回已删除页面。

### 3. Standing Bid 移除 `RESERVE` 分类

`Standing Bid` 的属性分类 tab 从：

```text
ALL PROPERTIES / DAYS OFF / PAIRING / ROSTER / RESERVE
```

改为：

```text
ALL PROPERTIES / DAYS OFF / PAIRING / ROSTER
```

显示规则：

- 后端仍可返回 `bidType: "Reserve"`、`sourceContext: "reserve"`。
- 前端展示分类时，将员工端可见的 Reserve 类 standing property 归入 `ROSTER`。
- `Reserve Preference` 在 `ROSTER` tab 下可见、可添加、可编辑、可删除。
- `ALL PROPERTIES` 下仍可看到该条件。
- 不通过前端硬编码伪造属性；仍以服务端 catalog 返回为准。

### 4. Standing Reserve 存储语义保留

这是本需求最重要的安全边界：

- UI 分类显示为 `ROSTER`，不代表写入 lineholder draft。
- `Reserve Preference` 的 `sourceContext` 仍必须保持 `"reserve"`。
- 保存、更新、删除时仍使用 `StandingReserve` draft metadata。
- 不允许把 `Reserve Preference` 当成普通 Line/Roster bid 写到 `StandingLineholder`。

实现时需要注意 summary：

- 目前 summary 逻辑会按 `categoryLabel === "Roster"` 走 line summary。
- `Reserve Preference` 显示到 `ROSTER` 后，summary 仍要按 reserve-call-type 语义格式化。
- 判断 summary 类型时应优先识别 `sourceContext === "reserve"` 或 `bid.type === "reserve-call-type-date-scope"`，不能只依赖展示 category。

### 5. Help 同步

Help 需要删除独立 `Reserve` 大章节，并同步修改所有旧入口文案。

必须移除或改写的说明包括：

- “Open Reserve”
- “Use Reserve”
- “Current Reserve workspace”
- “Reserve page”
- “RESERVE tab”
- “ADD RESERVE PREFERENCE” 作为独立页面入口

新的说明口径：

- Current Bid 的 Reserve Preference 从 `Bid` / Roster 条件中理解。
- Standing Bid 的 Reserve Preference 在 `Standing Bid > ROSTER` 分类下配置。
- `Reserve Preference` 的具体含义仍保留在条件参考中，但归入 `Roster / Line Conditions` 或对应的 Standing Bid 条件说明中。

Help 截图处理：

- 如果现有截图展示了顶部 `Reserve` 导航或 `Standing Bid > RESERVE` tab，需要删除或重新截取。
- 不允许 Help 里出现与实际 UI 不一致的截图。

### 6. BIDDING CALENDAR 底部 badge 视觉优化

当前日历底部 `29/150` 这类 badge 的业务含义保持不变：

```text
requestedDayOffCount / maxDaysOffCount
```

颜色规则保持不变：

- `requested < max`：绿色。
- `requested === max`：黄色。
- `requested > max`：红色。

只调整视觉：

- badge 仍放在日期格底部水平居中。
- 使用实底色和白色文字。
- 控制高度、圆角、字重和内边距，避免像临时贴片。
- 在 compact 和 regular 日历密度下都不能遮挡 `Off` 事件条或日期数字。
- 不添加 tooltip，不改变 aria label 中的详细解释。

## 验收标准

- 顶部导航不再显示 `Reserve`。
- 直接访问 `/reserve` 显示 404。
- 登录 redirect 参数中如果传入 `/reserve`，不能跳转到 Reserve 页面。
- `Standing Bid` 属性分类只显示 `ALL PROPERTIES / DAYS OFF / PAIRING / ROSTER`。
- `Standing Bid > ROSTER` 下可以看到并添加 `Reserve Preference`。
- 添加 `Reserve Preference` 后，请求仍写入 `StandingReserve` draft，而不是 `StandingLineholder`。
- Existing Standing Bid 中已有的 Reserve Preference 仍能显示、编辑、删除，summary 文案正确。
- Help 不再出现已删除的 Reserve 页面或 Reserve tab 操作说明。
- 共享日历 `requested/max` badge 视觉更精致，且数值、颜色语义、aria label 不变。

## 测试要求

自动化测试：

- 更新 `pbs-portal/src/app/layout/dashboard-top-nav.test.tsx`：
  - 断言顶部导航不显示 `Reserve`。
- 更新 `pbs-portal/src/app/router/app-routes.test.tsx`：
  - 断言 `/reserve` 进入 404。
- 断言 `/portal/calendar` 不再进入 Reserve 页面，并在原路径渲染 404。
  - 断言 auth return-to 不接受 `/reserve`。
- 更新 `pbs-portal/src/features/standing-bid/pages/standing-bid-page.test.tsx`：
  - 断言分类 tabs 不包含 `RESERVE`。
  - 断言 `Reserve Preference` 出现在 `ROSTER`。
  - 断言添加 `Reserve Preference` 仍调用 reserve context / `StandingReserve` metadata。
- 更新 `pbs-portal/src/shared/components/schedule/schedule-event-calendar.test.tsx`：
  - 断言 `requested/max` 文案和 aria label 保持不变。
  - 如可行，增加 class/DOM 断言覆盖 badge 的状态色。
- 更新 Help 内容测试：
  - 断言 Help 不再出现独立 Reserve 页面说明。
  - 断言 `Reserve Preference` 新位置说明存在。

Playwright 回归：

- 打开 Portal Dashboard，确认顶部导航无 `Reserve`。
- 访问 `/reserve`，确认进入 404。
- 打开 `Standing Bid`，确认无 `RESERVE` 分类，`Reserve Preference` 在 `ROSTER` 下。
- 打开 Help，确认相关说明与实际 UI 一致。
- 检查 `BIDDING CALENDAR` 日历 badge 在 1920x1080 和一个较窄宽度下不遮挡、不裁切。

交付验证建议：

```bash
pnpm --dir pbs-portal lint
pnpm --dir pbs-portal build
pnpm --dir pbs-portal test -- standing-bid-page app-routes dashboard-top-nav schedule-event-calendar
cd e2e && npx playwright test -c config/playwright.config.ts --project=pbs-portal tests/pbs-portal --grep "Reserve|Standing Bid|Help|Dashboard" --reporter=list --no-deps
```

实际执行时可根据仓库现有 test script 名称调整命令，但最终必须给出 PASS / FAIL 结果。

## 风险与约束

- 最大风险是把展示分类 `ROSTER` 和存储上下文 `reserve` 混淆，导致 Standing Reserve bid 写错 draft。
- 第二风险是 Help 或截图仍残留旧 Reserve 入口，造成用户困惑。
- 第三风险是只删除导航但保留 `/reserve` 可访问，产品语义不彻底。
- 第四风险是 badge 样式调整影响日历点击区域或弹窗定位；需要 Playwright 做真实页面检查。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 `pbs-portal` 的路由、导航、standing mapper、Help 和共享日历组件，多 agent 容易编辑同一批测试和 Help registry，冲突成本高。
- Suggested split: 不拆。
- Write boundaries: 单一实现流覆盖 `pbs-portal` 与 `docs/test-cases/pbs`。
- Conflict risk: 中等，主要来自 route/help/test 同步和 standing reserve 存储语义。
- Execution gate: 用户确认本 spec 后再进入实现。
