# 开发上下文（2026-07-14）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-14 19:03:44 CST
- Wing：`pbs`
- Topic：`line-credit-window-preference`
- Title：line-credit-window-preference
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS Line `Credit Window Preference`（property_code=429）的员工端与服务端实现。

关键产品结论：
- 429 是新的 Line 条件，不复用旧 401/402。
- UI 有三种 mode：Low credit、High credit、Custom。
- Low/High 是公司定义窗口，员工不能输入具体 credit；Custom 才填写 Minimum credit / Maximum credit。
- 旧 401/402 只保留历史显示/删除，不出现在新增入口和推荐入口。
- 本轮不实现 429 的 algorithm export 语义；当前只做最小 guard，避免 429 让现有导出崩溃。算法输出最后单独设计。

字典配置结论：
- `dictionary.code_value` 是 varchar(50)，不适合把整段配置写成 JSON。
- 最终使用 `PBS_LINE_CREDIT_WINDOW_CONFIG` 父子字典项：`MMG_CREDIT`、`OVERTIME_THRESHOLD`、`LOW_MIN_CREDIT`、`LOW_MAX_CREDIT`、`HIGH_MIN_CREDIT`、`HIGH_MAX_CREDIT`。
- seed/migration 先放可改默认值：70:00、90:00、70:00、78:00、82:00、90:00；后续管理端维护这些字典项。
- 当前 pbs-server/.env 指向远端 rois，PBS schema=f8_pbs，live dictionary schema=f8；尝试执行 migration 时当前 DB 账号没有 `f8.dictionary` 写权限，远端实际未同步。需要管理员账号或 DBA 授权后执行 `sql/migration/2026-07-14-pbs-line-credit-window-preference.sql`。

主要改动范围：
- contracts：新增 429、Line config route、Standing catalog 使用 429。
- pbs-server：新增 credit-window config service/route；Line 保存/patch/favorite 时服务端解析 Low/High、校验 Custom；lineholder serialize/deserialize/format 支持 429；crew bid import 将 legacy Maximum/Minimum Credit Window 映射到 429 low/high。
- pbs-portal：Line 弹窗支持 Low/High/Custom；Line summary、Standing Lineholder、shared pairing/days-off 类型边界已处理。
- SQL/docs：seed/migration 添加 429 和字典字段；手工 QA 文档已更新。

验证结果：
- `pbs-server` focused config/line tests：26/26 PASS。
- `pbs-server` targeted regression：103/103 PASS。
- `npm --prefix pbs-server run build` PASS。
- `pbs-portal` targeted tests：104/104 PASS。
- `npm --prefix pbs-portal run build` PASS。
- `npm run check:ui` PASS，0 hard violations，133 warnings。
- Playwright：`cd e2e && npx playwright test --config=config/playwright.config.ts --project=pbs-portal tests/pbs-portal/long-stretch-commuter-pattern.spec.ts -g "Credit Window Preference" --reporter=list` PASS，2/2。
- `git diff --check` PASS。
- GitNexus `detect-changes --scope all` PASS command completed，risk critical due shared contracts/Line/Standing/lineholder flows。

剩余风险：
- 远端 DB 未实际同步，原因是当前账号没有 `f8.dictionary` 写权限。
- `npm run verify:pbs` 曾因 algorithm export pairing-score 相关测试失败；用户明确要求不要处理算法导出，本轮没有修这块。

## 当前工作树快照

### git status --short

