# 开发上下文（2026-05-19）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-19 17:12:46 CST
- Wing：`pbs`
- Topic：`days-off-add-tier-dialog-and-single-source`
- Title：days-off-add-tier-dialog-and-single-source
- Git branch：`main`

## 本轮对话上下文

# PBS Days Off 上下文保存 - 2026-05-19

## 当前状态

本轮主要完成 PBS Days Off 的单一真相源收口，以及 Days Off Add property 交互调整。

用户明确偏好：
- 开发文档默认中文。
- 新功能/行为变更必须先 spec/brainstorming，再实现。
- 接口响应不能超过 2s。
- 代码要模块化清晰，避免屎山。
- 不要把需求范围理解大；只改用户指定范围。
- Submit / Award / Reserve 暂停，不要主动开发。
- Line 后续单独开题，不要混在 Days Off 里改。

## 已完成：Days Off 单一真相源

业务口径：
- `Prefer Off / pbs_bid_group` 是 Days Off 唯一运行时数据源。
- 左侧日历 Off 是 Prefer Off 快捷编辑器。
- 右侧 Existing 显示同一套 Prefer Off/property 数据。
- `pbs_bid_day_off` 不再参与运行时读、写、展示、summary、pairing conflict、tier sync。
- 数据库表/model/schema 暂时保留为历史结构，不改 sql/schema。

关键后端改动：
- `pbs-server/src/services/calendar/prefer-off-calendar-events.ts` 新增/使用 Prefer Off 日期解析、范围展开、calendar events 生成。
- `pbs-server/src/services/calendar/calendar-prefer-off-draft.ts` 新增/使用 calendar draft 与 Prefer Off properties 转换。
- `pbs-server/src/services/calendar/calendar-days-off-service.ts` 去掉旧表 fallback；GET 没有 Prefer Off 时返回空 draft，PUT/PATCH 写 Prefer Off。
- `pbs-server/src/services/calendar/bidding-calendar-service.ts` 只从 Prefer Off 生成 day_off_bid event，source 为 `pbs_bid_group`。
- `pbs-server/src/services/pairing/pairing-specific-date.ts` specific-date pairing conflict 改读 Prefer Off 派生日期。
- `pbs-server/src/services/lineholder/lineholder-summary-service.ts` summary 不再读旧表。
- `pbs-server/src/services/lineholder/tier-sync.ts` tier sync 不再看旧表。
- `packages/contracts/pbs-bidding-calendar.d.ts` 移除 `"pbs_bid_day_off"` event source。

验证：
- `rg "pbs_bid_day_off" pbs-server/src pbs-portal/src packages/contracts -n` 只剩 model 文件历史表定义。
- 后端测试/build 已通过：
  - `pnpm --dir pbs-server test -- calendar-prefer-off-draft.test.ts prefer-off-calendar-events.test.ts calendar-days-off.test.ts bidding-calendar.test.ts lineholder-summary-service.test.ts lineholder-summary.test.ts`
  - `pnpm --dir pbs-server build`

## 已完成：Days Off Add property Tier 交互

用户纠正后的准确范围：
- 只隐藏 `ADD DAYS OFF PROPERTIES` 区域的外部 TIERS。
- `EXISTING DAYS OFF PROPERTIES` 仍显示 tiers，因为它展示最终规则。
- 左侧日历点击添加 Off 不动，它本来就在弹窗/Popover 里选择 tier。
- Pairing / Line 不动。
- `Configure Days Off Bid` 弹窗里新增 Tier 选择，默认 T1。

关键前端改动：
- `pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx`
  - 弹窗内新增 TIERS 区域。
  - 默认至少激活 T1。
  - Confirm/Add 提交弹窗内 tiers。
  - Existing 编辑弹窗带入已有 tiers。
- `pbs-portal/src/features/days-off/pages/days-off-page.tsx`
  - 给 RuleBidRightPanel 传 `hideAvailablePropertyTiers={true}`。
- `pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx`
  - Header/Available row 支持隐藏 tiers。
- `pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx`
  - 新增局部 prop `hideAvailablePropertyTiers`，只影响 Add area。
- `pbs-portal/src/features/days-off/pages/days-off-page.test.tsx`
  - 新增回归：Add 区域隐藏 tiers，弹窗里默认 T1，Existing tiers 仍可见。

验证：
- `pnpm --dir pbs-portal test -- days-off-page.test.tsx shared-bidding-workbench-layout.test.tsx line-page.test.tsx`
- `pnpm --dir pbs-portal build`
- `pnpm --dir pbs-portal lint -- src/features/days-off/components/days-off-bid-dialog.tsx src/features/days-off/pages/days-off-page.tsx src/features/days-off/pages/days-off-page.test.tsx src/features/rule-bids/components/rule-bid-property-table.tsx src/features/rule-bids/components/rule-bid-right-panel.tsx`
- 全部通过。

## 已写/更新的 spec

位于 `docs/superpowers/specs/`：
- `2026-05-18-pbs-days-off-configure-before-add-design.md`
- `2026-05-19-pbs-days-off-single-source-of-truth-design.md`
- `2026-05-19-pbs-days-off-backend-calendar-source-design.md`
- `2026-05-19-pbs-calendar-days-off-api-compat-design.md`
- `2026-05-19-pbs-remove-bid-day-off-runtime-dependency-design.md`
- `2026-05-19-pbs-days-off-add-dialog-tier-selection-design.md`

最后两个 spec 已补实施记录。

## 当前 git 状态注意

当前工作树有大量未提交改动，主要是本轮 Days Off 前后端、docs specs。不要随意 revert 用户/前序改动。

已确认 `pbs-portal/tsconfig.tsbuildinfo` 在 build 后还原过。

曾出现 `.playwright-mcp/page-*.yml` 临时文件，提交前不要带进去。

## 下个窗口恢复建议

1. 先读 `NEXT_CONTEXT.md`。
2. 看本保存上下文。
3. 跑 `git status --short` 确认工作树。
4. 如果继续开发新点，先按 AGENTS 走 spec/brainstorming。
5. 若用户问 Days Off 是否完成：可以回答已完成上述两条主线，测试/build/lint 通过。

## 当前工作树快照

### git status --short

```text
 M pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx
 M pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
 M pbs-portal/src/features/days-off/pages/days-off-page.tsx
 M pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx
 M pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
?? docs/superpowers/specs/2026-05-19-pbs-days-off-add-dialog-tier-selection-design.md
```

### unstaged changed files

```text
pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx
pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
pbs-portal/src/features/days-off/pages/days-off-page.tsx
pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx
pbs-portal/src/features/rule-bids/components/rule-bid-right-panel.tsx
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-19-pbs-days-off-add-tier-dialog-and-single-source.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
