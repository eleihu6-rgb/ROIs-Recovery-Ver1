# PBS Bid Review 正式迁移设计

## 背景

`Tier` 页底部的 `BID SUMMARY` 已经收口到 `/bid` 页；目前 `/bid` 页也已经具备 bid 查看、编辑、删除、preview 和 Search Pairings 的主操作能力。

我们用前端 mock 预览过 `BID REVIEW` 的位置和交互：紧凑条展示前几条 warning，`+N more` 打开可滚动浮层。这个效果基本通过，需要把当前假数据替换成 `Tier Review` 的真实数据。

## 目标

1. 把现有 `Tier Review` 的配置类 review 迁移到 `/bid` 页的 `BID REVIEW`。
2. 删除 `/bid` 页临时 mock warning 数据。
3. `BID REVIEW` 使用 `useTierPageData()` 已经返回的真实数据：
   - `diagnostics`
   - `warnings`
   - `legacyItems`
   - `summaryGroups`
4. `BID REVIEW` 跟随左侧 calendar 当前 Tx：
   - 默认空选择 = `T1`
   - 选择 `T2` = 只显示和 `T2` 相关的 review item
   - 全局 item 可在所有 Tx 下显示，并标记 `All Tx`
5. `/tier` 页不再显示 `TIER REVIEW` 区块，只保留结果/分析类内容，例如 `PAIRING POOLS`。
6. `TierRightPanel` 本地生成的 pairing pool 结果类 diagnostics 不迁到 `/bid`，必须保留在 `/tier` 的 `PAIRING POOLS` 附近呈现。

## 非目标

- 不新增后端 API。
- 不修改数据库或 migration。
- 不改变 bid 保存 payload。
- 不改变 pairing search 过滤 SQL。
- 不把 `BID REVIEW` 做成阻塞提交的 validation；本次只是 review/提示。
- 不把 mock warning 继续留在正式代码里。
- 不把 `pairingPoolEmpty`、`pairingPoolNoNewPairings`、`pairingPoolCountError` 当成 bid 配置 review 迁到 `/bid`。

## 数据来源

当前 `/bid` 页已经调用：

```ts
const tierQuery = useTierPageData();
```

`tierQuery.data` 来自现有 `GET /lineholder-bids/current/summary` 映射后的 `TierPageData`，其中包含：

- `summaryGroups`: T1-T7 bid rows
- `diagnostics`: review 诊断
- `warnings`: legacy / unsupported warning
- `legacyItems`: T1-T7 以外或 legacy-only 的 bid row

因此正式迁移可以纯前端完成，不需要后端契约变化。

需要区分两个来源：

1. `useTierPageData()` 返回的 current-summary diagnostics / warnings / legacyItems：迁移到 `/bid` 的 `BID REVIEW`。
2. `TierRightPanel` 根据 pairing pool 计算结果本地生成的 diagnostics：保留在 `/tier`，作为 `PAIRING POOLS` 的结果状态，不进入 `/bid`。

第二类包括：

- `pairingPoolEmpty`
- `pairingPoolNoNewPairings`
- `pairingPoolCountError`

这些问题解释的是 Tx pairing pool 结果，不是 bid 配置本身，因此不应该和 `/bid` 的 existing bid 管理区混在一起。

## Review item 类型

把真实数据转换成统一的 `BidReviewItem`：

```ts
type BidReviewItem = {
  id: string;
  source: "diagnostic" | "warning" | "legacy";
  severity: "info" | "warning";
  module?: "Pairing" | "DaysOff" | "Line" | "Reserve" | "Unsupported";
  title: string;
  tiers: string[];
  groupKey?: string;
  itemIds?: string[];
};
```

转换规则：

- `diagnostics`
  - `message` -> `title`
  - `severity` 直接使用
  - `tiers` 直接使用
  - `groupKey / itemIds` 保留，用于后续定位 existing bid
- `warnings`
  - `message` -> `title`
  - `severity = warning`
  - 有 `tier` 则使用该 tier；无 tier 则视为 global
- `legacyItems`
  - `readableText` -> `title`
  - `severity = warning`
  - `tiers` 使用 item 自身 tiers
  - `module` 使用 `bidType`

## Tx 过滤规则

当前 `/bid` 的 existing list 已经把空选择解析为 `T1`。`BID REVIEW` 使用同一份 `activeSummaryTier`。

