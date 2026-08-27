# PBS Tier AA 覆盖度对照清单

日期：2026-05-12  
范围：`/tier` 页面与 AA Guide `Layer Tab` 相关能力对照  
结论：Tier 主干闭环已经完成，可以给客户做主流程检查与轻量修正；但还不能说“AA Layer Tab 100% 完整复刻”，剩余主要是更细的 Pairing pool 统计、bid conflict/stepping 校验、以及最终 Award/Reason Report 接口展示。

## 参考来源

- `init-docs/AA-Flight-Attendant-PBS-Guide_10JAN19.pdf`
  - 第 83 页：Layer Tab 用于查看整个 lineholder monthly bid，并列出每层 specific pairings、pairing properties、line properties。
  - 第 84 页：Layer Tab 是检查 bid 和 pairing pools 的主要位置，包含 total pairings、pairings by layer、bar graph、View Pairing Set。
  - 第 85-88 页：Layer 可点击开关，统计会更新；空 layer、zero pairing、bid conflict 都需要用户 review。
  - 第 88-90 页：View Pairing Set 可查看某层 pairing set，并可移除不想要的 pairing。
  - 第 90-92 页：策略重点是逐层放宽约束，也就是 property stepping。
- `init-docs/AA PBS Learning Videos.docx`
  - 重点视频主题包括 Layers、Pairing Pools、Days Off、And/Or Logic、Specific vs Generic、Properties and Preferences、How to Read My Award。
- `init-docs/crew_bids_reference-2026-03-16-072929.xlsx`
  - 只参考，不导入。
  - 确认旧数据 `layer` 范围是 `1..24`。
  - `crew_bids` 是 `property_group_id + node_id` 的规则树结构，`node_id=2+` 多为 `AND` 条件链。
  - 高频属性覆盖 Pairing / DaysOff / Reserve / Line，当前 Tier 首先服务 Lineholder Current bid。

## 当前大白话结论

1. **Tier 主干已经做完了。**  
   用户在 Pairing / Days Off / Line / Calendar 保存的 current draft，现在能在 `/tier` 按 `T1-T7` 看到统计、汇总、详情、review 提醒、legacy 提示，并能对可追溯的 Pairing / Days Off / Line bid 修改 Tx 或删除。

2. **现在不是假 mock 主流程。**  
   Tier summary 走 `GET /lineholder-bids/current/summary`，编辑/删除复用真实来源模块 patch/delete API；mock 主要用于单测和本地 UI 回归。

3. **还不能说 AA 全部做完。**  
   AA Layer Tab 里还有更细的 pairing pool 数字、pairing set 内移除 pairing、bid conflict 检查、property stepping 质量判断、Award / Reason Report。这里面一部分是 PBS Tier 后续细化，一部分要等算法/优化接口结果。

4. **算法边界要继续守住。**  
   PBS 只保存、展示、校验、预览 bid rules；RO/PO、法规、coverage、资历、最终 Award 不属于当前 PBS Tier 的算法职责。后续算法服务整理好结果后，PBS 再调接口渲染最终结果。

## AA / 业务要求对照表

