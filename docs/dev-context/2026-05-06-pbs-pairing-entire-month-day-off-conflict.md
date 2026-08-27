# 开发上下文（2026-05-06）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-05-06 15:31:37 CST
- Wing：`pbs`
- Topic：`pairing-entire-month-day-off-conflict`
- Title：pairing-entire-month-day-off-conflict
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Pairing Entire Month 与 Days Off 冲突规则实现，遵循已确认 spec：docs/superpowers/specs/2026-05-06-pbs-pairing-entire-month-day-off-conflict-design.md。

关键语义：
- Pairing Number / propertyCode=102 的 Entire Month 日历展开会排除同 Tx touch Off 的 occurrence。
- Specific Date pairing 本轮不因 Off 自动过滤，后续如果要做 override existing Off 需要单独设计。
- Days Off 页面新增 Off 时，同 date + Tx 已有 pairing_bid 覆盖则禁止添加；已有 Off 仍可取消删除。
- 星期头批量 Days Off 保存会跳过被 pairing blocked 的 date + Tx，仍保存无冲突项。

后端实现：
- pbs-server/src/services/calendar/bidding-calendar-service.ts 新增 day-off date map、occurrence range touch 检测、findPairingDayOffConflicts，并在 buildPairingEvents 的 Entire Month 模式中过滤 same-Tx Off。
- pbs-server/src/services/calendar/calendar-days-off-service.ts 在 saveCurrentDraft 写入前校验新增 day-off dates 与当前 Pairing Number bids 的 live occurrences 冲突，冲突返回 409。
- pbs-server/src/app.ts 给 calendarDaysOffService 注入 pgPool 和 liveSchema，生产路径启用后端冲突校验。

前端实现：
- pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx 从综合 bidding calendar 构建 pairing blocked index。
- Days Off 弹窗会禁用被 pairing 覆盖且当前没有 Off 的 Tx checkbox，显示 blocked message。
- 保存时 applyDatesToSelectedTiers 跳过 blocked additions，但允许删除已有 Off；保存失败会 message + inline error，并刷新 calendar/draft query。

测试与验证：
- pbs-server: DATABASE_URL=postgresql://test:test@localhost:5432/rois PBS_SCHEMA=f8_pbs JWT_SECRET=test-secret CORS_ORIGIN=http://localhost:3030 node --import tsx --test src/services/calendar/bidding-calendar-service.test.ts 通过。
- pbs-server 局部 type-check: npx tsc --noEmit --target ES2022 --module Node16 --moduleResolution Node16 --strict --esModuleInterop --skipLibCheck src/services/calendar/bidding-calendar-service.ts src/services/calendar/calendar-days-off-service.ts src/app.ts 通过。
- pbs-portal: npm test -- --run src/app/layout/shared-bidding-workbench-layout.test.tsx 通过。
- pbs-portal: npm run lint 通过。
- pbs-portal: npm run build 通过；构建产生的 tsconfig.tsbuildinfo 已清理。
- git diff --check 通过。

已知验证限制：
- pbs-server npm run build 仍被既有 src/__tests__/plugins/metrics.test.ts 引用 vitest 但 package.json 未声明 vitest 阻塞；这不是本轮新增问题。本轮用目标文件测试与局部 tsc 覆盖新增改动。
- pbs-server npm test 脚本会匹配全部 src/**/*.test.ts，当前也会触发上述 vitest 缺失和 metrics 重复注册问题；不要误判为本轮 calendar 逻辑失败。

## 当前工作树快照

### git status --short

```text
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
 M pbs-portal/src/features/dashboard/components/pairing-calendar-bid-popover-content.tsx
 M pbs-server/src/app.ts
 M pbs-server/src/services/calendar/bidding-calendar-service.test.ts
 M pbs-server/src/services/calendar/bidding-calendar-service.ts
 M pbs-server/src/services/calendar/calendar-days-off-service.ts
?? docs/superpowers/specs/2026-05-06-pbs-pairing-calendar-popover-search-design.md
?? docs/superpowers/specs/2026-05-06-pbs-pairing-entire-month-day-off-conflict-design.md
```

### unstaged changed files

```text
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/features/dashboard/components/dashboard-schedule-panel.tsx
pbs-portal/src/features/dashboard/components/pairing-calendar-bid-popover-content.tsx
pbs-server/src/app.ts
pbs-server/src/services/calendar/bidding-calendar-service.test.ts
pbs-server/src/services/calendar/bidding-calendar-service.ts
pbs-server/src/services/calendar/calendar-days-off-service.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-05-06-pbs-pairing-entire-month-day-off-conflict.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