过滤规则：

```text
item.tiers 包含 activeSummaryTier => 显示
item.tiers 为空                 => 显示为 global
item.tiers 全部不在 T1-T7        => 显示为 legacy/global
```

这样：

- `T1` 下只看 T1 相关问题。
- `T2` 下只看 T2 相关问题。
- `duplicateAcrossTier` 如果包含 `T1/T2`，在 T1 和 T2 下都会显示。
- `legacyTier T12` 这种不属于 T1-T7 的问题不被某个 Tx 吃掉，应在所有 Tx 下显示，并标 `Legacy` 或 `All Tx`。

混合 legacy tier 规则：

```text
item.tiers 同时包含当前 Tx 和非 T1-T7 tier => 当前 Tx 下显示，并标 Legacy
item.tiers 包含其他 Tx 但不包含当前 Tx       => 当前 Tx 下不显示
item.tiers 只包含非 T1-T7 tier              => 所有 Tx 下显示，并标 Legacy
```

例如 `["T1", "T12"]`：

- 在 `T1` 下显示，标 `Legacy`。
- 在 `T2` 下不显示。

例如 `["T12"]`：

- 在 `T1` 到 `T7` 都显示，标 `Legacy`。

## UI 行为

保留 mock 预览验证过的布局：

```text
EXISTING BID PROPERTIES
[Pairing toolbar]
[BID REVIEW compact bar]
T1 only · N bids
[Existing bid list]
ADD BID PROPERTIES
```

### Compact bar

- 高度保持一行，不再做大卡片。
- 左侧显示 `BID REVIEW` 和当前 Tx，例如 `T1`。
- 最多展示前 3 条 review item。
- 如果超过 3 条，显示 `+N more`。
- 没有 review item 时显示轻量状态，例如 `No review warnings for T1.`，但不占大面积。

### More 浮层

- 点击 `+N more` 打开浮层。
- 浮层使用 `ScaledPageCanvas` 的 portal root，跟页面一起缩放。
- 浮层内部独立滚动，不制造 body 级外侧滚动条。
- 浮层列出当前 Tx 下全部 review item。
- 提供 `Close`。

### 定位 existing bid

第一版正式迁移不强制做复杂定位，但应该保留扩展点：

- 如果 item 有 `groupKey`，可以后续做 `Review bid` 滚动到 existing row。
- 如果 item 只是 tier-level，例如 `emptyTier`，不显示定位按钮。

## Tier 页处理

`/tier` 页：

- 移除 `TierReviewSection` 渲染。
- 不再显示 `TIER REVIEW`。
- `TierPage` loading / error 文案不再使用 `tier review` / `TIER REVIEW`，改成 pairing pools / tier analysis 语义。
- Help Center 的 Tier 文档同步改为：Tier 页负责 `PAIRING POOLS` 和 pairing set analysis；`BID REVIEW` 在 Bid 页。
- 保留：
  - `PAIRING POOLS`
  - tier review/detail 中和 pairing pool 直接相关的结果分析
  - pairing set preview

Loading skeleton 也同步移除 `TIER REVIEW` 卡片，避免用户以为 review 仍在 Tier 页。

### Pairing pool 诊断保留方式

现有 `TierRightPanel` 会把 pairing pool 本地诊断合并到 `TierReviewSection`。正式迁移后不能丢这些结果类提示。

迁移要求：

- `pairingPoolEmpty`、`pairingPoolNoNewPairings`、`pairingPoolCountError` 留在 `/tier`。
- 推荐把这些状态压进 `PAIRING POOLS` 行内或 section 顶部的轻量提示，而不是继续显示一个独立 `TIER REVIEW` 卡片。
- 用户在 Tier 页看到的是 Tx pool 结果分析；用户在 Bid 页看到的是 bid 配置 review。
- `TierDetailDialog` 如果当前只服务 review row，需要确认 pairing pool 结果是否仍需要 detail。第一版可以不保留 pool diagnostic detail，只保留 `View Set` / error text / row status。

## 组件组织

建议新增 feature-local 组件：

```text
pbs-portal/src/features/bid/components/bid-review-panel.tsx
```

职责：

- 接收 `tierPageData` 和 `activeTier`
- 转换/过滤 review items
- 渲染 compact bar 和 more 浮层

