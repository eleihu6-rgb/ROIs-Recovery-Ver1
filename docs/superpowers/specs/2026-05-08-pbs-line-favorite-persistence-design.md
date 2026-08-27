# PBS Line 收藏持久化设计

日期：2026-05-08  
作者：Codex + lei  
状态：待确认

## 背景

当前 `/line` 页面已经接入真实 Line draft 读取和保存链路，但 Add Line Properties 区域的红心收藏仍然只是前端本地状态：

- 点击收藏或取消收藏时，UI 会变化。
- 没有发起网络请求。
- 刷新页面后收藏状态不能保证保留。

对比现有实现：

- `/pairing` 已通过 `pairingService.favoriteProperty` 和 `pairingService.unfavoriteProperty` 持久化收藏。
- `/days-off` 已通过 `RuleBidRightPanel` 的 `onFavoriteProperty` / `onUnfavoriteProperty` 回调持久化收藏。
- `/line` 只向 `RuleBidRightPanel` 传了 `onSave`，没有传收藏回调，因此组件会走本地 fallback。

这会造成用户误以为 Line 收藏已经保存，实际刷新后丢失，和 Pairing / Days Off 行为不一致。

## 目标

1. Line 收藏和取消收藏必须走后端接口并持久化。
2. 行为对齐 Days Off 的通用 `RuleBidRightPanel` 模式。
3. 收藏操作使用后端返回的稳定 `favoriteKey` 删除，不用 property code 或 UI 位置删除已有收藏。
4. 保持 Line catalog 仍由后端 `propertyCatalog` 和 `is_visible_in_portal` 控制，不在前端硬编码注入 property。
5. 收藏接口性能目标：正常本地联调和性能基线中单次接口耗时必须小于 2 秒。
6. 保持现有 Line draft 保存、旧库 `401-407`、AA 隐藏扩展能力不被破坏。
7. 补自动化测试和 QA 人工测试案例。

## 非目标

- 不重做 Line 页面布局。
- 不改变 Line property 的业务语义。
- 不启用 AA Line 隐藏属性。
- 不新增 Buddy With / Avoid Person。
- 不改 Pairing / Days Off 收藏实现，除非发现必须复用的轻量 helper。
- 不把 Line 整份保存改成逐条 add / patch / delete，本期只补收藏闭环。

## 推荐方案

推荐采用方案 A：Line 独立补齐收藏接口，复用 Days Off 的前端接线方式。

### 方案 A：对齐 Days Off 收藏链路

新增 Line 专属接口：

- `PUT /api/line-bids/current/favorites/:propertyCode`
- `DELETE /api/line-bids/current/favorites/by-key/:favoriteKey`

优点：

- 和 Pairing / Days Off API 形态一致，用户心智一致。
- 前端 `RuleBidRightPanel` 可以直接复用已有 favorite handler 机制。
- 后端可以继续使用 `pbs_bid_property_favorite`，通过 `bid_type='Line'` 区分。
- 删除使用稳定 `favoriteKey`，符合 PBS 稳定身份规范。

缺点：

- 需要改 contract、route、service、前端 service、页面和测试，范围比单纯隐藏红心大。

### 方案 B：隐藏 Line 收藏红心

优点：

- 改动小，避免用户误操作。

缺点：

- Line 功能体验弱于 Pairing / Days Off。
- 后续仍要补回来，容易返工。

结论：采用方案 A。

## 后端设计

### Contract

更新：

- `packages/contracts/pbs-line-bids.js`
- `packages/contracts/pbs-line-bids.d.ts`

新增 route：

```ts
favoriteByCode: (propertyCode: number | string) => `/line-bids/current/favorites/${propertyCode}`
favoriteByKey: (favoriteKey: number | string) => `/line-bids/current/favorites/by-key/${favoriteKey}`
```

新增类型：

- `PbsSaveLineFavoritePropertyRequest`
- `PbsLineFavoriteProperty`
- `PbsLineFavoriteMutationResponse`

`PbsLineCurrentDraftResponse` 增加：

- `favoriteProperties`
- `favoritePropertyCodes`

### Route

更新：

- `pbs-server/src/routes/line-bids.ts`
- `pbs-server/src/routes/line-bids.test.ts`

新增：

- `PUT /line-bids/current/favorites/:propertyCode`
- `DELETE /line-bids/current/favorites/by-key/:favoriteKey`

入参保持和 Days Off / Pairing 一致：

- 保存收藏 body：`draftKey`、`periodCode`、`bidContext`
- 删除收藏 query：`draftKey`、`periodCode`

路由层只做 Zod 校验和 service 调用，不写业务 SQL。

### Service

更新：

- `pbs-server/src/services/line/types.ts`
- `pbs-server/src/services/line/line-bid-service.ts`

新增能力：

- `saveFavoriteProperty(actor, propertyCode, request)`
- `removeFavoritePropertyByKey(actor, favoriteKey, reference)`

