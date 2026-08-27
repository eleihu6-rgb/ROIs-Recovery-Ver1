# PBS Days Off 后端响应构造收束

## 背景

PBS 简化/重构继续只处理 `pbs-portal` 和 `pbs-server`。本次聚焦 `pbs-server/src/services/days-off/days-off-bid-service.ts` 中低风险的对象构造重复逻辑，避免触碰 SQL CTE、事务边界、并发锁、`draftVersion` 校验和数据库 schema。

## 改动

- 新增私有响应 helper：
  - `savedPropertyMutationResponse`
  - `savedFavoriteMutationResponse`
- `addCurrentDraftProperty` 的稳定 bidId 分支与普通事务分支统一通过 `savedPropertyMutationResponse` 返回新增 property mutation 结果。
- `saveFavoriteProperty` 的稳定 bidId 分支与普通事务分支统一通过 `savedFavoriteMutationResponse` 返回收藏 mutation 结果。
- 新增 `buildDraftPropertyFromAddRequest`，收束新增 Days Off property 时重复手写的 `propertyToInsert` 结构。

## 约束

- 不改变 API response 字段。
- 不改变 SQL、事务顺序、版本号递增、错误码或错误信息。
- 不引入新依赖。
- 不扩大到 Pairing / Line / Portal 以外的模块。

## 验证

已通过：

```bash
PATH="/Users/lei/.nvm/versions/node/v22.21.1/bin:$PATH" node --import tsx --test src/routes/days-off-bids.test.ts
PATH="/Users/lei/.nvm/versions/node/v22.21.1/bin:$PATH" npm run build
```

结果：

- `days-off-bids` 路由定向测试：6 个测试通过。
- `pbs-server` TypeScript build 通过。

下一步仍需运行根目录 `npm run verify:pbs` 做 PBS 全量回归。
