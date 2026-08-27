# PBS Pairing 缓存 helper 重构记录

时间：2026-04-29
范围：`pbs-portal`

## 本批目标

- 在不改变 Pairing 页面和 Search Pairings 页面交互的前提下，收束重复的 cache patch / favorite 乐观更新 / draft meta 合并逻辑。
- 不改 UI 视觉、不改 API contract、不改后端。
- 保持 Pairing 相关测试和 PBS 全量回归通过。

## 已处理项

### 1. 新增 Pairing 页面 cache helper

新增文件：

- `pbs-portal/src/features/pairing/pairing-page-cache.ts`

提供纯函数：

- `applyPairingFavoriteStatus`
- `applyPairingAvailablePropertyFavoriteStatus`
- `patchPairingDraftMeta`
- `patchPairingPageDraftMeta`
- `patchPairingPageFavoriteStatus`
- `patchPairingPageExistingProperties`
- `hasPairingDraftMetaPatch`

这些 helper 只处理不可变数据 patch，不直接依赖 React、TanStack Query、service 或 UI 组件。

### 2. 收束 Pairing 右侧面板 cache 更新

修改文件：

- `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`

处理内容：

- 删除组件内本地 `FavoriteStatusDetails` 类型和 `applyFavoriteStatus` 实现。
- `syncDraftIdentityInQueryCache` 改用 `patchPairingPageDraftMeta`。
- `syncExistingPropertiesInQueryCache` 改用 `patchPairingPageExistingProperties`。
- favorite 乐观更新改用 `applyPairingAvailablePropertyFavoriteStatus` 和 `patchPairingPageFavoriteStatus`。

### 3. 收束 Search Pairings 页面 cache 更新

修改文件：

- `pbs-portal/src/features/pairing/pages/search-pairings-page.tsx`

处理内容：

- 删除页面内本地 `FavoriteStatusDetails` / `DraftIdentityDetails` 类型和 `applyFavoriteStatusToPageData`。
- criteria favorite 乐观更新改用 `applyPairingFavoriteStatus`。
- Pairing page cache favorite patch 改用 `patchPairingPageFavoriteStatus`。
- 批量 bid properties 后的 draft meta 合并改用 `patchPairingDraftMeta` / `patchPairingPageDraftMeta`。

## 不变项

- `pairingService` 调用顺序不变。
- favorite 保存/失败回滚语义不变。
- draftVersion、draftKey、bidId、periodId 合并语义不变。
- `layerPageDataQueryKey` invalidation 行为不变。
- Pairing 页面和 Search Pairings 页面视觉不变。

## 验证结果

定向验证：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test -- --run src/features/pairing/pages/pairing-page.test.tsx src/features/pairing/pages/search-pairings-page.test.tsx src/features/pairing/components/pairing-bid-control.test.tsx
npm run build
npm run lint -- --quiet
```

结果：

- 3 个 Pairing 测试文件通过。
- 46 个 Pairing 相关测试通过。
- `pbs-portal` build/lint 通过。

全量 PBS 验证：

```bash
cd /Users/lei/Codehub/rois-ai
PATH="/Users/lei/.nvm/versions/node/v22.21.1/bin:$PATH" npm run verify:pbs
```

结果：

- `pbs-server` test/build/sync dry-run 通过。
- `pbs-portal` test/lint/build 通过。
- `verify:pbs completed`。

## 后续建议

- 下一批可以继续拆 `PairingRightPanel` 的展示子组件，例如 available property row、existing property row、pagination 区。
- 后端 `days-off-bid-service.ts` 和 `pairing-bid-service.ts` 仍建议另开一轮 spec 后再拆，避免误伤 SQL fast path 和事务边界。
