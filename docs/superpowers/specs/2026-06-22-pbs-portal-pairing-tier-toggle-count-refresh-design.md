# PBS Portal Pairing Tier Toggle 与 Count 刷新设计

> 日期：2026-06-22  
> 状态：已确认并实施；追加 Playwright E2E 覆盖
> 范围：PBS Portal Pairing existing properties 的 tier toggle、row count、顶部当前 Tx count summary

## 1. 背景

Pairing 页面 Existing Pairing Properties 当前有一个交互问题：

- 用户点击某条 existing condition 的 `TIERS` 按钮后，顶部 summary 会变成 `Counts need refresh / Refresh current Tx`。
- 同时每行右侧 `COUNT` 会消失，只剩空白。

这会造成误导。用户实际期望是：

- 一条 condition 可以复用于多个 tier，例如同一个 `Any Landing In Airport · YVR` 可以同时勾选 `T4` 和 `T5`。
- 每行 `COUNT` 表示这条 condition 本身筛选出的 pairing 数量，和它被勾在哪些 tier 无关。
- 顶部 summary 表示当前 Tx 的组合规则统计，只有当前 Tx 的规则集合发生变化时才需要刷新。

## 2. 业务规则

### 2.1 Tier Toggle 是多选

Existing row 的 `TIERS` 不是单选移动。

允许一条 condition 同时 active 于多个 tier：

- 可以从 `T5` 变成 `T4 + T5`。
- 可以从 `T3 + T4` 变成 `T3 + T4 + T5`。
- 仍需保留现有“至少保留一个 active tier”的保护，避免一条 condition 没有任何 tier。

### 2.2 Row Count 不受 Tier Toggle 影响

每行右侧 `COUNT` 是该 condition 自己筛选出的 pairing 数量。

例如：

- `Any Landing In Airport · YVR` 对应 `70 pairings`。
- 用户把它从 `T5` 额外勾到 `T4` 后，condition 本身没有变，仍然应该显示 `70 pairings`。

因此 tier toggle 成功保存后：

- 不应清空 row count。
- 不应显示 row count skeleton。
- 不应删除 `poolCountRowsByPropertyKey` 里已有的 row count 数据。

### 2.3 顶部当前 Tx Summary 只在当前 Tx 受影响时刷新

顶部 summary 是当前 Tx 的整体规则统计。

需要根据当前顶部 Tx 和用户点击的 tier 判断：

| 当前顶部 Tx | 用户 toggle 的 tier | 是否影响当前 Tx | 期望行为 |
|---|---|---|---|
| `T1` | `T1` | 是 | 保存成功后自动刷新顶部 `T1` summary |
| `T1` | `T4` | 否 | 顶部 summary 保持原样 |
| `T4` | `T4` | 是 | 保存成功后自动刷新顶部 `T4` summary |
| `T4` | `T5` | 否 | 顶部 summary 保持原样 |

判断依据：

- 如果 toggled tier 等于当前顶部 Tx，则这次操作改变了当前 Tx 的规则集合。
- 如果 toggled tier 不等于当前顶部 Tx，则当前 Tx 的规则集合没有变化。

### 2.4 自动刷新，不让用户手动点 Refresh

当 tier toggle 影响当前顶部 Tx 时：

- 保存成功后自动调用当前 Tx count refresh。
- UI 可以短暂显示 loading / calculating 状态。
- 不应停留在 `Counts need refresh / Refresh current Tx`。

当 tier toggle 不影响当前顶部 Tx 时：

- 不刷新。
- 不 stale。
- 顶部 summary 和 row counts 保持保存前的可见结果。

## 3. 推荐实现方案

### 3.1 保留现有多选函数

继续使用现有 `togglePairingTierOptions` 语义，不改成单选。

需要保留：

- 多 tier active。
- 最后一个 active tier 不能被取消。

### 3.2 修改 Existing Tier Toggle 的 Count 行为

当前 `handleExistingTierToggle` 保存成功后走 `persistExistingPropertiesImmediately`，默认会调用 `markPairingPoolCountsStale()`，导致顶部 stale 且 row count 清空。

建议改为：

1. 在 `handleExistingTierToggle` 里计算本次 toggle 的 normalized tier label，例如 `T4`。
2. 读取当前顶部 Tx，例如 `currentPoolCountsTier` / `resolvePairingPoolCountsTier(activeTierLabelRef.current)`。
3. 如果二者相同：
   - 保存成功后自动刷新当前 Tx count。
4. 如果二者不同：
   - 保存成功后不 stale、不刷新。
   - 保留已有 count state。

可以通过扩展 `PersistExistingPropertiesFeedback` 支持一个更精确的策略：

- `refreshCountsOnSuccess?: boolean`
- `preserveCountsOnSuccess?: boolean`

或更清晰地改成：

