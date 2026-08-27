# PBS Tier 删除 Pairing Statistics 区域设计

## 背景

`/tier` 页面中的 `PAIRING STATISTICS` 横向卡片区域已经和上方 `BID STATISTICS` 信息重复，而且该区域的数据来自 Pairing rules preview，不是最终算法 award/优化结果。继续展示会让客户误解它是确定的真实统计。

## 目标

- 删除 `PAIRING STATISTICS` 整个 UI 区域。
- 停止进入 Tier 页面后自动调用 pairing preview 来计算统计卡片。
- 保留 `BID SUMMARY` 中每个 Tier 的 `View Pairing Set` 按钮，用户点击时再按需加载 Pairing Set 预览。
- 保留点击预览后产生的本地 review 提醒，例如 pairing set 为空时的 `TIER REVIEW` 提醒。
- 不改接口、不改 mapper、不改算法职责。

## 非目标

- 不删除 Pairing Set 预览弹窗。
- 不改 `BID STATISTICS`、`TIER REVIEW`、`BID SUMMARY` 的核心结构。
- 不重新定义最终算法结果展示；最终 RO/PO/award 结果仍由算法接口返回后再展示。

## 验收标准

- Tier 页面不再显示 `PAIRING STATISTICS`。
- Loading 骨架屏也不再显示 `PAIRING STATISTICS`。
- 进入 Tier 页面时不再自动调用 `pairingService.previewCurrentRules` 来加载统计卡片。
- 点击 `BID SUMMARY` 里的 `View Pairing Set` 仍能打开 Pairing Set 预览弹窗。
- 编辑或删除 Tier bid 后，已有的 pairing preview 缓存/本地提醒会清理，避免展示旧数据。
- Tier 相关测试、类型检查和 lint 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在 Tier 右侧面板、loading 骨架和对应测试，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/tier/components/tier-right-panel.tsx`、`tier-right-panel-loading.tsx`、`tier-right-panel.test.tsx`。
- Conflict risk: 低；主要风险是误删 `BID SUMMARY` 中的 `View Pairing Set` 按需预览入口。
- Execution gate: 用户已确认删除 `PAIRING STATISTICS`。
