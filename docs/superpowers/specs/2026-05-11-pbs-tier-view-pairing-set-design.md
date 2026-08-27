# PBS Tier View Pairing Set 只读预览设计

## 背景

`/tier` 当前已经完成 AA Layer Tab 对应的本项目 `Tier / Tx` 检查能力：

- `BID SUMMARY`：按 `T1-T7` 展示用户在 `Pairing / Days Off / Line / Calendar` 保存好的 bid。
- `TIER REVIEW`：提示空 Tx、legacy Tier、unsupported property、跨 Tx 重复、分布异常和 restrictive hint。
- `Tier Bid Detail`：点击 summary 或 review 可查看只读 bid 详情。

下一步需要补齐 AA 里“用户检查自己提交规则”的关键体验：用户看到一条 Pairing bid 后，能继续查看这条规则当前能筛出哪些 pairings。这个能力是提交前的规则预览，不是最终排班结果。

## 产品边界

PBS Portal / PBS Server 在本阶段只负责：

- 保存用户在 `Pairing / Days Off / Line` 填写的规则。
- 在 `Tier` 页面让用户检查规则是否合理。
- 复用现有 pairing search 能力，预览 Pairing 规则筛出的 pairing set。
- 等外部算法服务完成法规、资历、覆盖率、RO/PO 优化后，再读取最终 Award 结果展示。

PBS 本阶段不负责：

- 不实现法规引擎。
- 不实现 RO/PO 优化。
- 不实现资历顺序分配。
- 不实现 coverage award / PN / CN / LN 判定。
- 不把 preview 结果当作最终 Award 结果。

## 目标

- 在 `Tier Bid Detail` 中，为 `Pairing` 类型 bid 增加 `View Pairing Set` 入口。
- 点击后打开只读 `Pairing Set Preview` overlay 或 detail panel。
- 预览当前 Pairing 规则在对应 Tx 下能筛出的 pairings。
- 展示 pairing number、base、report、credit、block、legs 摘要和运行日期。
- 支持分页或至少第一页结果，避免一次性渲染过多 pairing。
- 复用现有 `/pairing-search/preview` 和 `pairingService.previewCurrentRules()` 能力。

## 非目标

- 不新增 Pairing bid 编辑、保存、删除、拖拽、重排。
- 不修改用户已保存规则。
- 不做最终 Award。
- 不做 Reason Report。
- 不新增数据库 schema。
- 不导入 Excel。
- 不新增依赖。
- 不把 AA 原文 `Layer` 术语带入 UI/API/代码，仍使用 `Tier / Tx / T1-T7`。

## 推荐方案

采用 **Tier detail 内的二级只读预览**：

1. 用户在 `/tier` 点击某条 Pairing bid，打开 `Tier Bid Detail`。
2. Detail 中出现 `View Pairing Set` 按钮。
3. 点击按钮后，在同一 overlay 内切换到 `Pairing Set Preview` 视图，或打开嵌套的只读 preview section。
4. Preview 调用现有 pairing search preview API。
5. 用户可以关闭 preview 回到 bid detail。

推荐优先选择同一 overlay 内切换视图，原因：

- 不新增路由。
- 不跳走用户当前 Tier 检查上下文。
- 能直接复用已选中的 bid、Tx 和 review reasons。
- 比在右侧面板继续塞内容更稳，避免右侧 panel 被撑高。

## 数据流

### 当前可复用能力

现有后端已经有：

- `POST /pairing-search/preview`
- `mode: "current_rules"`
- 入参包括：
  - `tier`
  - `properties`
  - `periodCode`
  - `page`
  - `pageSize`

现有前端已经有：

- `pairingService.previewCurrentRules(tier, existingProperties, page, pageSize, periodCode)`
- `PairingDetailCard`
- `mapPairingSearchPreviewResponseToPageData`

### 需要补齐的数据来源

`TierSummaryItem` 适合展示 summary，但它不是完整 Pairing draft property。不能用 `readableText` 反向拼 preview 请求。

实现时需要拿到完整 Pairing draft properties，推荐两种方式：

1. `Tier` 页面额外读取 Pairing current draft，然后按 `propertyGroupKey / tiers` 过滤出当前 bid 所在 Tx 的 Pairing properties。
2. 或后端 lineholder summary response 增加足够的 stable reference，让前端能精确关联到 Pairing draft property，再用现有 draft properties 组装请求。

首期推荐方案 1：

- 前端在用户点击 `View Pairing Set` 时懒加载 `pairingService.getCurrentDraft()`。
- 将 current draft 映射成现有 `PairingExistingProperty[]`。
- 根据当前 detail 的 `groupKey / item.id / tiers` 找到同一 Tx 下的 Pairing properties。
- 调用 `previewCurrentRules(tier, filteredProperties, page, pageSize, periodCode)`。

这样不改后端 contract，也不增加数据库查询到 Tier summary API。

## 交互设计

### 按钮显示规则

`View Pairing Set` 只在以下条件都满足时显示：

