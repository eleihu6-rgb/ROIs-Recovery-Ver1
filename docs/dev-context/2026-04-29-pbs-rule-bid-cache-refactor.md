# PBS Rule Bid 缓存更新逻辑收束

## 背景

PBS 简化/重构第六小步继续只处理 `pbs-portal` 和 `pbs-server`。本次聚焦 `pbs-portal` 中 Rule Bid 通用页面状态更新逻辑，目标是在不改变 API contract、UI 交互和业务行为的前提下，减少 `DaysOffPage` / `LinePage` / `RuleBidRightPanel` 中重复的 draft meta、existing properties、favorite 状态 patch 代码。

## 改动

- 新增 `pbs-portal/src/features/rule-bids/rule-bid-page-cache.ts`：
  - `patchRuleBidDraftMeta`
  - `patchRuleBidPageDraftMeta`
  - `patchRuleBidPageExistingProperties`
  - `patchRuleBidPageAvailableProperties`
  - `patchRuleBidPageFavoriteStatus`
  - `patchRuleBidPageUnfavoriteByKey`
  - `applyRuleBidAvailablePropertyFavoriteStatus`
- `DaysOffPage` 改为通过 helper 更新 React Query cache：
  - 保存草稿后同步 draft meta 和 existing properties。
  - 新增/删除 property 后同步 draft meta 和 existing properties。
  - 收藏/取消收藏后同步 available properties。
- `LinePage` 改为通过 `patchRuleBidPageDraftMeta` 同步草稿 identity，避免页面内手写嵌套对象 patch。
- `RuleBidRightPanel` 复用 `applyRuleBidAvailablePropertyFavoriteStatus`，删除本地重复的 favorite 状态 helper。

## 约束

- 不改后端 API。
- 不改数据库 schema。
- 不改 Rule Bid / Days Off / Line 的用户可见交互。
- 不引入新依赖。
- 保持原有 clone 行为，避免缓存对象引用被 UI 局部状态共享。

## 验证

已通过：

```bash
PATH="/Users/lei/.nvm/versions/node/v22.21.1/bin:$PATH" npm test -- --run src/features/days-off/pages/days-off-page.test.tsx src/features/line/pages/line-page.test.tsx
PATH="/Users/lei/.nvm/versions/node/v22.21.1/bin:$PATH" npm run lint
PATH="/Users/lei/.nvm/versions/node/v22.21.1/bin:$PATH" npm run build
```

结果：

- `DaysOffPage` / `LinePage` 定向测试：2 个测试文件、11 个测试通过。
- `pbs-portal` lint 通过。
- `pbs-portal` production build 通过。

下一步仍需在本批结束前运行根目录 `npm run verify:pbs` 做 PBS 全量回归。