持久化策略：

- 复用 `pbs_bid_property_favorite`。
- 使用 `bid_type='Line'`。
- 保存前通过 Line property catalog 校验 `propertyCode` 是否为支持的 Line property。
- 如果当前 Current bid 不存在，允许像 Pairing / Days Off 一样创建或定位 Current bid 后保存收藏。
- 删除时必须使用 `favoriteKey`，并限制在当前 actor + current period + `bid_type='Line'` 范围内。

性能策略：

- 收藏保存/删除只触碰当前用户、当前 period、单个 property。
- 使用已有 current period cache / property catalog cache。
- SQL 必须走唯一键或主键定位，避免全表扫描和 N+1。
- 不因为收藏成功刷新整份大型 draft；响应只返回 draft identity 和 favorite 信息，前端做 query cache patch。

## 前端设计

### Service

更新：

- `pbs-portal/src/shared/services/line-service.ts`

新增：

- `favoriteProperty(propertyCode, draftMeta)`
- `unfavoriteProperty(favoriteKey, draftMeta)`

请求方式对齐 Days Off：

- 收藏：`PUT pbsLineBidRoutes.favoriteByCode(propertyCode)`
- 取消收藏：`DELETE pbsLineBidRoutes.favoriteByKey(favoriteKey)`

### Page

更新：

- `pbs-portal/src/features/line/pages/line-page.tsx`

LinePage 继续使用 `RuleBidRightPanel`，但补传：

- `onFavoriteProperty`
- `onUnfavoriteProperty`

缓存更新复用 `rule-bid-page-cache`：

- 收藏成功后 `patchRuleBidPageFavoriteStatus`
- 取消收藏成功后 `patchRuleBidPageUnfavoriteByKey`
- 收藏成功返回 draft identity 时同步 `patchRuleBidPageDraftMeta`

交互要求：

- 点击红心时立即 pending，避免重复点击产生并发请求。
- 成功显示 `Favorite saved.` 或 `Favorite removed.`。
- 失败回滚 UI，并显示错误提示。

## 测试计划

### 后端自动化测试

更新：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm test -- src/routes/line-bids.test.ts src/services/line/line-validation.test.ts
```

覆盖：

- GET Line current 返回 `favoriteProperties` / `favoritePropertyCodes`。
- PUT Line favorite 按 property code 保存收藏，返回 `favoriteKey`。
- DELETE Line favorite 使用 `favoriteKey` 删除收藏。
- 删除不存在或非法 favoriteKey 返回可处理错误。
- 收藏隐藏但 supported 的 AA Line property 时，后端支持历史/配置能力；默认 UI 不展示。
- 收藏接口不影响 existing Line properties。

### 前端自动化测试

更新：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test -- src/features/line/pages/line-page.test.tsx src/features/line/line-draft-mappers.test.ts src/features/rule-bids/utils.test.ts
```

覆盖：

- 点击 Line available property 红心会调用 `lineService.favoriteProperty`。
- 收藏成功后红心保持选中，并写入 `favoriteKey`。
- 点击已收藏红心会调用 `lineService.unfavoriteProperty`。
- 取消收藏失败时 UI 回滚。
- 刷新页面后收藏状态来自服务端响应，而不是本地 fallback。

### 回归与性能

交付前运行：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm run build

cd /Users/lei/Codehub/rois-ai/pbs-portal
npm run lint
npm run build

cd /Users/lei/Codehub/rois-ai
npm run verify:pbs
```

性能验收：

- Line 收藏 PUT / DELETE 单次接口小于 2 秒。
- `npm run verify:pbs` 中 PBS 性能基线不能出现相关接口超过 2 秒。
- 如果性能基线未覆盖 Line favorite，需要用本地脚本或手动 curl 带 token 记录耗时。

## QA 人工测试案例

新增：

```text
docs/test-cases/pbs/line/2026-05-08-line-favorite-persistence.md
```

测试范围：

- 登录 PBS Portal。
- 进入 `/line`。
- 收藏 `Max Credit Window`，确认 Network 有 PUT 请求。
- 刷新页面，确认红心仍为选中。
- 取消收藏，确认 Network 有 DELETE 请求。
- 再次刷新页面，确认红心恢复未选中。
- 收藏 `Forget Line` 后新增到 existing list，确认收藏状态和 draft property 互不影响。
- 回归 Pairing / Days Off 收藏仍能正常请求接口。

## 验收标准

1. Line 收藏和取消收藏都会走接口。
2. Line 收藏刷新后不丢失。
3. Line 删除收藏使用 `favoriteKey`。
4. Line 收藏接口不超过 2 秒。
5. Pairing / Days Off 收藏行为不回退。
6. 自动化测试、构建、lint、`verify:pbs` 通过。
7. 新增 QA 人工测试案例。