| AA / 业务要求 | 当前实现位置 | 状态 | 说明 | 建议下一步 |
| --- | --- | --- | --- | --- |
| Layer Tab 查看整个 Lineholder Monthly Bid | `pbs-server/src/services/lineholder/lineholder-summary-service.ts`、`pbs-portal/src/features/tier/*` | 已完成 | `/tier` 汇总 current draft，覆盖 Pairing / Days Off / Line / Calendar。 | 保持 current draft 作为 Tier 数据源，不单独创建 Tier 私有数据。 |
| 七层 Layer 主线 | `tier-draft-mappers.ts`、`lineholder-summary-diagnostics.ts` | 已完成 | AA `L1-L7` 在本项目统一为 `T1-T7 / Tx`。 | 不把 `Layer/Lx` 术语带回 UI/API/代码。 |
| 展示每层 bid 内容 | `TierRightPanel`、`TierDetailDialog` | 已完成 | `BID SUMMARY` 按 T1-T7 分组展示 bid，并支持点击详情。 | 后续只做信息密度和可读性优化。 |
| 区分 Pairing / Days Off / Line / Calendar | `PbsLineholderSummaryItem.bidType`、前端 `TierBidType` | 已完成 | 类型没有被伪装成 Pairing；summary 和 detail 都有类型 badge。 | Reserve 未来若进入 lineholder/reserve bid 流程，再补完整入口。 |
| 支持 bid group + AND 条件链 | `conditions` contract、`lineholder-summary-service.ts`、`tier-draft-mappers.ts` | 已完成 | 对齐 Excel `property_group_id + node_id` 结构，detail 中展示 Conditions。 | 后续补更多 property 的可读格式，不改变数据结构。 |
| 兼容旧数据 `T8-T24` | `warnings`、`legacyItems`、`legacyTier` diagnostics | 已完成 | 超出 T7 的数据不丢弃、不混入主区、只读展示。 | 迁移或旧数据浏览是否需要完整 T1-T24，是单独需求。 |
| Bid Statistics 基础统计 | `statisticsRows`、`BID STATISTICS` | 已完成 | 现在统计的是每个 Tx 的 saved bid 数量与类型数量。 | 保持作为 bid review 统计。 |
| AA 的 total pairings / pairings by layer 数字 | `TierPairingSetPreview`、`pairingService.previewCurrentRules()` | 部分完成 | 已能按 Tx 打开 Pairing Set Preview，看 pairing numbers / total results；但统计卡还不是 AA 那种累计 pairing pool 数字。 | 如果客户强依赖 AA 数字，下一步把 Tx preview count 接进统计区，并处理缓存/懒加载。 |
| AA bar graph 累计/新增 pairing pool | `StatBar` | 部分完成 | 现在 bar graph 表示 bid 数量分布，不是真实 pairing pool cumulative/additional。 | 做真实 pool count 后，再把图表语义升级。 |
| 空 Tier 提示 | `emptyTier` diagnostic、`No bids in this tier.` | 已完成 | 空 Tx 会提示，但这是“没有保存 bid”。 | 继续保留，不当作错误。 |
| AA zero pairing / pairing conflict 提醒 | `TIER REVIEW` diagnostics | 部分完成 | 已有 empty、duplicate、heavy/light、restrictive hint；但还没有通过真实 pairing pool 计算判断某 Tx 筛出 0 个 pairing。 | 优先补“preview total=0 时在 Tier Review 提醒”，这是 AA 体验里很关键的一步。 |
| Duplicate / bid-error review | `duplicateAcrossTier`、`unsupportedProperty` | 部分完成 | 已提示跨 Tx 重复、unsupported；尚未覆盖 AA 提到的同层 position order/TCR 等业务冲突。 | 结合 property catalog 和 Excel 高频属性，逐步做 catalog-based validators。 |
| Property stepping / 逐层放宽检查 | `restrictiveHint` | 部分完成 | 现在只是提示高风险 restrictive/waiver/clear 类属性，不判断 T2 是否比 T1 更宽。 | 后续做“同属性跨 Tx 的范围比较”，先覆盖 credit/time/duration 这类可比较属性。 |
| View Pairing Set | `tier-pairing-set-preview.ts`、`TierPairingSetPreviewDialog` | 已完成 | 支持从 Tx 分组或 Pairing bid detail 打开，只读预览当前 Tx pairing set。 | 下一步可把 preview count 回填到统计和 review。 |
| Pairing Set Preview 分页与详情 | `TierPairingSetPreview` | 已完成 | 有 loading / success / empty / error / retry / pagination，分页只刷新 preview。 | 可继续优化列表信息密度。 |
| Pairing Set 内移除某个 unwanted pairing | 尚未实现 | 未完成 | AA 允许从 pairing set 移除某层或所有层的 pairing；当前 preview 只读，不修改规则。 | 需要先确认业务模型：是生成 Avoid Pairing Number，还是修改 existing specific pairing bid。建议单独设计。 |
| 点击 layer 开关修改 bid 所属层 | `TierDetailDialog`、`tier-editing-actions.ts` | 已完成 | 在 Tier detail 用 `Edit Tx` 修改 T1-T7，并真实 patch 来源模块。 | 当前只修改 Tx，不在 Tier 重做参数编辑器。 |
| 删除 property / pairing bid | `DeleteBidPopconfirmButton`、`deleteTierSummaryItem` | 已完成 | Pairing / Days Off / Line 可真实删除；删除前有 Popover 确认。 | Calendar 单项删除如果客户需要，再补来源身份和稳定 API。 |
| Calendar day off / specific pairing 从日历点开改层或删除 | Tier 内为只读或来源模块处理 | 部分完成 | Tier 能展示 Calendar；Pairing detail 支持 Tx/delete。Calendar 在 Tier 暂不编辑。 | 如果客户要求 Tier 里改 Calendar day off，单独补稳定 mutation。 |
| Go back/source navigation | 当前已去掉 `Go to Pairing` | 已完成 | 按用户要求，Tier detail 底部不再放来源跳转，避免挤占操作区。 | 如果后续需要深链，可做成不占位的次级入口。 |
| 删除确认体验 | `Popover` from `@rois/ui` | 已完成 | 已按用户要求改成类似 Ant Popconfirm 的浮层确认。 | 保持所有危险操作都确认。 |
| 详情弹窗右上角关闭、分页左侧 | `TierDetailDialog`、`TierPairingSetPreview` | 已完成 | 右上角 `X` 关闭；Preview 分页/Previous/Next 放左侧；不显示 Back。 | 继续用测试守住回归。 |
| BID SUMMARY 容器内滚动 | `TierRightPanel` | 已完成 | Summary、Review、Warnings 都是局部滚动，不再滚整个页面。 | 后续大数据量时再考虑虚拟列表。 |
| 首次 `/api/pairing-bids/current` 慢请求优化 | `tier-right-panel.tsx`、后端性能修正相关文件 | 已完成 | Tier preview 复用 Pairing page React Query cache；服务端也做了冷链路观测和连接池优化。 | 继续观察真实环境慢日志。 |
| Award Tab / final award result | 尚未接最终结果接口 | 非 PBS Tier 当前范围 | 这是算法/优化之后的结果展示，不是 Tier rule 保存职责。 | 等 RO/PO/法规/coverage 接口定好，再做 Award/Result 页面。 |
| Reason Report | 尚未实现 | 非 PBS Tier 当前范围 | AA Reason Report 是 Award 结果解释，依赖算法输出。 | 等算法返回 reason payload 后再设计展示。 |
| Print / save PDF / logout | 尚未实现 | 低优先级 / 非核心 | AA 有打印月度 bid 的建议；当前客户价值低于 rule review/edit。 | 如客户要求提交前存档，再做 export/print。 |
| Excel 旧数据导入 | 明确不做 | 非范围 | 用户已明确 Excel 只参考不能导入。 | 保持不导入，只吸收字段结构和旧数据兼容经验。 |

