# PBS Tier Pairing Pool 数字回填与 Zero Review 设计

日期：2026-05-12  
范围：`/tier` 页面 `View Pairing Set` 后的 Tx pairing pool 信息回填  
方案：懒加载回填，不在进入 Tier 时自动批量计算 `T1-T7`

## 背景

当前 `/tier` 已经可以从 `BID SUMMARY` 的某个 `T1-T7` 分组打开 `Pairing Set Preview`。Preview 会调用现有 `pairingService.previewCurrentRules()`，返回当前 Tx 的 pairing pool 结果、分页和 summary。

但 preview 结果目前只显示在弹窗里，关闭后 Tier 页面本身不知道这个 Tx 实际筛出了多少 pairings。AA Guide 的 Layer Tab 会把 pairing pool 数字作为 Layer 检查的重要信号，尤其是某层出现 0 时，用户需要知道该层规则可能太窄或存在冲突。

用户已确认采用“懒加载回填”方案：只有当用户点击某个 Tx 的 `View Pairing Set` 后，才把该 Tx preview 结果回填到 Tier 页面；不在页面初次加载时自动请求全部 T1-T7。

## 目标

- 用户从 Tx 分组 header 或单条 Pairing bid detail 打开 `Pairing Set Preview` 成功后，Tier 页面记住该 Tx 的 pool 数字。
- 在 `BID SUMMARY` 对应 Tx 分组 header 中显示已计算的 pool summary。
- 如果某个 Tx preview 成功且 `totalItems=0`，在 `TIER REVIEW` 中增加本地 review 提醒。
- 继续明确 preview 不是最终 Award，不做 RO/PO、法规、coverage 或资历计算。
- 不改数据库 schema，不新增后端 API，不新增依赖。
- 避免进入 `/tier` 时自动触发 7 个 pairing preview 请求。
- 本轮不改顶部 `BID STATISTICS` 表格结构；先把 pool 数字放在用户正在检查的 Tx summary 分组上。

## 非目标

- 不把 Pairing Pool 数字持久化到数据库。
- 不把 pool 数字写入 `GET /lineholder-bids/current/summary`。
- 不做最终 Award / Reason Report。
- 不做 Pairing Set 内移除 pairing。
- 不自动预取全部 T1-T7 pairing pool。
- 不把 AA 原文 `Layer/Lx` 带回 UI/API/代码；继续使用 `Tier / Tx / T1-T7`。

## 方案选择

### 方案 A：懒加载回填（采用）

用户点击 `View Pairing Set for Tn`，或从某条 Pairing bid detail 点击 `View Pairing Set` 后，前端调用现有 preview API。成功后，将返回的：

- `summary.pairingIdCount`
- `summary.totalItems`
- `pagination.totalPages`

保存到 `TierRightPanel` 的本地 state，并显示在对应 Tx 分组 header。若 `summary.totalItems === 0`，追加一条本地 `TIER REVIEW` 提醒。两个入口共享同一份 snapshot，不维护两套状态。

优点：

- 性能风险低。
- 不增加页面首屏请求数量。
- 复用现有 preview 数据流和缓存。
- 与用户主动 review 的交互一致。

代价：

- 用户未点开 preview 的 Tx 不显示 pool 数字。
- 统计区还不是完整 AA Layer Tab 的全量 pool table。

### 方案 B：进入 Tier 自动计算全部 Tx（不采用）

优点是首屏数字完整；缺点是会在进入页面后打满多次 preview 请求，和当前性能优化方向冲突。

### 方案 C：Refresh All Pool Counts 按钮（暂不采用）

可以作为后续增强。当前先不增加新的全量操作按钮，避免 UI 复杂化。

## 交互设计

### BID SUMMARY 分组 header

已有结构：

- 左侧：`T1`
- 右侧：`View Pairing Set`、`X bids`

新增懒加载后的 pool summary：

