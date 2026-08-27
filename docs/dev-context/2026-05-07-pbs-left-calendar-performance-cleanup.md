# 开发上下文（2026-05-07）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-07 19:12:33 CST
- Wing：`pbs`
- Topic：`left-calendar-performance-cleanup`
- Title：left-calendar-performance-cleanup
- Git branch：`main`

## 本轮对话上下文

本轮继续 PBS 左侧 BIDDING CALENDAR 性能优化、PBS 范围代码简化和僵尸文件清理。

关键背景：
- 用户明确要求只删除 PBS 相关文件，不做全仓库清理。
- 左侧日历相关操作要求稳定低于 2 秒。
- 不改变已确认 Pairing / Days Off / Tier 业务语义，不改数据库结构，不新增依赖。

已完成改动：
- pbs-server 性能 baseline 新增 GET /api/bidding-calendar/current，避免核心左侧日历读接口遗漏在 perf:pbs 之外。
- pbs-server baseline 测试增加断言，确认 /api/bidding-calendar/current 被覆盖。
- pbs-portal DashboardSchedulePanel 新增 invalidateQueriesInBackground，把保存后的非关键 query invalidate 改成后台刷新，不再阻塞用户操作完成。
- Pairing 左侧日历 ADD BID 多选 pairing 时，不再逐条串行 addCurrentDraftProperty，而是一次提交 tag-list-date property，values 包含多个 pairing number。
- 对应前端测试已更新：多个 pairing 添加只调用一次 addCurrentDraftProperty，payload values 为 ["M4959", "V4146"]。
- PBS 源码范围内 .DS_Store 已清理；node_modules/dist 这类被 gitignore 忽略目录不作为代码清理范围。

关键产品/技术结论：
- Pairing specific-date 多 pairing 添加可以合并成一个 property；后端已有 same-date merge 语义，且产品上要求一个日历格子只能有一个蓝条、重复要合并。
- 前端优化优先减少真实请求和等待；非关键 refetch 可以后台化，但 mutation 本身仍必须成功后才关闭操作。
- 继续使用 PBS 术语 Tier/Tx，不引入 Layer/Lx。

验证结果：
- pbs-portal: npm test -- src/app/layout/shared-bidding-workbench-layout.test.tsx 通过。
- pbs-server: npm run build 通过。
- pbs-server: npm test -- src/scripts/pbs-performance-baseline.test.ts 通过。
- pbs-server: npm run perf:pbs -- --base-url=http://127.0.0.1:3002 --samples=5 --budget-ms=2000 通过，新增 bidding calendar current 样本 max 约 182.63ms，全部 endpoint max < 2s。
- pbs-portal: npm run lint 通过。
- pbs-portal: npm run build 通过。
- 根目录 npm run verify:pbs 通过。
- git diff --check 通过。

后续建议：
- 如果用户仍觉得左侧日历慢，下一步用浏览器 Network 对真实点击操作抓瀑布图，区分 mutation 本身慢、后续 refetch 慢，还是浏览器渲染/交互慢。

## 当前工作树快照

### git status --short

```text
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-server/src/scripts/pbs-performance-baseline-core.ts
 M pbs-server/src/scripts/pbs-performance-baseline.test.ts
?? docs/superpowers/specs/2026-05-07-pbs-left-calendar-performance-cleanup-design.md
```

### unstaged changed files

```text
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-server/src/scripts/pbs-performance-baseline-core.ts
pbs-server/src/scripts/pbs-performance-baseline.test.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-07-pbs-left-calendar-performance-cleanup.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
