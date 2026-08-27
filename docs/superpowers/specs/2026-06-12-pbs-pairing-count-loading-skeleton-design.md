# PBS Pairing COUNT 切换 Tx 加载骨架屏设计

> 修正说明：该设计中的“切 Tx 时行级 COUNT 按当前 Tx 重新 skeleton”已被后续语义修正覆盖。最新设计见 `docs/superpowers/specs/2026-06-12-pbs-pairing-count-tier-independent-rows-design.md`：行级 `COUNT` 固定表示单条条件自己的 pairing 数，切 Tx 只刷新顶部汇总条。

## 背景

`/fpqe/pbs/pairing` 页面中，用户在左侧 Bidding Calendar 切换 `tier-01`、`ui-149`、`ui-81` 等 Tx/tier 按钮时，右侧 Existing Pairing Properties 会自动重新计算当前 Tx 对应的 pairing count。

当前问题是：切换后计算进入 `loading` 状态时，每一行的 `COUNT` 内容会变成空白占位。用户视觉上会感觉 COUNT 列“消失了一下”，缺少和页面首次加载一致的缓冲反馈。

## 目标

- 切换左侧 Tx/tier 后，右侧每一行 `COUNT` 不再突然变空。
- 计算期间显示行级 skeleton，占位尺寸与真实 count pill 一致。
- skeleton 风格复用页面首次加载的 `LoadingBlock`：`animate-pulse` + `#edf1f6`。
- 顶部汇总条继续显示当前已有的 loading 反馈，例如 `Refreshing / Calculating...`。
- 成功后 skeleton 替换为真实 count。
- 失败后不显示旧 Tx 的 count，保留错误状态和刷新入口。

## 非目标

- 不改变 count 计算接口。
- 不改变 Tx/tier 自动计算触发逻辑。
- 不保留旧 Tx 的 count 作为新 Tx 的临时显示，避免用户误以为新 Tx 已经计算完成。
- 不把整张表都做成 skeleton，因为只有 `COUNT` 列在重新计算。

## 现状分析

当前 `PairingRightPanel` 中：

- `refreshPairingPoolCounts(currentPoolCountsTier)` 会在切换 Tx/tier 后把 `pairingPoolCounts.status` 设置为 `loading`。
- `pairingPoolCountRowsByPropertyKey` 只有在 `status === "success"` 且 response tier 匹配当前 tier 时才返回数据。
- 行组件 `ExistingPairingPropertyRow` 收到的 `poolCount` 在 loading 期间为 `null`。
- `PairingPropertyTable` 目前对 `poolCount === null` 渲染的是空白固定高度 div，所以视觉上像 COUNT 消失。

## 设计方案

### 状态传递

在 `PairingRightPanel` 中为每一行额外传入 count loading 状态，例如：

- `isPoolCountLoading`

建议判定逻辑：

```ts
const isCurrentTierPoolCountLoading =
  pairingPoolCounts.tier !== currentPoolCountsTier
  || (
    pairingPoolCounts.status === "loading"
    && pairingPoolCounts.tier === currentPoolCountsTier
  );
```

这样可以覆盖 Tx 刚切换、effect 尚未把状态推进到 `loading` 的短暂帧，避免 COUNT 列先空一下再显示 skeleton。

行级传参时：

- 如果 property 当前启用了 `currentPoolCountsTier`，且当前 tier 正在 loading，则显示 skeleton。
- 如果 property 当前未启用 `currentPoolCountsTier`，继续显示空白占位。
- 如果 loading 结束且有 count，则显示真实 count。

### 行级渲染

在 `ExistingPairingPropertyRow` 中新增 props：

- `isPoolCountLoading?: boolean`

渲染优先级：

1. `isPoolCountLoading === true`：显示 skeleton。
2. `poolCount` 有值：显示真实 count pill。
3. 其它情况：显示原来的固定尺寸空白占位。

### Skeleton 视觉

复用 `LoadingBlock`：

```tsx
<LoadingBlock className="h-[30px] min-w-[150px] rounded-[6px]" />
```

要求：

- 高度与真实 count pill 一致：`30px`。
- 宽度与真实 count pill 一致：`min-w-[150px]`。
- 不改变表格行高度，避免 layout shift。
- 保持 `aria-hidden`，因为顶部汇总条已经负责 loading 文案。

## 验收标准

- 切换左侧 Tx/tier 后，右侧 `COUNT` 列每一行出现 skeleton，而不是空白。
- skeleton 与真实 count pill 尺寸一致，表格不跳动。
- 计算成功后，skeleton 替换为对应 Tx/tier 的 count。
- 切换到没有启用当前 tier 的 property 时，该行仍保持空白占位，不误显示 skeleton。
- 自动计算和手动 `REFRESH` 都复用同一套 loading 展示。
- 现有 pairing page 测试通过，并补充一条覆盖 loading skeleton 的测试。

## 测试建议

- 在 `pairing-page.test.tsx` 中补充测试：
  - mock `countCurrentRules` 返回 pending promise。
  - 切换 active tier 或触发 refresh。
  - 断言当前 tier 启用的 property 行出现 count skeleton test id。
  - resolve promise 后断言 skeleton 消失，真实 count 出现。
- 保留现有 count 文案断言，例如 `12 pairings`、`20 pairings`。

## 风险与约束

- 不应在 loading 期间展示旧 count，否则可能误导用户。
- Skeleton 只用于 COUNT 列，不要影响 property、bid、tiers 三列的稳定性。
- 如果当前 property 没有启用当前 Tx/tier，不显示 skeleton，避免用户以为这条规则也参与了当前 Tx 计算。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 该任务集中在一个 UI 状态流和一个行组件展示，拆分会增加协调成本。
- Suggested split: 无。
- Write boundaries: `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`、`pbs-portal/src/features/pairing/components/pairing-property-table.tsx`、`pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`。
- Conflict risk: 低。
- Execution gate: 用户 review 本文档后明确确认实现。