- 当前 detail 有 `primaryItem`。
- `primaryItem.bidType === "Pairing"`。
- `primaryItem.warningCode` 不是 legacy-only / unsupported-only。
- 当前 item 至少有一个 `T1-T7` Tx。

以下情况不显示按钮：

- Days Off / Line / Calendar / Reserve。
- Tier-level review detail，例如 emptyTier / heavyTier。
- legacy `T8-T24` only 数据。
- unsupported property。

### Tx 选择

如果一个 Pairing bid 同时出现在多个 Tx：

- 首期默认使用用户打开该 summary row 所在的 Tx。
- 如果无法确定来源 Tx，则使用该 bid 的第一个 `T1-T7` Tx。
- 后续可在 preview header 增加 Tx selector，但首期不强求。

### Preview 内容

Preview header：

- 标题：`Pairing Set Preview`
- 副标题：当前 bid readable text。
- 显示当前 Tx chip。
- 显示 summary：`X pairing numbers, Y total results`。
- 明确文案：`Preview only. Final award is produced by the optimization run.`

Result list：

- 复用 `PairingDetailCard` 或抽取一个更紧凑的只读 card。
- 每条显示：
  - pairing id / pairing number
  - base
  - report time
  - total block
  - total credit
  - total pay
  - legs
  - active dates mini calendar

空结果：

- 显示 `No pairings match this saved rule set for the selected Tx.`
- 这是 preview 结果，不等同于最终 Award 失败。

错误：

- API 400：显示规则无法预览的说明。
- API 500 / 网络错误：显示 retry 入口。
- 不影响原 `Tier Bid Detail`。

分页：

- 首期 pageSize 使用 30，与现有 pairing preview 保持一致。
- 如果 `totalPages > 1`，显示 `Previous / Next` 或现有 pagination 控件。
- 切页只刷新 preview，不关闭 detail。

## 技术设计

### 前端新增/调整

建议新增：

- `pbs-portal/src/features/tier/tier-pairing-set-preview.ts`
  - 负责从 `TierDetailViewModel` 和 Pairing current draft 中解析 preview 请求所需数据。
  - 纯函数，便于单测。

- `pbs-portal/src/features/tier/components/tier-pairing-set-preview.tsx`
  - 只读展示 preview loading / empty / error / results。

调整：

- `tier-detail-dialog.tsx`
  - 为 Pairing detail 增加 `View Pairing Set` 入口。
  - 管理 preview open/back 状态，或由父组件传入状态。

- `tier-right-panel.tsx`
  - 如需持有 async preview 状态，可在这里管理 selected detail 与 preview state。
  - 避免把 API 调用塞进纯展示组件。

复用：

- `pairingService.getCurrentDraft()`
- `pairingService.previewCurrentRules()`
- `PairingDetailCard`
- 现有 request / query patterns。

### 后端

首期不新增后端 API。

继续使用：

- `POST /pairing-search/preview`
- `preview.mode = "current_rules"`

后端不实现 Award / optimizer。

## 性能与安全

- Pairing current draft 只在用户点击 `View Pairing Set` 时懒加载。
- Preview 使用分页，避免一次性拉取过多 pairing。
- 不在 console 输出 crew/pairing 敏感数据。
- 不新增外部网络依赖。
- 不记录用户 bid 内容到日志。

## 测试计划

前端纯函数测试：

- Pairing item 能解析出 preview tier。
- 多 Tx bid 默认选择正确 Tx。
- Days Off / Line / unsupported 不允许 preview。
- legacy-only item 不允许 preview。
- 找不到 Pairing draft property 时返回可展示错误。

前端组件测试：

- Pairing detail 显示 `View Pairing Set`。
- Days Off / Line detail 不显示该按钮。
- 点击后显示 loading。
- 成功后显示 summary 与 pairing cards。
- 空结果显示空状态。
- API error 显示 retry。
- `Back` / `Close` / `Escape` 行为正常。

回归：

- `Tier Bid Detail` 原有 summary、conditions、review reasons 不变。
- `TIER REVIEW` 点击 detail 不受影响。
- `/pairing` 当前搜索、保存、预览链路不受影响。

## 验收标准

- 用户能从 Tier 的 Pairing bid detail 打开 `Pairing Set Preview`。
- Preview 明确是规则预览，不是最终 Award。
- Preview 数据来自已保存 Pairing 规则和现有 pairing search API。
- 不修改用户规则，不新增保存行为。
- Days Off / Line / Calendar 不出现 pairing set 入口。
- 旧数据和 unsupported 数据不报错。
- 根目录 `npm run verify:pbs` 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本功能集中在 Tier detail、Pairing draft 映射和现有 preview service 复用，交互状态和测试耦合较紧，单人串行更稳。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/tier/*`，必要时只读参考 `pbs-portal/src/features/pairing/*` 和 `pbs-portal/src/shared/services/pairing-service.ts`。
- Conflict risk: 中等。当前 Tier diagnostics/detail 改动尚未提交，继续在同一 feature slice 顺序开发可减少冲突。
- Execution gate: 用户 review 本 spec 并明确确认后再实现。
