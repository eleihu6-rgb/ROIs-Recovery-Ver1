# 开发上下文（2026-06-10）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-10 15:23:25 CST
- Wing：`pbs`
- Topic：`pairing-search-duty-kpi-clean-contract`
- Title：pairing-search-duty-kpi-clean-contract
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Pairing Search duty KPI clean contract 实施：
- 用户明确要求 /fpqe/pbs/pairing/search 任务环详情卡片新增 duty-level KPI，旧字段不要兼容保留；错了再修，避免看似正确实际错误。
- contract 中 PbsSearchPairingsLeg 已清理旧 deadhead 和 credit，新增 dutyFdp、dutyFlyingHour、dutyHour、dutyCredit。
- 后端 pairing-search-preview-query 从 live schema pairing_segment 读取 duty_sch_fdp_min / duty_act_fdp_min、duty_sch_flt_min / duty_act_flt_min、duty_sch_duty_min / duty_act_duty_min、duty_sch_credited_minutes / duty_act_credited_minutes。
- duty KPI 计划值优先、实际值兜底，格式化为 HHMM；同一 duty_seq 只在第一条 leg 展示 KPI，后续同 duty leg 输出空字符串；缺失字段显示 --。
- 前端 Pairing Search result card、Dashboard calendar pairing detail dialog、Tier pairing set preview 已同步表头为 DAY / FDP / F/H / D/H / CRD / FLTN / DPS / ARS / DEP / ARR / BLKT / EQP，不再展示旧 DH / GRNT / Crdt。
- 前端 mock、测试数据、后端 route/service 测试已同步新字段。
- 新增 QA 人工测试文档 docs/test-cases/pbs/pairing/2026-06-10-pairing-search-duty-kpi.md。
验证结果：
- pbs-server 指定 pairing search 测试通过：25 tests pass。
- pbs-portal pairing/search/dashboard/tier/shared workbench 相关回归通过：9 files、128 tests pass。
- pbs-portal npm run build 通过，仅有既有 Vite chunk size warning。
- pbs-server npm run build 通过。
- pbs-portal npm run lint 通过，保留既有 line/reserve Fast Refresh warnings。
- pbs-server 无 lint script。
- pbs-server npm test 全量通过：384 pass。
- git diff --check 通过。
- pbs-portal npm test 全量失败 3 个 rule-bids 既有断言：收到对象多 action: null；本轮未修改 pbs-portal/src/features/rule-bids，pairing/search 相关测试均通过。
注意：Deadhead 搜索条件逻辑仍保留，未在本轮修改；本轮只移除 pairing search leg 展示契约里的 deadhead 字段。

## 当前工作树快照

### git status --short

```text
 M packages/contracts/pbs-search-pairings.d.ts
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test-utils.tsx
 M pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
 M pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx
 M pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx
 M pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx
 M pbs-portal/src/features/pairing/components/pairing-detail-card.tsx
 M pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
 M pbs-portal/src/features/pairing/mock.ts
 M pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
 M pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
 M pbs-portal/src/features/pairing/pairing-search-page-data.test.ts
 M pbs-portal/src/features/pairing/types.ts
 M pbs-portal/src/features/tier/components/tier-pairing-set-preview.tsx
 M pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
 M pbs-server/src/routes/pairing-search.test.ts
 M pbs-server/src/services/pairing-search/pairing-search-preview-query.ts
 M pbs-server/src/services/pairing-search/pairing-search-service.test.ts
?? docs/test-cases/pbs/pairing/2026-06-10-pairing-search-duty-kpi.md
```

### unstaged changed files

```text
packages/contracts/pbs-search-pairings.d.ts
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test-utils.tsx
pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx
pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.test.tsx
pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx
pbs-portal/src/features/dashboard/pages/dashboard-page.test.tsx
pbs-portal/src/features/pairing/components/pairing-detail-card.tsx
pbs-portal/src/features/pairing/components/pairing-search-panel.module.css
pbs-portal/src/features/pairing/mock.ts
pbs-portal/src/features/pairing/pages/pairing-page.test-utils.tsx
pbs-portal/src/features/pairing/pages/search-pairings-page.test.tsx
pbs-portal/src/features/pairing/pairing-search-page-data.test.ts
pbs-portal/src/features/pairing/types.ts
pbs-portal/src/features/tier/components/tier-pairing-set-preview.tsx
pbs-portal/src/features/tier/components/tier-right-panel.test.tsx
pbs-server/src/routes/pairing-search.test.ts
pbs-server/src/services/pairing-search/pairing-search-preview-query.ts
pbs-server/src/services/pairing-search/pairing-search-service.test.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-10-pbs-pairing-search-duty-kpi-clean-contract.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
