# 开发上下文（2026-05-07）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-07 13:43:52 CST
- Wing：`pbs`
- Topic：`calendar-days-off-patch-performance`
- Title：PBS Days Off / Pairing Calendar 本轮上下文
- Git branch：`main`

## 本轮对话上下文

本轮继续 PBS portal/server 的 Days Off 与 Pairing calendar 开发，重点处理用户反馈的 `PATCH /api/calendar-days-off/current/dates` 慢、偶发 500，以及 Days Off 星期表头与 pairing/off 冲突相关行为。

一、已完成的功能与业务结论

1. Days Off 星期表头行为已按用户确认后的规则实现：
- 点击 weekday header 时，默认勾选 active tier 到 T7。
- 表头弹窗里的 tier checkbox 不因为该 weekday 某些日期有 pairing 而禁用。
- 保存时按 `date + tier` 精确处理：有 pairing 的格子跳过添加 Off，没冲突的格子正常添加。
- 未勾选的 tier 会删除该 weekday 已有 Off。
- 顶部不再显示红色内联提示，使用已有 message 体系。

2. 用户给出的慢接口 payload：
```json
{
  "draftKey": "2",
  "bidId": 2,
  "periodCode": "Apr 2026",
  "bidContext": "Current",
  "draftVersion": 906,
  "changes": [
    { "date": "2026-04-01", "tier": "T2", "selected": true },
    { "date": "2026-04-15", "tier": "T2", "selected": true },
    { "date": "2026-04-22", "tier": "T2", "selected": true },
    { "date": "2026-04-29", "tier": "T2", "selected": true }
  ]
}
```
本地确认 `f8_pbs.pbs_bid id=2` 当前 `draft_version=908`，所以该 payload 正确业务响应是 `409 Current draft has changed. Please refresh before saving again.`，不是 500。

二、后端性能与错误处理改动

1. `pbs-server/src/routes/calendar-days-off.ts`
- 新增 `tryFailWithServiceStatus(reply, error)`。
- 先识别 `LineholderBidServiceError`。
- 再兜底识别含 `statusCode` 与 `message` 的结构化错误，400-599 原样返回。
- GET / PUT / PATCH 三个 catch 均改用该 helper，避免 dev watch 或模块实例抖动时业务 409 落成 500。

2. `pbs-server/src/services/calendar/calendar-days-off-service.ts`
- `patchCurrentDraftDates` 改为先在事务外读取 current bid、校验 draftVersion、局部读取本次 changes 涉及的 existing day off。
- 如果 additions/removals 都为空，直接返回 unchanged，不 bump draftVersion，不进入写事务。
- 有实际增删时才进入 transaction。
- pairing 冲突校验提前到写事务前，避免冲突请求 bump draftVersion 或产生部分写入。

3. 新增 `pbs-server/src/services/calendar/calendar-days-off-patch-queries.ts`
- 抽出 patch 专用查询，避免 `calendar-days-off-service.ts` 继续膨胀。
- `loadExistingDayOffDatesByTierForChanges`：只查本次 `tier + date`，不再全量读取该 bid 所有 day off。
- `validatePatchDayOffPairingConflicts`：用一次 SQL 检查 same-tier Pairing Number bid 是否 touch 本次新增 Off 日期。
- 支持 `param_b` 为空的 entire-month Pairing Number，以及 `param_b` 为 origin date 的 specific-date Pairing Number。
- 冲突消息保持现有风格：`Cannot add day off because T2 has a pairing bid on 2026-04-08.`

4. `pbs-server/src/routes/calendar-days-off.test.ts`
- 增加 route 测试：service 抛出结构化 `{ statusCode: 409, message }` 时，PATCH route 必须返回 409，不能转成 500。

三、验证结果

已运行并通过：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-server
npm test -- src/routes/calendar-days-off.test.ts src/services/calendar/bidding-calendar-service.test.ts
# 161 passed

npm run build
# passed

npm run perf:pbs -- --base-url=http://localhost:3002 --samples=5 --budget-ms=2000
# 所有基线接口 max 均小于 2s
```

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test -- src/app/layout/shared-bidding-workbench-layout.test.tsx
# 24 passed

npm run build
# passed

npm run lint
# passed
```

真实接口复测（使用 crewId/userCode 3002，bidId=2）：
- 直接打 3002：
  - stale payload：409，max 176ms。
  - current unchanged payload：200，max 367.8ms。
  - same-tier pairing conflict：409，max 464.3ms。
- 通过 portal/vite 3030：
  - stale payload：409，max 220.5ms。
  - current unchanged payload：200，max 307.9ms。
  - same-tier pairing conflict：409，max 495.9ms。

四、当前工作树与注意事项

当前仍有未提交改动，不要随意 revert。工作树包含：
- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`
- `pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx`
- `pbs-server/src/routes/calendar-days-off.test.ts`
- `pbs-server/src/routes/calendar-days-off.ts`
- `pbs-server/src/services/calendar/calendar-days-off-service.ts`
- `pbs-server/src/services/calendar/calendar-days-off-patch-queries.ts`（新增）
- specs：
  - `docs/superpowers/specs/2026-05-07-pbs-days-off-weekday-partial-conflict-design.md`
  - `docs/superpowers/specs/2026-05-07-pbs-calendar-days-off-patch-performance-design.md`
  - `docs/superpowers/specs/2026-05-07-pbs-calendar-popover-outside-click-design.md` 当前也在未跟踪列表中，下一窗口需要读取确认来源后再处理。

`pbs-portal/tsconfig.tsbuildinfo` 曾被 build 修改，已手动 restore，避免构建缓存噪音。

五、下一窗口建议

新窗口先读：
1. `/Users/lei/Codehub/rois-ai/NEXT_CONTEXT.md`
2. `docs/dev-context/LATEST.md`
3. 必要时读本轮 specs。

恢复后先不要改代码，先确认当前工作树、用户下一步目标，以及是否需要提交/继续做 Pairing 自身闭环或 Days Off 后续 AA 对齐。

## 当前工作树快照

### git status --short

```text
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-server/src/routes/calendar-days-off.test.ts
 M pbs-server/src/routes/calendar-days-off.ts
 M pbs-server/src/services/calendar/calendar-days-off-service.ts
?? docs/superpowers/specs/2026-05-07-pbs-calendar-days-off-patch-performance-design.md
?? docs/superpowers/specs/2026-05-07-pbs-calendar-popover-outside-click-design.md
?? docs/superpowers/specs/2026-05-07-pbs-days-off-weekday-partial-conflict-design.md
?? pbs-server/src/services/calendar/calendar-days-off-patch-queries.ts
```

### unstaged changed files

```text
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-server/src/routes/calendar-days-off.test.ts
pbs-server/src/routes/calendar-days-off.ts
pbs-server/src/services/calendar/calendar-days-off-service.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-07-pbs-calendar-days-off-patch-performance.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