- `countEffectOnSuccess?: "refresh" | "stale" | "preserve"`

推荐使用 `countEffectOnSuccess`，避免继续叠加 boolean。

### 3.3 不改变 Add / Delete / Edit 的现有语义

这些操作改变 condition 本身或当前规则集合，仍按现有逻辑：

- Add 成功后自动刷新。
- Delete 成功后自动刷新。
- Edit condition 的 action / bid / value 成功后自动刷新或按现有设计处理。

本次只修正 existing row `TIERS` toggle。

## 4. 测试设计

更新 `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`。

### 4.1 非当前 Tx Toggle：保留已有 Counts

场景：

1. 当前顶部 Tx 为 `T1`。
2. 先点击 `REFRESH`，得到成功 summary 和 row count。
3. 对某条 existing condition toggle `T2` 或其他非当前 Tx。
4. 等保存成功。

断言：

- `pairingService.patchCurrentDraftProperty` 被调用。
- `pairingService.countCurrentRules` 不被调用。
- 顶部不出现 `Counts need refresh`。
- 顶部仍显示原来的 rules / pairings summary。
- 原有 row count 仍显示，不被清空。

### 4.2 当前 Tx Toggle：保存成功后自动 Refresh

场景：

1. 当前顶部 Tx 为 `T1`。
2. 先点击 `REFRESH`，得到成功 summary 和 row count。
3. 对某条 existing condition toggle `T1`。
4. mock `countCurrentRules` 返回 pending promise。

断言：

- `pairingService.patchCurrentDraftProperty` 被调用。
- 保存成功后 `pairingService.countCurrentRules` 自动调用。
- loading 期间顶部显示刷新中。
- 不停留在 `Counts need refresh / Refresh current Tx`。
- refresh resolve 后顶部显示新的 summary。

### 4.3 Tier 多选仍然保留

场景：

1. 一条 existing condition 原本 active `T5`。
2. 用户点击 `T4`。

断言：

- 保存 payload 中该 property 同时包含 `T4` 和 `T5`。
- UI 中 `T4` 和 `T5` 都 active。
- 不应被改成单选移动。

### 4.4 Playwright E2E：真实点击验证 T4 / T5 切换

新增 Playwright 用例覆盖真实页面点击流程：

1. 登录 PBS Portal，进入 Pairing 页面。
2. 清空当前测试账号的 existing pairing properties，保证从干净草稿开始。
3. 在左侧日历选择 `T4`，确认顶部 pool-count summary 显示当前 Tx 为 `T4`。
4. 新增一条只属于 `T4` 的 pairing condition。
5. 等待顶部 summary 自动刷新，并记录该行右侧 `COUNT`。
6. 点击这条 condition 的 `T4`：
   - 因为 `T4` 是唯一 active tier，所以不能取消。
   - `T4` 保持 active。
   - 顶部 summary 和 row count 不变化。
7. 点击 `T5`：
   - condition 同时 active 于 `T4 + T5`。
   - 当前 Tx 仍为 `T4`，顶部 summary 不 stale、不刷新。
   - row count 保持不变。
8. 再点击 `T4`：
   - condition 从 `T4 + T5` 变成只属于 `T5`。
   - 因为当前 Tx 是 `T4`，顶部 summary 自动刷新。
   - refresh loading 期间 row count 仍可见。
   - refresh 完成后当前 `T4` 变成 `0 rules / No active pairing properties`，row count 仍保持原值。

## 5. 不做范围

- 不把 existing row tier toggle 改成单选。
- 不改变 row count 的计算 API。
- 不改变 `countCurrentRules` 后端逻辑。
- 不改变 `Search Pairings` 的 current rules 组合逻辑。
- 不改变新增 / 删除 / 编辑 condition 的刷新策略，除非测试发现它们依赖同一个错误的 stale 默认行为。

## 6. 验收标准

- 点击非当前 Tx 的 tier 后：
  - 多选状态保存成功。
  - row count 保留。
  - 顶部当前 Tx summary 保留。
  - 不出现 `Counts need refresh`。
- 点击当前 Tx 的 tier 后：
  - 多选状态保存成功。
  - row count 不被清空。
  - 顶部当前 Tx 自动刷新。
  - 不停留在 `Counts need refresh`。
- `pbs-portal npm run build` 通过。
- 相关 pairing page / pool count 测试通过。
- 若需要手工验证：在 Employee `19` 的 Pairing 页面，先 refresh 当前 Tx，再点击 existing row 的不同 tier，观察上述行为。

## 7. Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 范围集中在 `pairing-right-panel` 的 tier toggle count 状态和对应测试，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`、`pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`，必要时少量更新 `pairing-pool-counts` 测试。
- Conflict risk: 中等；现有测试明确断言 tier toggle 后 stale，需要改成新业务规则。
- Execution gate: 用户 review 本 spec 并确认后进入实现。
