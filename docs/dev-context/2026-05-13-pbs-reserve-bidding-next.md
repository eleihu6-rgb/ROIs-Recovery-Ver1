# 开发上下文（2026-05-13）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-13 16:00:00 CST
- Wing：`pbs`
- Topic：`reserve-bidding-next`
- Title：PBS Line/Tier 阶段完成与 Reserve 备勤开发入口
- Git branch：`main`

## 本轮对话上下文

本轮 PBS 开发上下文保存，供新窗口恢复。

一、当前整体状态

- 当前主要完成的是 PBS Lineholder 主业务线：Pairing / Days Off / Line / Tier。
- Tier 可以暂时定义为阶段性完成：已经能汇总 Pairing / Days Off / Line / Calendar bid，展示 Bid Statistics、Tier Review、Bid Summary，并支持详情查看、可编辑来源的 Edit Tx / Delete Bid、Calendar Day Off 的 Remove Day Off 等交互。
- 用户已经明确：算法 / RO / PO 优化不是 PBS 前端当前开发范围。PBS 负责保存用户规则和提交规则；算法侧后续会读取规则或通过接口拿规则，再返回最终结果给 PBS 展示。
- 当前不要把 Tier Review 或 Tier Summary 误解为最终算法 Award 结果，它仍然是用户当前 draft 的规则检查/汇总视图。

二、最近完成的重要改动

1. Line / Tier 质量治理
- 设计文档：docs/superpowers/specs/2026-05-13-pbs-line-tier-quality-governance-design.md
- 后端 Line 大文件做了按业务模块拆分，但遵守用户新增规则：不要为了拆而拆，只有当拆分能提高阅读性、复用性或降低复杂度时才拆。
- line-bid-service.ts 从约 1566 行降到约 578 行。
- 新增/拆出：
  - pbs-server/src/services/line/line-draft-property-helpers.ts
  - pbs-server/src/services/line/line-draft-property-write.ts
  - pbs-server/src/services/line/line-draft-property-helpers.test.ts
- Tier 前端拆出多个清晰组件：
  - tier-bid-type-badge.tsx
  - tier-detail-actions.tsx
  - tier-pairing-set-preview-dialog.tsx
  - tier-review-section.tsx
  - tier-summary-sections.tsx
- tier-right-panel.tsx 和 tier-detail-dialog.tsx 已经降低到更可维护范围。

2. Tier UI 交互细化
- T2 等 Tier bid 已经支持 View/详情查看。
- 详情弹窗右上角改成 X 关闭按钮。
- Page 1 of 1 / Previous / Next 放到左侧。
- 删除使用项目现有 Popconfirm 组件风格，不再使用不存在的 @rois/ui Popover 导出。
- Delete Bid 和 Edit Tx 放到底部右侧，View Pairing Set 放到底部左侧并单独弹窗展示 pairing set，避免所有内容挤在一个弹窗。
- Bid Summary 放到底部，内部滚动，并增加 T1-T7 tab/按钮切换，避免用户一直纵向滚动。
- Pairing Statistics 卡片已经删除，因为与上方统计重复且数据口径容易误导。
- Distribution 显示曾被用户指出看不到，最新修正文件为：pbs-portal/src/features/tier/components/tier-summary-sections.tsx。当前工作树仍有这个文件未提交修改。

3. 验证结果
- pbs-server npx tsc --noEmit 通过。
- pbs-server npm test -- --test-name-pattern=line 通过。
- pbs-server npm test -- --test-name-pattern=lineholder 通过。
- pbs-portal npx tsc --noEmit 通过。
- pbs-portal npx vitest run src/features/line src/features/tier 通过。
- pbs-portal npm run lint 通过。
- root npm run verify:pbs 通过。
- pbs-server npm run perf:pbs -- --base-url=http://127.0.0.1:3002 --samples=5 --budget-ms=2000 通过；Line current max 约 1043ms，Lineholder summary max 约 1656ms。
- 最近 Distribution 修复后又单独跑过：
  - pbs-portal npx tsc --noEmit
  - pbs-portal npx vitest run src/features/tier/components/tier-right-panel.test.tsx src/features/tier/pages/tier-page.test.tsx
  - 25 tests passed。

三、用户偏好和必须延续的约定

