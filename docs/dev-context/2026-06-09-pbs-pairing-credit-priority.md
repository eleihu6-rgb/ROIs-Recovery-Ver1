# 开发上下文（2026-06-09）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-06-09 12:10:16 CST
- Wing：`pbs`
- Topic：`pairing-credit-priority`
- Title：pairing-credit-priority
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Pairing credit priority 显式选择与算法导出改造：
- 产品结论：Higher / Lower 必须由用户显式选择，不根据 > / < / Between 推断；未选择时 Award_Higher_Credit_Tiers 和 Avoid_Higher_Credit_Tiers 均导出 []。
- UI 仅对 Pairing credit 相关属性显示 CREDIT PRIORITY：propertyCode 105, 109, 121, 125, 127。按钮 Higher / Lower 互斥，点击已选项可取消。
- 四种导出映射固定为：Award+Higher -> Award_Higher_Credit_Tiers；Avoid+Higher -> Avoid_Higher_Credit_Tiers；Award+Lower -> Avoid_Higher_Credit_Tiers；Avoid+Lower -> Award_Higher_Credit_Tiers。
- Reserve UI 当前不暴露 Higher / Lower，但 RESERVE_SCORE.csv 已包含 Award_Higher_Credit_Tiers 和 Avoid_Higher_Credit_Tiers，两列默认 []。
- 后端使用 pbs_bid_group.preference_json 保存算法偏好元数据，不占用 param_c；已新增 migration，并同步 sql/schema/03-pbs_pg.sql。
- 当前 pbs-server/.env 使用 f8_pbs schema；运行账号不是 pbs_bid_group owner。本轮已用 owner 账号在当前 f8_pbs schema 应用 2026-06-09-pbs-bid-group-preference-json.sql，preference_json 字段类型为 jsonb。
- 替换 pairing dialog 中不稳定的 @rois/ui formatUiDateRange import，新增 pbs-portal/src/features/pairing/pairing-date-format.ts。
- 已补自动化测试和 QA 手工测试文档：docs/test-cases/pbs/pairing/2026-06-09-credit-priority-selection.md。
- 验证通过：pbs-portal pnpm exec tsc -b；pbs-portal PairingPage 46 tests；pbs-server pnpm exec tsc --noEmit；pbs-server node --import tsx --test 指定 4 个文件共 89 tests；git diff --check；浏览器 http://localhost:3030/fpqe/pbs/pairing 页面可加载，无 Vite overlay 或 draft load error。
- 注意：尝试 pbs-server 目录下 pnpm exec vitest 会失败，因为该模块使用 Node 内置 test runner，不是 Vitest。

## 当前工作树快照

### git status --short

```text
 M packages/contracts/pbs-pairing-bids.d.ts
 M packages/contracts/pbs-pairing-bids.js
 M pbs-portal/src/features/pairing/components/pairing-occurrence-bid-dialog.tsx
 M pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx
 M pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
 M pbs-portal/src/features/pairing/pairing-bid-summary.ts
 M pbs-portal/src/features/pairing/pairing-property-catalog.ts
 M pbs-portal/src/features/pairing/types.ts
 M pbs-portal/src/shared/i18n/locales/en.ts
 M pbs-server/src/models/pbs/pbs-bid-group.ts
 M pbs-server/src/routes/pairing-bid-route-schemas.ts
 M pbs-server/src/routes/pairing-bids.test.ts
 M pbs-server/src/services/algorithm-export/pairing-score-export.test.ts
 M pbs-server/src/services/algorithm-export/pairing-score-export.ts
 M pbs-server/src/services/algorithm-export/reserve-score-export.test.ts
 M pbs-server/src/services/lineholder/rule-bid-value.ts
 M pbs-server/src/services/pairing/pairing-bid-normalization.ts
 M pbs-server/src/services/pairing/pairing-bid-service.test.ts
 M pbs-server/src/services/pairing/pairing-bid-service.ts
 M pbs-server/src/services/pairing/pairing-property-write.ts
 M sql/schema/03-pbs_pg.sql
?? docs/superpowers/specs/2026-06-09-pbs-credit-priority-selection-export-design.md
?? docs/test-cases/pbs/pairing/2026-06-09-credit-priority-selection.md
?? pbs-portal/src/features/pairing/pairing-date-format.ts
?? sql/migration/2026-06-09-pbs-bid-group-preference-json.sql
```

### unstaged changed files

```text
packages/contracts/pbs-pairing-bids.d.ts
packages/contracts/pbs-pairing-bids.js
pbs-portal/src/features/pairing/components/pairing-occurrence-bid-dialog.tsx
pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx
pbs-portal/src/features/pairing/pages/pairing-page.test.tsx
pbs-portal/src/features/pairing/pairing-bid-summary.ts
pbs-portal/src/features/pairing/pairing-property-catalog.ts
pbs-portal/src/features/pairing/types.ts
pbs-portal/src/shared/i18n/locales/en.ts
pbs-server/src/models/pbs/pbs-bid-group.ts
pbs-server/src/routes/pairing-bid-route-schemas.ts
pbs-server/src/routes/pairing-bids.test.ts
pbs-server/src/services/algorithm-export/pairing-score-export.test.ts
pbs-server/src/services/algorithm-export/pairing-score-export.ts
pbs-server/src/services/algorithm-export/reserve-score-export.test.ts
pbs-server/src/services/lineholder/rule-bid-value.ts
pbs-server/src/services/pairing/pairing-bid-normalization.ts
pbs-server/src/services/pairing/pairing-bid-service.test.ts
pbs-server/src/services/pairing/pairing-bid-service.ts
pbs-server/src/services/pairing/pairing-property-write.ts
sql/schema/03-pbs_pg.sql
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-06-09-pbs-pairing-credit-priority.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
