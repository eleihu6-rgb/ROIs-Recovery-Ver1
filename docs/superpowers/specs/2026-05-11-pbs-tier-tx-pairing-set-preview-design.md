# PBS Tier Tx Pairing Set Preview 设计

## 背景

`/tier` 当前已经具备只读 Bid Review / Summary、Tier Review 诊断、Bid Detail drilldown，以及从 Pairing bid detail 打开 `View Pairing Set` 的能力。

现有 `View Pairing Set` 已经复用 `pairingService.previewCurrentRules()`，按选中的 `Tx` 把当前 Pairing draft 中所有 active pairing properties 传给 `/pairing-search/preview`。也就是说，数据逻辑已经接近“看某个 Tx 的 pairing pool”，但入口仍藏在单条 Pairing bid 详情里。

用户现在希望继续完善 Tier，因此下一步应该把这个能力提升为更直接的 Tx 级检查：在 `BID SUMMARY` 每个 `T1-T7` 分组上直接查看该 Tx 当前 Pairing rules 形成的 pairing set。

## 目标

- 在 `/tier` 的每个 `T1-T7` summary 分组中增加只读 `View Pairing Set` 入口。
- 用户不需要先点开某条 Pairing bid，也能查看该 Tx 的 Pairing pool preview。
- Preview 仍然只表示“当前规则筛出的 pairing set”，不是最终 Award。
- 继续复用现有 Pairing current draft 和 `/pairing-search/preview`，不新增后端 API。
- 保持 Tier 页面只读，不增加编辑、保存、删除、拖拽、重排能力。

## 非目标

- 不实现 RO / PO 优化。
- 不实现法规、资历、coverage award、PN / CN / LN 判定。
- 不生成最终 Award。
- 不做 Reason Report。
- 不新增数据库 schema。
- 不导入 Excel。
- 不新增依赖。
- 不把 AA 原文 `Layer` 引入 UI / API / 代码，继续使用 `Tier / Tx / T1-T7`。

## 方案对比

### 方案 A：在每个 Tx 分组标题加 `View Pairing Set`（推荐）

优点：

- 最贴近用户在 Tier 页面逐层检查的心智。
- 复用现有 preview state 和 helper，改动集中在 `TierRightPanel`。
- 不改变现有 bid detail 内的 `View Pairing Set`。
- 用户可以直接从 `T1`、`T2` 等层级理解这一层的 Pairing pool。

代价：

- 如果该 Tx 没有 active Pairing rules，需要显示空态或禁用入口。

### 方案 B：只在顶部统计卡上加入口

优点：

- 页面更简洁。

代价：

- 用户需要先从统计卡跳转理解 Tx，和当前 Summary 检查流不够贴合。
- 入口离具体 bids 太远。

### 方案 C：新增单独 `Pairing Pool` 区块

优点：

- 后续可扩展成完整审查区。

代价：

- 右侧面板已经信息较密，新增区块容易挤压 Summary 和 Review。
- 当前阶段容易做重，暂不推荐。

## 推荐设计

采用方案 A。

在 `BID SUMMARY` 每个 `T1-T7` 分组 header 右侧增加一个小按钮：

- 文案：`View Pairing Set`
- 仅当该 Tx 存在 Pairing bid 时启用。
- 如果该 Tx 没有 Pairing bid，按钮不显示，避免用户误以为有 pool 可以看。
- 点击后打开与现有 detail preview 相同的 `Pairing Set Preview` overlay。

Preview header 显示：

- 标题：`Pairing Set Preview`
- 当前 Tx chip，例如 `T2`
- 统计：`X pairing numbers, Y total results`
- 明确说明：`Preview only. Final award is produced by the optimization run.`

## 数据流

继续使用现有前端数据流：

1. 用户点击 `Tn` 分组的 `View Pairing Set`。
2. 前端懒加载或复用 `pairingService.getPageData()`。
3. 从 `rightPanel.existingProperties` 中筛选该 `Tn` active 的 Pairing properties。
4. 调用：

```ts
pairingService.previewCurrentRules(
  tier,
  previewProperties,
  page,
  pageSize,
  periodCode,
)
```

5. 使用现有 `TierPairingSetPreview` 展示 loading / success / empty / error / pagination。

## 交互细节

- Tx 分组入口和 bid detail 入口复用同一个 preview state，避免两套逻辑。
- 打开 Tx 级 preview 时，不需要先打开 `Tier Bid Detail`。
- Preview 关闭后回到原本 Tier Summary 页面。
- 如果 preview 请求失败，显示 retry，不影响 Tier Summary。
- 如果该 Tx 有 Pairing bid，但完整 Pairing draft 中没有 active pairing rules，显示错误/空态：`No pairing search rules are active in Tn.`
- 切页只刷新 preview 结果，不刷新整个 Tier 页面。

## 实现范围

前端：

- 调整 `pbs-portal/src/features/tier/components/tier-right-panel.tsx`
  - 给 summary group header 增加 Tx 级 preview 入口。
  - 新增按 Tx 打开 preview 的 state/handler，复用现有 load preview 逻辑。

- 调整 `pbs-portal/src/features/tier/components/tier-right-panel.test.tsx`
  - 覆盖 Tx 分组显示 `View Pairing Set`。
  - 覆盖点击 Tx 入口直接打开 preview。
  - 覆盖没有 Pairing bid 的 Tx 不显示入口。

可选小调整：

- 如现有 helper 命名偏 bid detail，可在 `tier-pairing-set-preview.ts` 中增加 `resolveTierGroupPairingSetPreviewTarget(tier)` 这类纯函数。

后端：

- 不改后端 API。
- 不改 schema。
- 不新增 service 查询。

## 验收标准

- 用户能在 `/tier` 的某个 `T1-T7` Summary 分组上直接点击 `View Pairing Set`。
- 预览结果按该 Tx 的所有 active Pairing rules 生成。
- 预览明确不是最终 Award。
- 没有 Pairing bid 的 Tx 不出现入口。
- 现有 bid detail 内的 `View Pairing Set` 不回退。
- `BID SUMMARY` 局部滚动体验不回退。
- `npm run verify:pbs` 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 `pbs-portal/src/features/tier`，与当前未提交 Tier 改动在同一片区，单人串行更稳。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/tier/*`，必要时新增/更新 `docs/test-cases/pbs/tier/*`。
- Conflict risk: 中等。当前 Tier 相关文件已有多处未提交改动，应该继续在同一工作流里顺序修改。
- Execution gate: 用户 review 并确认本 spec 后再实施代码。