```text
 M AGENTS.md
 M CLAUDE.md
 M e2e/tests/pbs-portal/long-stretch-commuter-pattern.spec.ts
 M packages/contracts/pbs-line-bids.d.ts
 M packages/contracts/pbs-line-bids.js
 M packages/contracts/pbs-pairing-bids.d.ts
 M packages/contracts/pbs-standing-bids.d.ts
 M packages/contracts/pbs-standing-bids.js
 M pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx
 M pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
 M pbs-portal/src/features/line/components/line-bid-dialog.tsx
 M pbs-portal/src/features/line/line-draft-mappers.test.ts
 M pbs-portal/src/features/line/pages/line-page.test.tsx
 M pbs-portal/src/features/line/pages/line-page.tsx
 M pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
 M pbs-portal/src/features/pairing/pairing-bid-summary.ts
 M pbs-portal/src/features/pairing/types.ts
 M pbs-portal/src/features/reserve/components/reserve-bid-dialog.tsx
 M pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx
 M pbs-portal/src/features/rule-bids/rule-bid-draft-mappers.ts
 M pbs-portal/src/features/rule-bids/types.ts
 M pbs-portal/src/features/rule-bids/utils.ts
 M pbs-portal/src/features/standing-bid/components/standing-bid-dialog.tsx
 M pbs-portal/src/features/standing-bid/pages/standing-bid-page.test.tsx
 M pbs-portal/src/features/standing-bid/pages/standing-bid-page.tsx
 M pbs-portal/src/features/standing-bid/standing-bid-draft-mappers.test.ts
 M pbs-portal/src/features/standing-bid/standing-bid-draft-mappers.ts
 M pbs-portal/src/shared/services/days-off-service.ts
 M pbs-portal/src/shared/services/line-service.test.ts
 M pbs-portal/src/shared/services/line-service.ts
 M pbs-server/src/routes/days-off-bids.ts
 M pbs-server/src/routes/line-bids.test.ts
 M pbs-server/src/routes/line-bids.ts
 M pbs-server/src/routes/lineholder-route-utils.ts
 M pbs-server/src/routes/standing-bids.test.ts
 M pbs-server/src/services/algorithm-export/line-rules-entry.ts
 M pbs-server/src/services/algorithm-export/line-rules-metadata.ts
 M pbs-server/src/services/algorithm-export/line-rules-parameters.ts
 M pbs-server/src/services/crew-bid-import/crew-bid-property-mapper.ts
 M pbs-server/src/services/crew-bid-import/crew-bid-txt-parser.test.ts
 M pbs-server/src/services/days-off/days-off-draft-mappers.test.ts
 M pbs-server/src/services/line/line-bid-service.ts
 M pbs-server/src/services/line/line-validation.test.ts
 M pbs-server/src/services/line/line-validation.ts
 M pbs-server/src/services/line/types.ts
 M pbs-server/src/services/lineholder/lineholder-summary-formatters.test.ts
 M pbs-server/src/services/lineholder/lineholder-summary-formatters.ts
 M pbs-server/src/services/lineholder/rule-bid-clone.ts
 M pbs-server/src/services/lineholder/rule-bid-format.ts
 M pbs-server/src/services/lineholder/rule-bid-serialize.ts
 M pbs-server/src/services/lineholder/rule-bid-types.ts
 M pbs-server/src/services/lineholder/rule-bid-value.test.ts
 M pbs-server/src/services/lineholder/rule-bid-value.ts
 M pbs-server/src/services/standing-bid/standing-bid-service.test.ts
 M pbs-server/src/services/standing-bid/standing-bid-service.ts
 M sql/seed/01-dictionary.sql
 M sql/seed/10-pbs-bid-property.sql
?? .playwright-mcp/
?? docs/superpowers/plans/2026-07-14-pbs-line-credit-window-preference-implementation-plan.md
?? docs/superpowers/specs/2026-07-14-pbs-line-credit-window-preference-design.md
?? docs/superpowers/specs/2026-07-14-pbs-line-credit-window-preference-prototype-design.md
?? docs/superpowers/specs/2026-07-14-pbs-minimum-base-layover-design.md
?? docs/test-cases/pbs/line/2026-07-14-credit-window-preference.md
?? docs/test-cases/pbs/line/2026-07-14-minimum-base-layover.md
?? pbs-server/src/services/line/line-credit-window-config.test.ts
?? pbs-server/src/services/line/line-credit-window-config.ts
?? pbs-server/src/services/line/line-minimum-base-layover-config.test.ts
?? pbs-server/src/services/line/line-minimum-base-layover-config.ts
?? sql/migration/2026-07-14-pbs-line-credit-window-preference.sql
?? sql/migration/2026-07-14-pbs-minimum-base-layover.sql
```