- 当该 Tx preview 成功后，显示：`Pool: 12 pairing numbers / 34 results`
- 如果 `totalItems=0`，显示：`Pool: 0 results`
- 未计算时不显示 `Pool`，避免让用户误以为是 0。
- 如果 preview 请求失败，不回填 pool 数字；错误仍只显示在 preview 弹窗中。

### TIER REVIEW 本地 zero 提醒

当某个 Tx preview 成功且 `summary.totalItems === 0`：

- 在 `TIER REVIEW` 中增加一条本地 diagnostic。
- severity 用 `info`，不是 hard error。
- 文案建议：`T2 pairing set is empty. Review whether this Tx is too restrictive or conflicting.`
- 这条提醒点击后打开 Tier-level review detail，不强行绑定到某条 bid。

当同一个 Tx 后续 preview 成功且不再是 0：

- 移除该 Tx 的本地 zero 提醒。

### Preview 关闭后的状态

- 关闭 `Pairing Set Preview` 后，回填的 pool 数字仍保留在当前 `/tier` 页面。
- 切换 preview 页码后，继续使用 response summary 更新同一个 Tx 的 pool 数字。
- 关闭 detail 或 preview 不清空 pool summary。

### 保存/删除后的状态

当用户在 Tier detail 中执行 `Edit Tx` 或 `Delete Bid` 成功：

- 清空本地 pool summary 和 zero review。
- 原因：saved rules 已变更，旧 preview 数字可能不再准确。
- Pairing Set Preview 继续按已有逻辑清空，避免展示旧结果。

### Tier summary 刷新后的状态

当 `TierRightPanel` 收到新的 `data` 对象时，也清空本地 pool summary 和 zero review。

原因：

- Tier summary 可能因为用户在 Pairing / Days Off / Line 页面保存、浏览器 refetch、权限/period 变化而刷新。
- 本地 snapshot 只代表“当前页面上一次 preview 的结果”，不应该跨新的 summary 数据继续显示。
- 这个清空只影响本地展示，不会影响已保存 bid。

## 数据设计

新增前端-only state：

```ts
type TierPairingPoolSnapshot = {
  tier: string;
  pairingIdCount: number;
  totalItems: number;
  totalPages: number;
  updatedAt: number;
};
```

建议放在 `TierRightPanel` 内：

```ts
const [pairingPoolSnapshots, setPairingPoolSnapshots] =
  useState<Record<string, TierPairingPoolSnapshot>>({});
```

成功 preview 后：

```ts
setPairingPoolSnapshots((current) => ({
  ...current,
  [target.tier]: {
    tier: target.tier,
    pairingIdCount: response.summary.pairingIdCount,
    totalItems: response.summary.totalItems,
    totalPages: response.pagination.totalPages,
    updatedAt: Date.now(),
  },
}));
```

本地 zero diagnostic 从 snapshot 派生，不写入后端：

```ts
const poolDiagnostics = Object.values(pairingPoolSnapshots)
  .filter((snapshot) => snapshot.totalItems === 0)
  .map((snapshot) => ({
    id: `pairing-pool-empty-${snapshot.tier.toLowerCase()}`,
    code: "pairingPoolEmpty",
    severity: "info",
    tier: snapshot.tier,
    tiers: [snapshot.tier],
    itemIds: [],
    message: `${snapshot.tier} pairing set is empty. Review whether this Tx is too restrictive or conflicting.`,
  }));
```

为了避免扩展后端 contract，`TierDiagnostic.code` 前端类型需要允许本地 code。后端 contract 不改，前端类型可用 string 继续承载。

## 数据流

1. 用户点击某个 Tx 的 `View Pairing Set`。
2. `TierRightPanel.loadPairingSetPreview()` 继续：
   - 复用 Pairing page data query cache。
   - 筛选该 Tx active Pairing properties。
   - 调用 `pairingService.previewCurrentRules()`。
3. preview 成功：
   - 更新 `pairingSetPreviewState`。
   - 更新 `pairingPoolSnapshots[target.tier]`。