## 当前代码/文档覆盖

- 设计文档：
  - `docs/superpowers/specs/2026-05-09-pbs-tier-bid-review-summary-design.md`
  - `docs/superpowers/specs/2026-05-11-pbs-tier-diagnostics-review-design.md`
  - `docs/superpowers/specs/2026-05-11-pbs-tier-detail-drilldown-design.md`
  - `docs/superpowers/specs/2026-05-11-pbs-tier-view-pairing-set-design.md`
  - `docs/superpowers/specs/2026-05-11-pbs-tier-tx-pairing-set-preview-design.md`
  - `docs/superpowers/specs/2026-05-12-pbs-tier-editing-design.md`
  - `docs/superpowers/specs/2026-05-12-pbs-tier-performance-readability-design.md`
  - `docs/superpowers/specs/2026-05-12-pbs-tier-popconfirm-design.md`
- QA 文档：
  - `docs/test-cases/pbs/tier/2026-05-09-tier-bid-review-summary.md`
  - `docs/test-cases/pbs/tier/2026-05-11-tier-diagnostics-review.md`
  - `docs/test-cases/pbs/tier/2026-05-11-tier-detail-drilldown.md`
  - `docs/test-cases/pbs/tier/2026-05-11-tier-view-pairing-set.md`
  - `docs/test-cases/pbs/tier/2026-05-11-tier-tx-pairing-set-preview.md`
  - `docs/test-cases/pbs/tier/2026-05-12-tier-editing.md`
  - `docs/test-cases/pbs/tier/2026-05-12-tier-performance-cache-regression.md`
