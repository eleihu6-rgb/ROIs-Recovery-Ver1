# Rule Bid 右侧面板性能重构回归测试案例

日期：2026-06-12  
范围：PBS Portal Rule Bid 通用右侧面板，覆盖 Days Off / Line/Roster，以及合并到 Bid -> ROSTER 的 Reserve Preference 入口。

## 前置条件

- PBS Portal 可正常访问。
- 当前账号有 Days Off、Line/Roster 和 Reserve Preference 数据。
- 各页面至少存在一个 available property 和一个 existing property。

## 操作步骤与预期结果

1. 打开 `/days-off`、`/line`，再打开 `/bid` 并切到 `ROSTER`。
   - 预期：右侧通用 Rule Bid 面板正常渲染。
   - 预期：Existing、Available、All/Favorites、搜索、分页等基础结构正常。
   - 预期：`Reserve Preference` 在 `ROSTER` 分类中可见，不再需要独立 `/reserve` 页面。

2. 在不同 viewport 宽度下检查右侧表格。
   - 预期：`<1500px`、`1500-1749px`、`>=1750px` 三档布局稳定。
   - 预期：PROPERTY、BID、TIERS、操作列不重叠、不换行异常。

3. 添加 available property。
   - 预期：如果需要配置弹窗，弹窗打开并可保存。
   - 预期：保存后 Existing 列表更新，成功提示正常。

4. 编辑 existing property 的 bid、tiers、modifiers。
   - 预期：inline/dialog 编辑模式均不回退。
   - 预期：All or Nothing / Minimum N 等 modifiers 更新正常。

5. 收藏、保存配置收藏、取消收藏 available property。
   - 预期：favorite 状态、删除确认、成功/失败提示正常。
   - 预期：切换 Favorites tab 后列表状态正确。

6. 在 All / Favorites tab 下输入搜索关键字，并翻页。
   - 预期：All tab 不显示 `source=favorite` 的配置收藏副本。
   - 预期：Favorites tab 只显示已收藏项。
   - 预期：搜索前后分页总数、ellipsis、当前页回落逻辑正确。

7. 删除 existing property。
   - 预期：删除成功后列表更新；刷新页面后结果保持一致。

## 异常与边界场景

- 保存失败时显示错误消息，并保留用户当前可恢复的编辑状态。
- 当前页码超过过滤后的总页数时，页码自动回落到有效页。
- 禁用状态下的 pending mutation 不允许重复点击导致重复写入。

## 回归范围

- Days Off / Line/Roster，以及 Bid -> ROSTER 中 Reserve Preference 的右侧面板共用行为。
- 通用 Rule Bid 布局 helper。
- available properties 分页、搜索、favorites。
- Rule Bid helper 拆分后的 hydration key、view reset key、save error message、分页和搜索过滤。
- Existing property add / update / delete / modifiers。

## 自动化验证

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test -- --run src/features/rule-bids
npm test -- rule-bid-right-panel-layout.test.ts rule-bid-right-panel.test.tsx days-off-page.test.tsx line-page.test.tsx bid-page.test.tsx
npm test
npm run lint
npm run build
```
