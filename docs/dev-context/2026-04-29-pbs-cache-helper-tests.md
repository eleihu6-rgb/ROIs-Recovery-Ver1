# PBS 前端 Cache Helper 测试补强

## 背景

PBS 简化/重构已将 Pairing 与 Rule Bid 的 React Query cache patch 逻辑收束到 helper。继续深入重构前，需要先补纯函数测试，降低后续修改缓存同步逻辑时的回归风险。

## 改动

- 新增 `pbs-portal/src/features/pairing/pairing-page-cache.test.ts`。
- 新增 `pbs-portal/src/features/rule-bids/rule-bid-page-cache.test.ts`。
- 覆盖内容：
  - draft meta patch 空 patch 时保持原引用。
  - draft meta patch 能更新 `draftKey`、`bidId`、`periodId`、`periodCode`、`draftVersion`。
  - favorite / unfavorite patch 不污染原始 available properties。
  - Rule Bid existing / available properties patch 保持 clone 行为，避免缓存对象和 UI 局部状态共享引用。
- 修复 Pairing / Rule Bid draft meta helper 的 `periodId: null` 边界：
  - 原来使用 `??`，会导致后端返回 `periodId: null` 时保留旧 `periodId`。
  - 改为只在 `periodId !== undefined` 时覆盖，允许显式清空为 `null`。

## 约束

- 不改 API contract。
- 不改 UI 交互。
- 不改后端。
- 不引入新依赖。

## 验证

已通过：

```bash
PATH="/Users/lei/.nvm/versions/node/v22.21.1/bin:$PATH" npm test -- --run src/features/pairing/pairing-page-cache.test.ts src/features/rule-bids/rule-bid-page-cache.test.ts
PATH="/Users/lei/.nvm/versions/node/v22.21.1/bin:$PATH" npm run lint
PATH="/Users/lei/.nvm/versions/node/v22.21.1/bin:$PATH" npm run build
```

结果：

- Cache helper 定向测试：2 个测试文件、8 个测试通过。
- `pbs-portal` lint 通过。
- `pbs-portal` production build 通过。

下一步仍需运行根目录 `npm run verify:pbs` 做 PBS 全量回归。