- 主要实现：
  - `packages/contracts/pbs-lineholder-summary.d.ts`
  - `pbs-server/src/services/lineholder/lineholder-summary-service.ts`
  - `pbs-server/src/services/lineholder/lineholder-summary-diagnostics.ts`
  - `pbs-portal/src/features/tier/tier-draft-mappers.ts`
  - `pbs-portal/src/features/tier/tier-detail-selectors.ts`
  - `pbs-portal/src/features/tier/tier-pairing-set-preview.ts`
  - `pbs-portal/src/features/tier/tier-editing-actions.ts`
  - `pbs-portal/src/features/tier/components/tier-right-panel.tsx`
  - `pbs-portal/src/features/tier/components/tier-detail-dialog.tsx`

## 推荐下一步

### P0：先做 AA 覆盖验收，不急着加新功能

目标：用真实或接近真实的 current draft 数据，按这份清单跑一轮人工/自动回归，确认客户演示主流程没有断点。

重点验收：

- T1-T7 都能展示。
- Pairing / Days Off / Line / Calendar 都能汇总。
- 可编辑 bid 的 Edit Tx / Delete Bid 真实生效。
- Legacy / T8+ 只读且有提示。
- View Pairing Set 正常打开、分页、关闭。
- Summary 局部滚动和弹窗交互稳定。

### P1：补 AA 最明显的“真 pairing pool 数字”

现在统计区是 bid count，不是 AA 的 pairings by layer / total pairings。  
如果客户会拿 AA Guide 对照看页面，这里最容易被问到。

建议做法：

- 继续复用 `pairingService.previewCurrentRules()`。
- 不在页面首次加载时对 T1-T7 全量打 7 次重请求。
- 用户打开某个 Tx preview 后，把该 Tx 的 `totalResults / pairing number count` 缓存在 Tier 页面。
- 再考虑是否加“Refresh all pool counts”按钮，而不是自动打满请求。

### P1：补 zero pairing / conflict review

AA 很强调 layer 里出现 0 可能代表规则太窄或冲突。  
我们下一步可以先做低风险版本：

- 如果某 Tx preview 成功且 `totalResults=0`，在 `TIER REVIEW` 增加该 Tx 的提醒。
- 不把它当错误，不阻止保存。
- 文案保持 review 语气，例如 `T2 pairing set is empty. Review whether the Tx is too restrictive or conflicting.`

### P2：补 property stepping / bid-error 细化

结合 Excel 高频属性，优先做可比较属性：

- time：Check-In / Check-Out / Duty On Time。
- credit/block/duration：Pairing Total Credit / Average Daily Credit / TAFB / Layover Duration。
- days off：Prefer Off、Min/Max Consecutive。
- line：TCR / Clear Schedule / waiver 类。

这个阶段要注意：只做“提醒”，不要替算法做 award 判断。

### P2：确认是否需要 Pairing Set 内移除 pairing

AA 里 View Pairing Set 可以移除不想要的 pairing。  
这不是简单 UI 按钮，背后要确认数据语义：

- 移除某个 pairing 是新增 `Avoid Pairing Number`？
- 还是修改某个 existing specific pairing bid？
- “from this layer” 和 “from all layers” 对应哪些 Tx patch？

建议单独出设计，不要直接混进当前 Tier 代码。

## 给客户解释时的推荐说法

可以这样说：

> 现在 Tier 已经完成主流程：它能把 Pairing / Days Off / Line / Calendar 中保存好的规则按 T1-T7 汇总出来，用户可以检查每层规则、打开详情、预览某个 Tx 的 Pairing Set，并直接修正 Tx 或删除可编辑 bid。  
>  
> 剩下不是“主流程没做”，而是 AA Layer Tab 的高级细节：比如真实 pairing pool 数字回填到统计区、zero pairing / property stepping 的更细 review、以及最终 Award / Reason Report。最终 Award 是算法服务的输出，不属于 PBS Tier 自己计算。

