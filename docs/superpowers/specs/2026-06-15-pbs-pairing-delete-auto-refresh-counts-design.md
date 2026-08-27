# PBS Pairing 添加/删除条件后自动刷新 Counts 设计

日期：2026-06-15  
状态：已确认，已实现  
范围：PBS Portal `/fpqe/pbs/pairing` 的 `EXISTING PAIRING PROPERTIES`

## 背景

当前 Pairing 页面顶部已有当前 Tx 的 pairing pool counts 汇总条，并支持用户手动点击 `REFRESH` 重新计算。

现有行为是：用户添加或删除一个 existing pairing condition 成功后，页面会把 counts 标记为 stale，并显示：

- `Counts need refresh`
- `Refresh current Tx`

这个提示能表达“统计已过期”，但添加和删除条件都是明确的规则集合结构变更。用户通常希望完成添加或删除后立即看到新的当前 Tx 统计结果，而不是再手动点击一次 `REFRESH`。

## 目标

添加或删除 existing pairing condition 成功后，自动刷新当前 active Tx 的 counts。

具体目标：

- 添加成功后复用现有 `countCurrentRules` / `refreshPairingPoolCounts` 刷新链路。
- 删除成功后复用现有 `countCurrentRules` / `refreshPairingPoolCounts` 刷新链路。
- 自动刷新期间复用现有 loading 展示，即 `REFRESHING` / `Refreshing` / `Calculating...`。
- 刷新成功后展示最新 rule count、pairing count 和 row-level count。
- 添加失败时保持原有错误提示，不触发 counts refresh。
- 删除失败时保持原有错误提示，不触发 counts refresh。

## 非目标

- 不改变 edit property 成功后的 stale 行为。
- 不改变 tier toggle 成功后的 stale 行为。
- 不新增后端 API。
- 不改变 count API 的 request / response contract。
- 不改变 `SEARCH PAIRINGS`、`VIEW RULES`、手动 `REFRESH`、切换 Tx 自动刷新行为。

## 当前实现观察

相关前端文件：

