# PBS-3510 合并 Bid 页面回归测试重写设计

## 背景

`PBS-3510 — condition pages separate saved favorites from recommended templates` 仍按合并前的独立页面运行：

- `page.goto('days-off')`
- `page.goto('pairing')`
- `page.goto('line')`

当前产品已经统一为 `/bid` 页面，并通过以下一级 Tab 切换条件类别：

- `FAVORITED PROPERTIES`
- `DAYS OFF`
- `PAIRING`
- `ROSTER`

因此旧用例会停在已经不存在的页面结构中，找不到 `ACTIONS` 等元素并超时。

## 目标

保留 PBS-3510 对收藏、各类别条件内容、Existing Bid 和 Pairing 搜索行为的确定性回归覆盖，但改为当前 `/bid` 页面交互，并将单条大型用例拆成可独立失败、快速定位的用例。

## 方案比较

### 方案 A：原地修改为一条新的大型用例

优点是改动文件和用例编号最少。缺点是任意一个类别失败都会中断后续检查，失败定位困难，运行时间也会继续集中在一条用例中。

### 方案 B：拆成四条当前流程用例（推荐）

共享现有 `mockWorkbenchApis` 与辅助断言，分别验证默认收藏、Days Off、Pairing、Roster。每条用例从 `/bid` 开始并点击真实 Tab。

优点是职责清晰、失败隔离、可单独执行；同时保留原来有价值的业务覆盖。

### 方案 C：删除 PBS-3510，完全依赖其他用例

`bid-merged-workbench.spec.ts` 已覆盖页面布局、Tab 顺序、滚动区域和真实后端 smoke，但没有完整覆盖 mock 数据下各类别的收藏配置、类别条件内容及 Pairing 规则预览。直接删除会留下确定性业务覆盖缺口。

## 推荐设计

将旧 PBS-3510 替换为以下四条用例：

1. `PBS-3510A — Bid defaults to Favorited Properties`
   - 进入 `/bid`。
   - 验证默认选中 `FAVORITED PROPERTIES`。
   - 验证其位于三个业务类别 Tab 之前。
   - 验证默认收藏列表包含预设的 Days Off、Pairing、Roster 收藏项。
   - 不重复检查响应式布局、页面滚动和 Tier 路由移除。

2. `PBS-3510B — Days Off category is separate from favorites`
   - 进入 `/bid`，点击 `DAYS OFF`。
   - 验证 Existing Bid 中的 `Prefer Off` 摘要。
   - 验证默认收藏视图与 `DAYS OFF` 类别 Tab 内容正确分离。
   - 验证合并页面不再显示旧 `ALL PROPERTIES` 子 Tab。
   - 验证无 `Saved setup`、`Recommended`、旧 BID/TIERS 列等过期 UI。

3. `PBS-3510C — Pairing separates favorites and preserves search previews`
   - 进入 `/bid`，点击 `PAIRING`。
   - 验证 Pairing Length 与 Pairing Preference 的可读 Existing Bid 摘要。
   - 验证 `VIEW RULES`、`SEARCH PAIRINGS` 和单条件 PREVIEW。
   - 验证 Pairing Preference 编辑弹窗及其可视区域边界。
   - 验证 Pairing 收藏与 `PAIRING` 类别 Tab 的分类内容。
   - 复用当前文案：`Award pairings 1–3 days long`。

4. `PBS-3510D — Roster category is separate from favorites`
   - 进入 `/bid`，点击 `ROSTER`。
   - 验证当前 Roster 条件名称和 Existing Bid 摘要。
   - 验证默认收藏视图与 `ROSTER` 类别 Tab 内容正确分离。
   - 不再使用旧 `LINE` 标签或 `/line` 路由。

## 测试结构

- 继续复用 `mockWorkbenchApis(page)`，保持测试数据确定性。
- 为 PBS-3510A～D 新增一个独立的小型导航辅助函数：
  - 打开 `/bid`。
  - 等待 `bid-page`。
  - 点击指定类别 Tab。
- 保留现有 `expectFavoriteTabIsDefault(page, workspaceTestId)` 等被其他测试复用的 helper，不在本任务中改变其签名或旧页面语义。
- PBS-3510A～D 的查询优先限制在 `bid-page` 内，避免全局同名元素误命中。
- 不修改产品代码、API 或数据库。

## 与现有测试的边界

`bid-merged-workbench.spec.ts` 继续负责：

- 真实后端 smoke；
- 页面无整体滚动；
- 左右滚动区域隔离；
- Tab 顺序和响应式布局；
- 日期操作弹窗；
- Tier 页面移除。

重写后的 PBS-3510 只负责 mock 数据下的条件内容、默认收藏与三个类别 Tab 的分离、Existing Bid 和 Pairing 预览行为，避免重复维护。

## 验收标准

- PBS-3510A～D 不再访问 `/days-off`、`/pairing` 或 `/line`；同文件其他旧用例不在本任务范围内。
- PBS-3510A～D 不再断言旧 `LINE` Tab，统一使用 `ROSTER`。
- 四条 PBS-3510 子用例均可单独运行并通过。
- 整个 `condition-default-favorites.spec.ts` 至少通过 PBS-3510A～D、PBS-3603、PBS-3636 的定向回归。
- `git diff --check` 通过。
- `npm run check:ui` 不因测试改动产生新 hard violation。
- 不产生数据库写入，不需要 migration。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在同一 Playwright 文件和共享 helper，拆给多个 agent 会产生写冲突，协调成本高于实现成本。
- Suggested split: 单 agent 顺序完成 helper 调整、四条用例拆分和回归。
- Write boundaries: 仅修改 `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`；如发现当前测试编号索引文档，再单独更新对应文档。
- Conflict risk: 多人同时编辑同一大型 spec 文件风险高。
- Execution gate: 用户批准本设计和实施计划后再修改测试代码。
