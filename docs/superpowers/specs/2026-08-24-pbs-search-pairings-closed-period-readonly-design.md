# PBS Search Pairings 关闭期只读行为修复设计

## 背景

当前 `Pairing/Bid` 主页面已经能正确识别 bid window 关闭状态：当 `currentPeriod.canEditBid !== true` 时，已有 Pairing bid 的编辑、删除等写入入口会被禁用，用户不会进入 `UPDATING...` pending 状态，也不会发起写 draft 的请求。

但是 `Search Pairings` 页面存在另一条独立编辑路径：

- 用户从 `Pairing/Bid` 点击 `SEARCH PAIRINGS` 进入 `/bid/pairing/search`。
- 页面展示搜索结果和 `SEARCH CRITERIA`。
- 用户点击 criteria 上的 edit 图标后，仍能打开 `Configure Check-In / Check-Out Time` 等配置弹窗。
- 即使当前页面外层显示 `Bidding closed for Jun 2026`，弹窗里的 `UPDATE BID` 仍然可用。

这与 `Pairing/Bid` 主页面行为不一致，属于关闭期写入入口漏拦截。

## 目标

- 让 `Search Pairings` 中所有会修改 current pairing bid draft 的入口，严格对齐 `Pairing/Bid` 主页面的关闭期只读行为。
- bid window 关闭时，`Search Pairings` 仍然允许查看、搜索、翻页、筛选和预览 pairing。
- bid window 关闭时，禁止从 `Search Pairings` 修改 current draft，包括已有 criteria 的 `UPDATE BID` 和 All Pairings 的 `ADD PAIRING`。
- 防止绕过 UI disabled 状态直接触发写接口。
- 不再出现关闭期点击后卡在 `UPDATING...` 或 `ADDING...` 的状态。

## 非目标

- 不改变 pairing search 的查询、筛选、分页、结果展示逻辑。
- 不改变 `Pairing/Bid` 主页面已有只读逻辑。
- 不改变后端接口 contract。
- 不新增数据库 migration。
- 不改变关闭期是否能查看 Search Pairings 的产品策略；本次仍允许查看。
- 不改变 favorite 的长期语义；但如果某个 Search Pairings 动作会写 current bid draft，也必须受关闭期限制。

## 当前问题定位

关键代码路径：

- `pbs-portal/src/features/pairing/pages/search-pairings-page.tsx`
  - 已通过 `previewCurrentPeriod` 拿到 `currentPeriod.canEditBid` 和 `readOnlyReason`。
  - 当前只把 period 用于 pairing search 的 roster period 范围。
  - 没有把 `canEditBid=false` 传递给 criteria edit 和 add pairing 写入入口。
  - `updateExistingPreviewSource()` 会在关闭期继续调用 `pairingService.patchCurrentDraftProperty()`。
  - `handleAllPairingAddConfirm()` 会在关闭期继续调用 `pairingService.addCurrentDraftProperty()`。
- `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx`
  - 当前 `canConfirm` 只判断表单完整性、tier 选择、favorite 日期限制。
  - 没有只读 prop，也没有显示关闭期只读原因。

现有测试缺口：

- `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx` 已覆盖 `Pairing/Bid` 主页面关闭期只读。
- `pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx` 目前多处断言 `UPDATE BID` enabled，但没有 closed-period 场景。

## 设计方案

### 1. Search Pairings 统一解析只读状态

在 `SearchPairingsPage` 内基于 `previewCurrentPeriod` 生成统一状态：

```ts
const canEditCurrentBid = previewCurrentPeriod?.canEditBid === true;
const readOnlyMessage = previewCurrentPeriod?.readOnlyReason
  ?? "Bidding is closed for this period.";
```

要求：

- 只要 `canEditCurrentBid` 为 false，所有会写 current draft 的入口都必须禁用或拦截。
- 不依赖页面标题或文案判断关闭期。
- 以服务端返回的 `currentPeriod.canEditBid` 为唯一前端只读判断来源。

### 2. Criteria edit 行为对齐 Pairing/Bid

关闭期时，Search Pairings 中已有 criteria 的 edit 图标行为应对齐 `Pairing/Bid`：

推荐实现：

- `onCriteriaEditToggle` 在 `canEditCurrentBid=false` 时不打开可编辑弹窗。
- 点击后显示一次现有全局 message，内容使用 `readOnlyMessage`。
- 不进入 `isCriteriaUpdatePending`。
- 不调用 `pairingService.patchCurrentDraftProperty()`。
- 不显示 `UPDATING...`。

备选实现：

- 允许打开弹窗但 `UPDATE BID` disabled，并在弹窗内显示只读提示。

本需求推荐前一种，因为 `Pairing/Bid` 主页面在关闭期直接禁用编辑入口，不让用户进入一个看似可编辑的保存弹窗。

### 3. Dialog 层保留防御式只读能力

虽然入口层应拦截，但为了防止页面 state 或异步状态绕过，`PairingPropertyConfigDialog` 应支持一个轻量只读控制：

```ts
readOnlyReason?: string | null;
```

当 `readOnlyReason` 有值时：

- `canConfirm` 必须为 false。
- `canSaveFavorite` 如果当前动作会写 current draft，也应为 false。
- footer button 保持 disabled，不展示 pending label。
- 可在 footer 上方显示一条项目既有风格的只读说明，例如 `Bidding closed at May 08, 22:59.`

如果最终入口层不打开弹窗，这个能力仍作为防御保护，避免未来其他入口漏传时再次出现可提交状态。