`BidPage` 只负责传参，不堆积更多 review 逻辑。

## 当前 mock 处理

当前 `BidPage` 里的：

- `MOCK_BID_REVIEW_WARNINGS`
- `BidReviewPreview`

必须删除或替换，不允许进入正式实现。

`MainLayout` 中为去掉 body 外侧滚动条做的 `h-dvh overflow-hidden` 修复可以保留，因为它是工作台布局 bug 修复，不依赖 mock 数据。

## 测试要求

### Unit / Component

1. `BidReviewPanel`
   - 无 review item 显示 empty state。
   - `T1` 只显示 T1/global/legacy item。
   - `T2` 只显示 T2/global/legacy item。
   - 超过 3 条时显示 `+N more`。
   - 点击 `+N more` 显示浮层全部 item。

2. `BidPage`
   - 渲染真实 `BID REVIEW`。
   - 不显示 mock 文案。
   - existing bid list 仍按 Tx 过滤。

3. `TierRightPanel / TierPage`
   - 不再渲染 `TIER REVIEW`。
   - `PAIRING POOLS` 仍显示。
   - pairing pool empty / no-new / count-error 状态仍能在 `PAIRING POOLS` 附近看到，不丢失结果提示。
   - loading / error 文案不再出现 `tier review`。

4. `MainLayout / ScaledPageCanvas`
   - 如果保留 body scroll 修复，继续覆盖主布局高度和 portal root。

5. Help
   - Tier Help 不再说 Tier 页包含 `BID REVIEW`。
   - Bid Help 如果已有 bid management 描述，需要补充 `BID REVIEW` 是 review-only 提示区。

### Playwright

至少覆盖 `/bid`：

1. 默认 T1 显示 `BID REVIEW`。
2. 点击 `+N more` 后浮层可见。
3. 浮层可滚动，不出现 body 外层假滚动条。
4. 切换左侧 T2 后 review 内容和 `T2 only` 同步。
5. `/tier` 不再显示 `TIER REVIEW`。
6. 更新现有 `bid-merged-workbench.spec.ts` 中仍期待 `/tier` 显示 `TIER REVIEW` 的断言。

### QA 人工测试

新增或更新：

```text
docs/test-cases/pbs/bid/<YYYY-MM-DD>-bid-review-migration.md
```

覆盖：

- Bid 页默认 T1 显示真实 `BID REVIEW`。
- 左侧 calendar 选择 T2 后，existing bid list 和 `BID REVIEW` 同步到 T2。
- `+N more` 打开浮层，浮层内部可滚动，页面外层不出现不可用滚动条。
- Tier 页只显示 `PAIRING POOLS` / pairing set preview，不再显示 `TIER REVIEW`。
- Pairing pool 为空、0 new、count error 的结果提示仍在 Tier 页可见。

### UI gate

前端样式变更后必须跑：

```bash
npm run check:ui
```

要求 hard violations 为 0。

### 模块门禁

因为这是 PBS Portal 核心页面行为迁移，交付前至少运行：

```bash
cd pbs-portal && npm test
cd pbs-portal && npm run lint -- --quiet
cd pbs-portal && npm run build
npm run check:ui
git diff --check
```

Playwright 需要跑 touched `/bid` / `/tier` 工作台相关用例。

## 风险与取舍

- 风险 1：`diagnostics` 里有些是 tier-level，不一定能定位到具体 bid。第一版只展示，不强制定位。
- 风险 2：global/legacy item 如果在每个 Tx 下都显示，用户可能觉得重复。可以用 `All Tx` / `Legacy` 标签降低误解。
- 风险 3：如果 `BID REVIEW` 未来要变成阻塞提交，需要后端 validation 契约；本次不做。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 主要改动集中在 `pbs-portal` 的 Bid/Tier 前端组件和测试，拆多人会改同一批文件，协调成本高。
- Suggested split: 不拆。
- Write boundaries: `pbs-portal/src/features/bid/components`、`pbs-portal/src/features/bid/pages`、`pbs-portal/src/features/tier/components`、相关 tests / QA。
- Conflict risk: Medium，因为当前 `BidPage` 里已有 mock 预览改动，需要正式替换。
- Execution gate: 用户确认本 spec 后再开始实现，不提交 git 除非用户明确要求。
