# PBS Tier 布局与 Pairing Statistics 设计

日期：2026-05-12  
范围：`pbs-portal` 的 `/tier` 页面右侧主内容区  
状态：待用户确认后实施

## 背景

AA Guide 的 Layer Tab 不是最终提交页，而是 bid review 工作区。用户在 Pairing / Days Off / Line 中录入偏好后，PBS 自动保存；Layer/Tier 页面负责集中展示每层 bid、pairing pool 数字、风险提醒，并允许用户继续检查和调整。

当前 `/tier` 页面已经具备 `BID STATISTICS`、`BID SUMMARY`、`TIER REVIEW`、详情弹窗、`View Pairing Set`、`Edit Tx`、`Delete Bid` 等主流程能力。但随着功能增加，竖向空间开始紧张，`TIER REVIEW` 单独占一整块会挤压后续 `PAIRING STATISTICS` 的位置。

## 目标

1. 继续按 AA 思路做 review 型页面，不增加最终 `Submit` 交互。
2. 把 `BID STATISTICS` 与 `TIER REVIEW` 横向排列，减少竖向占用。
3. 在 `BID SUMMARY` 上方新增/恢复 `PAIRING STATISTICS` 区域，用来承载 AA 里的 pairing pool 统计概念。
4. `BID SUMMARY` 保持底部位置和现有高度体验，继续在容器内部滚动。
5. 保留 `TIER REVIEW` 当前已有功能，只调整展示位置和滚动方式。

## 推荐布局

```text
┌───────────────────────────────┬──────────────────────┐
│ BID STATISTICS  60%            │ TIER REVIEW  40%     │
│ 当前高度保持不变               │ 内部滚动             │
└───────────────────────────────┴──────────────────────┘

┌──────────────────────────────────────────────────────┐
│ PAIRING STATISTICS                                   │
│ 展示 T1-T7 的 pairing pool 统计与加载状态            │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ BID SUMMARY                                          │
│ 继续放底部，保持当前容器内滚动                       │
└──────────────────────────────────────────────────────┘
```

## 交互定义

### BID STATISTICS

- 放在顶部左侧，占顶部区域约 60% 宽度。
- 保留现有 bid count / 类型分布展示。
- 不改变现有统计语义，避免把 bid count 误改成 algorithm award 结果。

### TIER REVIEW

- 放在顶部右侧，占顶部区域约 40% 宽度。
- 保留当前所有诊断来源和点击能力：
  - 空 Tx 提醒。
  - 重复/冲突类 review。
  - legacy / T8+ 相关提醒。
  - preview 后回填的 0 pairing set 提醒。
  - 点击 row 打开现有 detail dialog。
- 右侧区域高度跟顶部统计区一致；内容过多时只在 `TIER REVIEW` 内部滚动。
- 如果没有 review 项，显示轻量 empty state，而不是整块消失，避免顶部 60/40 布局跳动。

### PAIRING STATISTICS

- 放在 `BID SUMMARY` 上方，占用原来 `TIER REVIEW` 的竖向区域。
- 用来承载 AA 的 `Pairings by Layer` 概念。
- 首版建议展示每个 T1-T7 的 pairing pool 状态：
  - Tx。
  - pairing numbers。
  - total results。
  - 状态：not loaded / loading / loaded / empty / error。
  - 可点击 `View Pairing Set`，复用现有 preview 弹窗。
- 页面刚进入时可以显示 skeleton/loading 状态；性能上不能因为全量 preview 把页面卡住。

## 数据与性能策略

本次不改变后端 schema，不引入算法职责。

优先复用已有能力：

- `useTierPageData()` 加载 current bid summary。
- `pairingPageDataQueryKey` / `pairingService.getPageData()` 读取 Pairing 当前 draft。
- `pairingService.previewCurrentRules()` 预览某个 Tx 的 current pairing rules。
- 现有 preview 结果继续回填到本地 pairing pool snapshot。

性能要求：

- `/tier` 页面主体先快速渲染，不等待所有 pairing pool preview 完成。
- `PAIRING STATISTICS` 可以用 skeleton 或逐项 loading 表示数据正在补齐。
- 避免重复请求：已有 React Query cache 的 Pairing page data 必须复用。
- T1-T7 preview 如需自动加载，应做并发控制或轻量批量策略，避免一次性把页面变慢。
- preview 失败不阻断 Tier 页面，单个 Tx 显示 error / retry 即可。

## 非目标

- 不做最终 `Submit Bid`。
- 不实现 RO/PO 优化、法规计算、seniority award、最终 award result。
- 不把 AA 的 `Layer/Lx` 术语引入 UI/API/code，项目内继续用 `Tier / Tx / T1-T7`。
- 不导入 Excel 数据。
- 不修改数据库 schema。

## 验收标准

1. 顶部区域为 60/40 横向布局：左侧 `BID STATISTICS`，右侧 `TIER REVIEW`。
2. `TIER REVIEW` 现有功能保留，点击 review row 仍能打开 detail。
3. `TIER REVIEW` 内容过多时只在自身区域滚动。
4. `PAIRING STATISTICS` 位于 `BID SUMMARY` 上方。
5. `BID SUMMARY` 保持底部位置、现有高度和容器内滚动。
6. `View Pairing Set` 弹窗、分页、关闭、错误/空状态保持可用。
7. 页面加载时有合适的 skeleton/loading，不因 pairing statistics 数据补齐而白屏。
8. 现有 Tier 单测通过，并补充布局/保留 review 功能相关测试。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次改动集中在 Tier 右侧面板布局、局部状态和测试，拆分多 agent 容易同时编辑 `tier-right-panel.tsx` 造成冲突。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/tier/components/*`、Tier 相关测试；如有必要更新对应文档。
- Conflict risk: 中等，主要风险是 `tier-right-panel.tsx` 状态较集中。
- Execution gate: 用户确认本 spec 后再实施。

## 实施计划草案

1. 调整 `TierRightPanel` 布局结构：顶部新增 60/40 grid，把 `BID STATISTICS` 与 `TIER REVIEW` 放在同一行。
2. 抽出或整理 `TIER REVIEW` 区块组件，确保移动位置后现有点击、detail、diagnostic merge 不受影响。
3. 新增 `PAIRING STATISTICS` 区块，先复用已有 `pairingPoolSnapshots` 和 preview 加载能力。
4. 优化 loading skeleton，使页面进入时能清楚看到三段结构。
5. 更新/补充 Tier 组件测试。
6. 运行 Tier focused tests、`pbs-portal` lint/build，必要时跑 `verify:pbs`。