### 4. 写入 handler 二次拦截

以下函数必须在最前面判断 `canEditCurrentBid`：

- `updateExistingPreviewSource()`
- `handleAllPairingAddConfirm()`
- `handleAllPairingCriteriaRemove()`，如果删除的是刚通过 All Pairings 写入 current draft 的条件

关闭期时：

- 直接 `message.error(readOnlyMessage)`。
- 立即 return。
- 不设置 pending。
- 不发任何写入请求。

这层拦截不能省略，因为 UI disabled 只解决正常点击，不解决异步 state、测试或未来复用造成的绕过。

### 5. All Pairings 的 ADD PAIRING 行为

All Pairings 预览仍可打开、筛选、查看 pairing。

关闭期时：

- 结果行上的 `ADD PAIRING` 不应可触发新增到 current draft。
- 如果当前组件只能通过 `resultAction` 控制展示，则关闭期下不传 `resultAction`，或传入 disabled 状态并显示 read-only message。
- 如果已经打开了 `Choose Tier` 弹窗，confirm handler 仍要二次拦截，不能写 draft。

优先选择与现有组件能力最小匹配的实现，不为一个 bug 引入新的复杂交互。

### 6. 错误展示标准

- 使用项目已有全局 `message.error()`。
- 文案使用 product 语言，不暴露异常对象或接口错误栈。
- 不新增单页自定义错误弹窗。
- 不无限重复 toast；同一次点击最多显示一次。

## 验收标准

- 当 `currentPeriod.canEditBid=true`：
  - Search Pairings 现有查看、搜索、编辑、更新、All Pairings 添加行为保持不变。
- 当 `currentPeriod.canEditBid=false`：
  - Search Pairings 页面仍能打开。
  - 搜索结果、分页、筛选、criteria 展示仍能使用。
  - 点击 criteria edit 不会打开可提交的 `UPDATE BID` 弹窗。
  - 不显示 `UPDATING...`。
  - 不调用 `pairingService.patchCurrentDraftProperty()`。
  - All Pairings 的 `ADD PAIRING` 不能写入 current draft。
  - 不调用 `pairingService.addCurrentDraftProperty()`。
  - 如用户点击被拦截入口，显示 `readOnlyReason` 或同等关闭期提示。
- 行为与 `Pairing/Bid` 主页面关闭期只读逻辑一致。

## 测试要求

### 单元 / 组件测试

更新或新增 `pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx`：

- 增加 closed-period mock：
  - `draftMeta.currentPeriod.canEditBid=false`
  - `readOnlyReason="Bidding closed at May 08, 22:59."`
- 覆盖从已有 property 进入 Search Pairings：
  - 页面仍显示 `Search Pairings` 和 criteria。
  - 点击 edit 后不出现可提交的 `UPDATE BID` 弹窗，或弹窗中的 `UPDATE BID` disabled。
  - `pairingService.patchCurrentDraftProperty` 未调用。
  - 页面不出现 `UPDATING...`。
- 覆盖 All Pairings：
  - 关闭期仍能展示 results。
  - `ADD PAIRING` 不会调用 `pairingService.addCurrentDraftProperty`。
  - 不出现 `ADDING...` 卡住。

如 `PairingPropertyConfigDialog` 新增 `readOnlyReason` prop，需要补组件测试：

- `readOnlyReason` 存在时，`UPDATE BID` disabled。
- 点击 confirm 不触发 `onConfirm`。
- 只读提示可见。

### Playwright 回归

需要用真实 UI 跑一条 closed-period Search Pairings 回归：

- 进入一个已关闭 bid window 的 period。
- 打开 `Bid -> Pairing -> Search Pairings`。
- 点击 Search Criteria 上的 edit 图标。
- 确认不会出现可提交的 `UPDATE BID` 行为，不会写入 draft。
- 返回外层 `Pairing/Bid`，确认主页面仍保持关闭期只读。

如果本地环境没有稳定 closed-period 数据，可以用已有 e2e mock/fixture 方式覆盖，但最终要说明真实页面或 mock 页面验证范围。

### 建议命令

```bash
pnpm --dir pbs-portal exec vitest run src/features/pairing/pages/search-pairings-page.test.tsx src/features/pairing/pages/pairing-page.test.tsx
pnpm --dir pbs-portal exec tsc -b --pretty false
npm run check:ui
pnpm --dir e2e exec playwright test --config=config/playwright.config.ts --project=pbs-portal --no-deps tests/pbs-portal/pairing-search.spec.ts --reporter=list
```

实际 Playwright 文件名以仓库现有测试为准。

## 风险与约束

- 不要把 search preview 禁掉；关闭期只禁止写 current draft，不禁止查 pairing。
- 不要只禁用按钮而漏掉 handler 二次拦截。
- 不要把 favorite 的纯本地 preview 改坏；只要动作会写 current draft，才受关闭期限制。
- 不要在 `Search Pairings` 里复制一套与 `Pairing/Bid` 不一致的关闭期文案。
- 不要引入后端兼容或数据库改动。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是一个小范围前端 bugfix，改动集中在 Search Pairings 页面、Pairing 配置弹窗和对应测试；多 agent 协同成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/pairing/pages/search-pairings-page.tsx`、必要时 `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx` / footer、对应 Vitest/Playwright。
- Conflict risk: 低，但要避免碰 unrelated pairing search 筛选逻辑。
- Execution gate: 用户确认 spec 后再实现。