### unstaged changed files

```text
AGENTS.md
CLAUDE.md
e2e/tests/pbs-portal/long-stretch-commuter-pattern.spec.ts
packages/contracts/pbs-line-bids.d.ts
packages/contracts/pbs-line-bids.js
packages/contracts/pbs-pairing-bids.d.ts
packages/contracts/pbs-standing-bids.d.ts
packages/contracts/pbs-standing-bids.js
pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx
pbs-portal/src/features/days-off/pages/days-off-page.test.tsx
pbs-portal/src/features/line/components/line-bid-dialog.tsx
pbs-portal/src/features/line/line-draft-mappers.test.ts
pbs-portal/src/features/line/pages/line-page.test.tsx
pbs-portal/src/features/line/pages/line-page.tsx
pbs-portal/src/features/pairing/components/pairing-bid-control.tsx
pbs-portal/src/features/pairing/pairing-bid-summary.ts
pbs-portal/src/features/pairing/types.ts
pbs-portal/src/features/reserve/components/reserve-bid-dialog.tsx
pbs-portal/src/features/rule-bids/components/rule-bid-property-table.tsx
pbs-portal/src/features/rule-bids/rule-bid-draft-mappers.ts
pbs-portal/src/features/rule-bids/types.ts
pbs-portal/src/features/rule-bids/utils.ts
pbs-portal/src/features/standing-bid/components/standing-bid-dialog.tsx
pbs-portal/src/features/standing-bid/pages/standing-bid-page.test.tsx
pbs-portal/src/features/standing-bid/pages/standing-bid-page.tsx
pbs-portal/src/features/standing-bid/standing-bid-draft-mappers.test.ts
pbs-portal/src/features/standing-bid/standing-bid-draft-mappers.ts
pbs-portal/src/shared/services/days-off-service.ts
pbs-portal/src/shared/services/line-service.test.ts
pbs-portal/src/shared/services/line-service.ts
pbs-server/src/routes/days-off-bids.ts
pbs-server/src/routes/line-bids.test.ts
pbs-server/src/routes/line-bids.ts
pbs-server/src/routes/lineholder-route-utils.ts
pbs-server/src/routes/standing-bids.test.ts
pbs-server/src/services/algorithm-export/line-rules-entry.ts
pbs-server/src/services/algorithm-export/line-rules-metadata.ts
pbs-server/src/services/algorithm-export/line-rules-parameters.ts
pbs-server/src/services/crew-bid-import/crew-bid-property-mapper.ts
pbs-server/src/services/crew-bid-import/crew-bid-txt-parser.test.ts
pbs-server/src/services/days-off/days-off-draft-mappers.test.ts
pbs-server/src/services/line/line-bid-service.ts
pbs-server/src/services/line/line-validation.test.ts
pbs-server/src/services/line/line-validation.ts
pbs-server/src/services/line/types.ts
pbs-server/src/services/lineholder/lineholder-summary-formatters.test.ts
pbs-server/src/services/lineholder/lineholder-summary-formatters.ts
pbs-server/src/services/lineholder/rule-bid-clone.ts
pbs-server/src/services/lineholder/rule-bid-format.ts
pbs-server/src/services/lineholder/rule-bid-serialize.ts
pbs-server/src/services/lineholder/rule-bid-types.ts
pbs-server/src/services/lineholder/rule-bid-value.test.ts
pbs-server/src/services/lineholder/rule-bid-value.ts
pbs-server/src/services/standing-bid/standing-bid-service.test.ts
pbs-server/src/services/standing-bid/standing-bid-service.ts
sql/seed/01-dictionary.sql
sql/seed/10-pbs-bid-property.sql
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-14-pbs-line-credit-window-preference.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