4. 页面渲染：
   - `BID SUMMARY` group header 读取 snapshot 显示 pool summary。
   - `TIER REVIEW` 渲染 `data.diagnostics + localPoolDiagnostics`。
   - 打开 diagnostic detail 时，`resolveTierDetailViewModel()` 使用合并后的 diagnostics，确保本地 zero review 可以打开 Tier-level detail。
5. `Edit Tx` 或 `Delete Bid` 成功：
   - 清空 `pairingPoolSnapshots`。
   - 清空 preview state。
   - 失效 Tier summary query。
6. `TierRightPanel.data` 刷新：
   - 清空 `pairingPoolSnapshots`。
   - 本地 zero review 自动消失，直到用户重新打开 preview。

## 错误处理

- Preview 请求失败：保持当前 preview error UI，不更新 snapshot。
- 没有 active Pairing rules：当前逻辑会显示错误 `No pairing search rules are active in Tn.`，不生成 zero review。
- API 返回 0 results：这是成功结果，生成 zero review。
- 并发点击多个 Tx：沿用现有 `previewRequestSeqRef`，只保留最后一次有效 preview；snapshot 只在有效 response 时更新。
- 如果未来后端也返回同名 zero diagnostic，前端按 `id` 去重，避免同一 Tx 显示两条相同提醒。

## 性能约束

- 不在 `/tier` 首屏自动调用 preview。
- 不因为渲染 `BID SUMMARY` 而为每个 Tx 发请求。
- 继续复用 `pairingPageDataQueryKey`，避免重复慢 GET。
- Snapshot 是内存 state，页面刷新后消失，不增加服务端负担。

## 测试计划

前端单元测试：

- 点击 `View Pairing Set for T1` 成功后，`T1` header 显示 `Pool: 1 pairing numbers / 1 results`。
- preview 返回 `totalItems=0` 后，`TIER REVIEW` 显示 zero pairing review。
- zero review 点击后打开 Tier-level review detail。
- preview error 不显示 pool summary，不新增 zero review。
- 从单条 Pairing bid detail 打开 preview 也回填对应 Tx 的 pool summary。
- Edit Tx 成功后清空 pool summary。
- Delete Bid 成功后清空 pool summary。
- `TierRightPanel.data` 刷新后清空 pool summary。
- 已缓存 Pairing page data 时仍不调用 `pairingService.getPageData()`。

回归测试：

- `View Pairing Set` 弹窗原有 loading / success / empty / error / pagination 不回退。
- `BID SUMMARY` 仍然局部滚动。
- `TIER REVIEW` 没有 diagnostics 时仍不显示空壳；如果只有本地 zero review，则显示 review 区。
- 根目录 `npm run verify:pbs` 通过。

## 验收标准

- 用户从 Tx 分组或 Pairing bid detail 打开 Pairing Set Preview 后，回到 Tier 页面能看到该 Tx 的 pool 数字。
- 0 result 的 Tx 会在 `TIER REVIEW` 中出现 review 提醒。
- 未打开 preview 的 Tx 不显示误导性的 0。
- 保存、删除 bid 或 Tier summary 刷新后，旧 pool 数字会被清空。
- 本轮不改变顶部 `BID STATISTICS` 表格语义，避免把 bid count 和 pairing pool count 混在一起。
- 不新增后端 API，不新增数据库字段，不新增依赖。
- 不把 preview 当作最终 Award。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 `pbs-portal/src/features/tier` 的一个交互状态闭环，涉及同一组件和同一测试文件；并行拆分的协调成本高于收益。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/tier/components/tier-right-panel.tsx`、`pbs-portal/src/features/tier/components/tier-right-panel.test.tsx`，必要时小幅调整 `pbs-portal/src/features/tier/types.ts`。
- Conflict risk: 中等。当前 Tier 相关文件已有未提交改动，应继续顺序修改。
- Execution gate: 用户 review 并确认本 spec 后再实施代码。