- `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`
- `pbs-portal/src/features/pairing/pairing-pool-counts.ts`
- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`

当前 `PairingRightPanel` 中：

- `refreshPairingPoolCounts(tier)` 已封装 counts 刷新逻辑。
- `markPairingPoolCountsStale()` 会清空当前 response，并把状态改为 `stale`。
- `persistExistingPropertiesImmediately(...)` 是 add / edit / tier toggle / delete 成功后共同走的保存函数。
- 保存成功后统一调用 `markPairingPoolCountsStale()`，因此添加或删除成功后都会进入 stale 状态。

## 推荐方案

在 `persistExistingPropertiesImmediately(...)` 的 feedback/options 中增加一个可选行为，例如：

```ts
type PersistExistingPropertiesFeedback = {
  onError?: () => void;
  onSuccess?: () => void;
  refreshCountsOnSuccess?: boolean;
};
```

保存成功后：

- 默认仍调用 `markPairingPoolCountsStale()`。
- 当 `refreshCountsOnSuccess === true` 时，不停留在 stale，而是在同步本地 state / query cache 后立即调用 `refreshPairingPoolCounts(resolvePairingPoolCountsTier(activeTierLabelRef.current))`。

添加路径 `persistAvailablePropertyAdd(...)` 和删除路径 `handleExistingDelete(...)` 设置：

```ts
refreshCountsOnSuccess: true
```

其它路径保持默认 false：

- `handleExistingTierToggle`
- `handleExistingEditConfirm`

这样可以让“规则集合新增/减少”后立即显示最新 counts，同时避免 edit / tier toggle 这类可能连续微调的操作每次都触发额外 count API。

## 数据流

添加成功后的数据流：

1. 用户从 `ADD PAIRING PROPERTIES` 配置并添加一个 property。
2. 前端调用 `pairingService.addCurrentDraftProperty(property, draftMeta)`。
3. 后端添加成功，返回稳定的 draft identity / property group key。
4. 前端用返回结果把本地临时 property id 替换为保存后的 property group key。
5. 前端同步 draft identity、existing properties state、query cache、calendar query invalidation。
6. 前端显示原有成功消息 `Pairing property added.`。
7. 前端立即调用当前 Tx 的 `refreshPairingPoolCounts(...)`。
8. 顶部 counts summary 进入 loading 状态。
9. `countCurrentRules` 返回后，顶部和行级 counts 展示最新结果。

删除成功后的数据流：

1. 用户点击 existing property 的 delete icon。
2. 前端调用 `pairingService.removeCurrentDraftProperty(propertyId, draftMeta)`。
3. 后端删除成功，返回 draft identity。
4. 前端同步 draft identity、existing properties state、query cache、calendar query invalidation。
5. 前端显示原有成功消息 `Pairing property deleted.`。
6. 前端立即调用当前 Tx 的 `refreshPairingPoolCounts(...)`。
7. 顶部 counts summary 进入 loading 状态。
8. `countCurrentRules` 返回后，顶部和行级 counts 展示最新结果。

## 错误处理

- 添加失败：保持原有 `Unable to add pairing property.`，不刷新 counts。
- 删除失败：保持原有 `Unable to delete pairing property.`，不刷新 counts。
- 添加成功但 counts 刷新失败：添加结果保留，counts 区域进入现有 error 状态，并显示现有 counts 错误消息。
- 删除成功但 counts 刷新失败：删除结果保留，counts 区域进入现有 error 状态，并显示现有 counts 错误消息。
- 如果刷新过程中用户又触发新的 Tx 切换或 refresh，继续依赖现有 `poolCountsRequestSeqRef` 防止旧请求覆盖新结果。

## 验收标准

- 已手动刷新过 counts 的情况下，添加一个 pairing condition 成功后，`countCurrentRules` 会自动再次调用一次。
- 已手动刷新过 counts 的情况下，删除一个 existing pairing condition 成功后，`countCurrentRules` 会自动再次调用一次。
- 添加自动刷新调用使用添加后的 `existingProperties` 快照，并包含保存后的 property group key。
- 自动刷新调用使用删除后的 `existingProperties` 快照。
- 添加成功后页面不长期停留在 `Counts need refresh`。
- 删除成功后页面不长期停留在 `Counts need refresh`。
- 添加失败时不调用 `countCurrentRules`，仍显示添加失败消息。
- 删除失败时不调用 `countCurrentRules`，仍显示删除失败消息。
- `edit/tier toggle` 成功后仍保持现有 stale 提示，不自动刷新。
- 手动 `REFRESH` 和切换 Tx 自动刷新测试不回退。

## 测试计划

前端单测：

- 在 `pairing-page.test.tsx` 增加或更新添加成功用例：
  - 先点击 `REFRESH` 得到 counts。
  - 清空 `countCurrentRules` mock 调用记录。
  - 添加一个 available pairing property。
  - 断言 `addCurrentDraftProperty` 被调用。
  - 断言 `countCurrentRules` 自动再次以当前 Tx、添加后的 properties、当前 periodCode 调用。
  - 断言自动刷新传入的 properties 包含后端返回的 property group key。
  - 断言页面展示刷新后的 counts，而不是 stale 文案。
- 在 `pairing-page.test.tsx` 增加或更新删除成功用例：
  - 先点击 `REFRESH` 得到 counts。
  - 清空 `countCurrentRules` mock 调用记录。
  - 删除 existing pairing property。
  - 断言 `removeCurrentDraftProperty` 被调用。
  - 断言 `countCurrentRules` 自动再次以当前 Tx、删除后的 properties、当前 periodCode 调用。
  - 断言页面展示刷新后的 counts，而不是 stale 文案。
- 保留添加失败用例，并补充断言失败时不调用 `countCurrentRules`。
- 保留删除失败用例，并补充断言失败时不调用 `countCurrentRules`。
- 保留 tier toggle stale 用例，确保它仍不自动刷新。

验证命令：

```bash
cd pbs-portal
npm test -- --run src/features/pairing/pages/pairing-page.test.tsx
npm run build
```

## 实现结果

- `persistExistingPropertiesImmediately(...)` 增加 `refreshCountsOnSuccess` 可选行为。
- 添加 existing pairing condition 成功后启用自动刷新当前 Tx counts。
- 删除 existing pairing condition 成功后启用自动刷新当前 Tx counts。
- 自动刷新前同步 `latestPoolCountsInputRef`，确保 count API 使用添加/删除后的 properties 快照。
- 添加失败不触发 counts refresh。
- 删除失败不触发 counts refresh。
- edit / tier toggle 仍保持原有 stale 提示与手动刷新行为。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是一个前端局部行为变更，主要集中在 Pairing right panel 和对应测试，拆分成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/pairing/` 相关文件；如需要，新增 `docs/test-cases/pbs/pairing/` 测试说明。
- Conflict risk: 低。
- Execution gate: 用户确认本 spec 后再进入实现。
