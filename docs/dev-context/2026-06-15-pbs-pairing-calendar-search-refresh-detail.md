# 开发上下文（2026-06-15）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-15 17:09:47 CST
- Wing：`pbs`
- Topic：`pairing-calendar-search-refresh-detail`
- Title：PBS Pairing 日历 / 搜索 / 刷新 / 详情上下文
- Git branch：`main`

## 本轮对话上下文

本轮围绕 PBS Portal 的 Dashboard、Pairing 搜索、左侧 Bidding Calendar 与右侧 Existing Pairing Properties / Search Pairings 联动做了连续排查、设计、实现和验证。后续新窗口需要先恢复本文件，再根据用户最新问题继续。

## 对话主线

1. Dashboard `USER INFORMATION`：
   - 用户发现 `USER INFORMATION` 多个字段写死或显示 `-`。
   - 排查后确认可以从 PBS user / live crew 相关数据补齐部分字段。
   - 已接入可用字段：base、fleet、position、seniority、existing credit 等。
   - `STATUS` 字段用户明确要求暂时显示 `-`，因为当前业务字段未定义。

2. Pairing search base 过滤：
   - 用户指出 `/fpqe/pbs/pairing/search` 搜出来的 pairing 应按当前人的 base 过滤，不是当前 base 的 pairing 没有意义。
   - 已按 brainstorming/spec 流程写设计文档并实现：搜索 / 日历 / pairing number 条件相关查询都按当前用户 base 过滤。
   - 相关 spec：`docs/superpowers/specs/2026-06-15-pbs-bidding-calendar-pairing-base-filter-design.md`
   - 相关测试用例文档：`docs/test-cases/pbs/pairing/2026-06-15-bidding-calendar-pairing-base-filter.md`

3. Pairing count refresh 自动刷新：
   - 用户发现删除条件后提示 `Counts need refresh`，希望顺便自动刷新。
   - 后续又要求添加新条件也要刷新，左侧 calendar 添加 pairing 后右侧也要自动刷新。
   - 已写 spec 并实现：
     - 右侧 Existing Pairing Properties 增删条件成功后自动刷新当前 Tx counts。
     - 左侧 Bidding Calendar 添加 pairing bid 成功后，同步右侧 Pairing Number 条件并触发 counts refresh。
   - 新增 store：`pbs-portal/src/features/pairing/pairing-pool-counts-refresh-store.ts`
   - 相关 spec：`docs/superpowers/specs/2026-06-15-pbs-calendar-pairing-add-refresh-counts-design.md`

4. Pairing count refresh skeleton：
   - 用户指出刷新时骨架屏没有了，要求手动刷新、增加、删除、左侧增加触发刷新时都应该有刷新样子。
   - 已写 spec 并实现：refresh loading 状态不再保留旧 response，而是清空 response，让 UI 进入原本 skeleton/loading 渲染路径。
   - 关键改动：`pbs-portal/src/features/pairing/components/pairing-right-panel.tsx` 的 `refreshPairingPoolCounts` 在 loading 时设置 `response: null`。
   - 相关 spec：`docs/superpowers/specs/2026-06-15-pbs-pairing-refresh-skeleton-design.md`

5. 当前最新未改代码的问题：左侧 pairing bid detail modal 是否正确。
   - 用户截图：左侧 Bidding Calendar 打开 pairing bid modal，上方显示 `PAIRING BID` summary，下方显示 `PAIRING DETAILS`；右侧 Search Pairings 也显示 T4524 live detail。
   - 已只读排查，没有改代码。
   - 当前结论：左侧数据逻辑本身是对的，但 UI 文案/结构容易误解。
   - 上方 `PAIRING BID` 是 PBS bid summary / calendar event metadata：Pairing、内部 `pairingId`、Tx、Origin、Start、End、Mode。
   - 下方 `PAIRING DETAILS` 才是 live pairing detail：通过 `pairingId + originDate` 调 `pairingService.getPairingDetails(periodCode, targets)` 得到，和右侧 Search Results 使用同类 `PairingSearchResult` 数据。
   - 截图中核心数据一致：T4524、YYZ、REPORT 0815、F8670/F8671、TBLK 0406、TCRD/TPAY 520 都对得上。
   - 容易误解点：上方 `ID 10969` 是内部 pairingId，不是 Pairing Number；日期 `20260605` 与右侧 `2026-06-05` 格式不统一。
   - 建议后续如果用户确认：写 spec 后再改 UI，把上方改名为 `BID SUMMARY`，下方改名为 `LIVE PAIRING DETAILS`，日期统一成 `2026-06-05`，或把上方压缩成一行摘要。

## 已排查过的关键代码路径

- 左侧日历 / detail modal：
  - `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`
  - `pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx`
  - `pbs-portal/src/features/dashboard/pairing-calendar-detail.ts`
- Pairing 右侧条件 / counts：
  - `pbs-portal/src/features/pairing/components/pairing-right-panel.tsx`
  - `pbs-portal/src/features/pairing/pages/pairing-page.test.tsx`
  - `pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx`
  - `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test-utils.tsx`
  - `pbs-portal/src/features/pairing/pairing-pool-counts-refresh-store.ts`
- Calendar pairing base filter 后端：
  - `pbs-server/src/app.ts`
  - `pbs-server/src/services/calendar/bidding-calendar-service.ts`
  - `pbs-server/src/services/calendar/bidding-calendar-service.test.ts`
  - `pbs-server/src/services/calendar/bidding-calendar-pairing-events.ts`

## 已执行验证

PBS Portal：
- `npm test -- --run src/features/pairing/pages/pairing-page.test.tsx` 通过，54 tests。
- `npm test -- --run src/app/layout/shared-bidding-workbench-layout.test.tsx` 通过，33 tests。
- `npm run build` 通过。
- `npm test -- --run` 通过，61 files / 430 tests。
- `git diff --check` 通过。

PBS Server：
- targeted calendar service test 通过，15 tests。
- route test 通过，2 tests。
- `npm run build` 通过。
- `npm test` 通过，403 tests。

## 本轮重要约定 / 不要重复推翻

- `STATUS` 字段暂时显示 `-`，因为用户确认该字段当前未定义。
- Pairing search / calendar / pairing number 条件都应按当前用户 base 过滤。
- Right panel counts 刷新触发源包括：手动 refresh、Tx 切换、右侧 add/delete 条件、左侧 calendar 添加 pairing。
- Counts refresh 必须有 skeleton/loading 反馈，不应继续展示旧 counts 伪装成刷新完成。
- 左侧 pairing modal 当前上方和下方是两类信息：PBS bid summary 与 live pairing details；如果要改，只改 UI 命名/布局/日期格式，不要误删 live detail 查询逻辑。

## 新窗口建议第一步

1. 先读 `NEXT_CONTEXT.md` 和本上下文文件。
2. 查看 `git status --short`，确认工作树状态。
3. 如果继续处理用户最新截图问题，先回答/确认：是否将左侧 pairing modal 的上方 summary 改为更明确的 `BID SUMMARY`，下方改为 `LIVE PAIRING DETAILS`，并统一日期格式。
4. 这属于 UI 行为/文案调整，按 `AGENTS.md` 需要先用 `brainstorming` 写 spec，用户确认后再改代码。

## 当前工作树快照

### git status --short

```text
(clean)
```

### unstaged changed files

```text
(none)
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-15-pbs-pairing-calendar-search-refresh-detail.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