- 用户希望所有开发解释用大白话、清楚说明“做到哪一步、下一步做什么、为什么”。
- 不要把算法侧任务揽进 PBS 开发。
- 不要为了拆文件而拆文件；如果业务逻辑天然集中，拆完反而难读，就不要拆。
- 优化/重构不能破坏之前已经开发好的功能。
- 开发新功能、行为变化、多文件改动前，必须按 AGENTS.md 先走 brainstorming/spec，用户确认后才能改代码。
- 用户准备开新窗口继续新功能开发，下一条主线大概率是 Reserve / 备勤。

四、Reserve / 备勤结论

用户问：“resweve 页面是干什么的，在 aa 文档中，我记得我们还有一个备勤人员的提交也没有做。”

已确认结论：

- 用户记得是对的，AA 文档里确实有 Reserve Bidding Module / 备勤提交。
- 当前 /reserve 页面不是完整业务，只是早期迁移出来的壳页面。
- 当前代码：
  - pbs-portal/src/features/reserve/pages/reserve-page.tsx 只加载 reserveCalendarData mock。
  - pbs-portal/src/features/reserve/components/reserve-right-panel.tsx 只有 heatmap、ADD BID 按钮、month calendar selection。
  - ADD BID 当前 onClick 是空行为，没有真实保存、规则创建或提交。
- 当前没有找到完整 Reserve 后端 API/service。
- 当前 Lineholder summary/types 里虽然有 Reserve 计数和类型，但 Reserve 在 Tier editing 中仍是只读/不支持编辑，不能认为 Reserve 已完成。
- 早期文档明确第一阶段先不做 Reserve：
  - docs/handoff/pbs/pbs-dev-handoff-2026-04-22.md
  - docs/superpowers/specs/2026-04-22-lineholder-bidding-design.md
- AA 文档里的 Reserve 业务大意：
  - Reserve 备勤人员不挑航班、不挑 pairing。
  - 主要提交 Prefer Off / 想休哪几天。
  - 系统基于合法作息模式筛选，比如连续待命 3-6 天、连续休息 2-8 天。
  - UI 上需要展示每日 Targeted Reserves / 备勤缺口，帮助判断哪天休假被满足的概率。
  - Bubble Bidder 可能需要同时提交 Lineholder 和 Reserve 两套志愿。
- 所以大白话：当前完成的是 Lineholder 正班主线；Reserve 是另一条平行业务线，目前还没正式开发。

五、新窗口建议下一步

新窗口启动后：

1. 先读 NEXT_CONTEXT.md、AGENTS.md、docs/dev-context/LATEST.md。
2. 再读 PBS 模块规范：pbs-portal/AGENTS.md、pbs-server/AGENTS.md。
3. 只读恢复上下文后，向用户确认：是否正式把 Reserve Bidding 作为下一条开发主线。
4. 如果用户确认开发 Reserve：
   - 必须先使用 brainstorming skill。
   - 重点阅读 AA 文档：init-docs/PBS 智能排班竞标系统需求规格书.md 第 7 节 Reserve Bidding Module。
   - 同时参考 init-docs/crew_bids_reference-2026-03-16-072929.md 中 Reserve 属性 301/302。
   - 产出设计文档，例如 docs/superpowers/specs/2026-05-13-pbs-reserve-bidding-design.md 或按当天日期命名。
   - 文档中要明确：Reserve 是否单独 draft、是否共用 pbs_bid、是否进入 Tier、是否进入最终 Submit、Bubble Bidder 怎么处理、哪些规则先做、哪些留给算法。
   - 用户确认文档后再改代码。

六、当前工作树注意事项

- 当前 git status 显示仍有未提交修改：pbs-portal/src/features/tier/components/tier-summary-sections.tsx。
- 这应该是最近修复 Tier Bid Statistics Distribution 显示的文件。
- 新窗口不要随意 revert。若要继续开发 Reserve，先保留这个改动，必要时先让用户决定是否提交/暂存或继续在同一工作树开发。

## 当前工作树快照

### git status --short

```text
 M pbs-portal/src/features/tier/components/tier-summary-sections.tsx
```

### unstaged changed files

```text
pbs-portal/src/features/tier/components/tier-summary-sections.tsx
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-13-pbs-reserve-bidding-next.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
