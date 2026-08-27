# PBS Bid 页面合并实施计划

## 实施目标

依据 `docs/superpowers/specs/2026-07-17-pbs-bid-page-merge-design.md`，将当前 Days Off、Pairing、Line 三个 Current Bid 页面合并为 `/bid`，保留分类业务能力，并统一所有 Current Bid 写入使用的草稿身份与版本。

## 实施原则

- 新增 `features/bid` 作为薄协调层，不重写三个分类 service。
- 不全局改造 `RuleBidRightPanel`；避免影响 Reserve 和 Standing Bid。
- 共享草稿协调器放在 `SharedBiddingWorkbenchLayout` 范围，覆盖 `/bid`、左侧日历和 Pairing Search。
- 先补纯逻辑测试，再接 UI，最后补真实 Playwright。
- 所有改动以已批准 spec 为边界，不附带无关重构。

## 阶段 1：共享草稿协调

预计文件：

- `pbs-portal/src/features/bid/bid-draft-coordinator.ts`
- `pbs-portal/src/features/bid/bid-draft-context.tsx`
- `pbs-portal/src/features/bid/bid-draft-coordinator.test.ts`
- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.tsx`

任务：

1. 定义统一 `BidDraftMeta` 和身份一致性校验。
2. 使用 TanStack Query cache 作为服务端草稿状态来源，Context 只负责读取最新 meta、mutation mutex 和刷新入口。
3. 所有写入在提交时获取最新 meta，不捕获初始页面数据。
4. mutation 成功后同步身份，并按影响范围刷新 Summary、分类数据、Tier、Calendar、Pairing Count。
5. 版本冲突时停止自动重试，刷新当前草稿并返回用户可见错误。

验证：

- 一致身份可合并。
- 身份冲突关闭写入。
- mutation 串行执行。
- Favorite 首次创建草稿后同步身份。

## 阶段 2：Bid 查询与统一 Existing

预计文件：

- `pbs-portal/src/features/bid/hooks/use-bid-page-data.ts`
- `pbs-portal/src/features/bid/bid-page-data.ts`
- `pbs-portal/src/features/bid/components/bid-right-panel.tsx`
- `pbs-portal/src/features/bid/components/bid-existing-properties-section.tsx`
- `pbs-portal/src/features/bid/pages/bid-page.tsx`

任务：

1. 并行加载 Lineholder Summary 与三类 Current Draft。
2. 按 `(module, propertyGroupKey)` 关联 Summary 和完整编辑数据。
3. 统一显示三类 Existing Properties 和分类 badge。
4. 分类行继续使用各自编辑器和 service。
5. Pairing 行保留 Count、Preview；Pairing Rules 使用独立业务弹窗。
6. 关联失败时显示只读行并关闭写入。

验证：

- 三类 Existing 同时显示。
- Tab 切换不影响 Existing。
- 编辑、删除和 Tier 修改路由到正确分类。
- Pairing 专属能力保留。

## 阶段 3：Available Properties 四 Tab

预计文件：

- `pbs-portal/src/features/bid/components/bid-available-properties-section.tsx`
- `pbs-portal/src/features/bid/bid-available-properties.ts`
- 对应组件与纯逻辑测试

任务：

1. 实现 `Favorited Properties / Days Off / Pairing / Line`。
2. 默认选中 Favorite；空收藏不自动跳转。
3. 移除 All 和分页，只保留当前 Tab 的滚动列表。
4. 搜索只过滤当前 Tab，切 Tab 清空搜索并回到顶部。
5. Favorite 合并三类并显示分类。
6. Pairing Tab 保留 All Pairings。

验证：

- 四 Tab 过滤正确。
- 没有 All 和 pagination footer。
- Favorite 空态稳定。
- 19 个条件以内不使用虚拟列表。

## 阶段 4：日历双模式

预计文件：

- `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`
- `pbs-portal/src/features/dashboard/hooks/use-days-off-calendar-actions.tsx`
- 新增 feature-local 日期意图切换组件
- 相关 Dashboard / Shared Workbench 测试

任务：

1. `/bid` 同时启用 Days Off 和 Pairing 日期能力。
2. 日期浮层增加 `Days Off / Pairing` Tab。
3. 使用 `sessionStorage` 记住会话内模式。
4. 星期标题继续直接走 Days Off。
5. 已有事件直接打开自身类型。
6. 日历 mutation 接入共享 draft coordinator。

验证：

- 切换模式不丢目标日期。
- 未保存临时状态在切换时清除。
- 刷新后保留会话模式。
- Dashboard 非编辑日历行为不变。

## 阶段 5：路由、导航与 Pairing Search

预计文件：

- `pbs-portal/src/app/router/app-routes.tsx`
- `pbs-portal/src/app/router/legacy-route-redirects.tsx`
- `pbs-portal/src/shared/constants/top-nav-items.ts`
- `pbs-portal/src/features/pairing/pages/search-pairings-page.tsx`
- 对应路由和导航测试

任务：

1. 新增 `/bid` 和 `/bid/pairing/search`。
2. 移除顶部 Days Off、Pairing、Line，新增 Bid。
3. 旧三个页面路由重定向到 `/bid`。
4. 旧 Pairing Search 重定向到新地址。
5. Pairing Search 返回 `/bid` 后选中 Pairing Tab。
6. Pairing Search mutation 使用共享 coordinator。

验证：

- 顶部 active 状态正确。
- 旧路由重定向正确。
- Search 进入和返回正确。

## 阶段 6：Help、QA 与自动化

预计文件：

- `pbs-portal/src/features/help/` 中受影响入口
- `docs/test-cases/pbs/bid/2026-07-17-bid-page-merge.md`
- `pbs-portal/e2e/` 或仓库现有 PBS Playwright 目录

任务：

1. 更新 Help 中 Days Off、Pairing、Line 的导航描述。
2. 新增 QA 人工测试案例。
3. 新增真实 UI Playwright：
   - 三分类连续写入。
   - 日历写入后 Line 写入。
   - Pairing Search 写入后 Days Off 写入。
   - Favorite 首次建草稿后结构性写入。
   - 日历模式会话记忆。

## 验证顺序

1. 纯逻辑和组件 focused tests。
2. 路由、Shared Workbench、Dashboard、Reserve、Standing Bid 回归。
3. `cd pbs-portal && npm run check:ui`
4. `cd pbs-portal && npm run lint`
5. `cd pbs-portal && npm run build`
6. 新增 Playwright 用例。
7. 仓库根 `npm run verify:pbs`。
8. `git diff --check`。
9. GitNexus `detect-changes --scope staged`。

## 完成定义

- Spec 中 12 条验收标准全部满足。
- 所有 Current Bid 写入入口使用最新共享草稿版本。
- 必跑测试与检查有明确 PASS 记录。
- 没有未说明的测试缺口或回归风险。
