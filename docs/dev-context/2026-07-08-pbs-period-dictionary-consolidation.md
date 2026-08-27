# 开发上下文（2026-07-08）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-07-08 14:32:34 CST
- Wing：`pbs`
- Topic：`period-dictionary-consolidation`
- Title：period-dictionary-consolidation
- Git branch：`main`

## 本轮对话上下文

本轮完成 PBS period/dictionary 合并：运行时不再读取 f8_pbs.dictionary / f8_pbs.pbs_period，PBS Business Time 改读写 f8.dictionary，当前周期改由 f8.roster_period.pbs_* 字段承载。新增并执行 sql/migration/2026-07-08-pbs-period-roster-period-consolidation.sql，远端库已确认 f8_pbs.dictionary 和 f8_pbs.pbs_period 被 drop，pbs_bid / pbs_award_result 已切到 roster_period_id。代码涉及 pbs-server current period、business clock、bid models 与保存流程，live-server PBS period admin route，gantt PBS period admin UI，schema/docs/tests。验证：pbs-server build PASS，live-server build PASS，gantt build PASS，check:ui PASS（0 hard violations），focused pbs/live tests PASS；全量 pbs/live tests 仍有既有失败，已记录为非本次 touched-area 问题。

## 当前工作树快照

### git status --short

```text
 M .agents/skills/107-pbs-portal-pairing-search-debug/SKILL.md
 M docs/architecture/codebase-index.md
 M docs/architecture/data-model.md
 M docs/architecture/old-to-new.md
 M docs/modules/pbs/portal-playbook.md
 M docs/requirements/functional-requirements.md
 M docs/test-cases/pbs/dashboard/2026-06-15-dashboard-live-user-information-fields.md
 M docs/test-cases/pbs/dashboard/2026-07-05-dashboard-real-data-no-mock.md
 M docs/test-cases/pbs/period/2026-07-02-current-period-lifecycle.md
 M gantt/src/components/dev/dev-skills-data.generated.ts
 M gantt/src/components/pbs/pbs-period-view.tsx
 M gantt/src/services/pbs-period-admin-api.ts
 M gantt/src/version.ts
 M live-server/src/__tests__/unit/pbs-period-admin-route.test.ts
 M live-server/src/models/base/roster-period.ts
 M live-server/src/models/pbs/pbs-bid.ts
 M live-server/src/routes/pbs/period-admin.ts
 M live-server/src/services/crew-bid-import/crew-bid-import-service.ts
 M pbs-server/src/models/index.ts
 M pbs-server/src/models/pbs/pbs-award-result.ts
 M pbs-server/src/models/pbs/pbs-bid.ts
 D pbs-server/src/models/pbs/pbs-period.ts
 M pbs-server/src/scripts/pbs-business-time.ts
 M pbs-server/src/services/business-time/business-clock.ts
 M pbs-server/src/services/crew-bid-import/crew-bid-import-service.ts
 M pbs-server/src/services/days-off/days-off-bid-service.ts
 M pbs-server/src/services/days-off/days-off-draft-mappers.test.ts
 M pbs-server/src/services/days-off/days-off-draft-write.ts
 M pbs-server/src/services/days-off/days-off-property-write.ts
 M pbs-server/src/services/line/line-draft-property-write.ts
 M pbs-server/src/services/lineholder/current-bid.ts
 M pbs-server/src/services/lineholder/current-period-bid.test.ts
 M pbs-server/src/services/lineholder/shared-types.ts
 M pbs-server/src/services/pairing/pairing-bid-service.ts
 M pbs-server/src/services/pairing/pairing-property-write.ts
 M pbs-server/src/services/reserve/reserve-coverage-service.test.ts
 M pbs-server/src/services/standing-bid/standing-bid-service.ts
 M sql/schema/live/01-base.sql
 M sql/schema/pbs/01-pbs.sql
?? docs/superpowers/specs/2026-07-08-pbs-period-dictionary-consolidation-design.md
?? docs/test-cases/pbs/period/2026-07-08-roster-period-consolidation.md
?? pbs-server/src/models/live/
?? sql/migration/2026-07-08-pbs-period-roster-period-consolidation.sql
```

### unstaged changed files

```text
.agents/skills/107-pbs-portal-pairing-search-debug/SKILL.md
docs/architecture/codebase-index.md
docs/architecture/data-model.md
docs/architecture/old-to-new.md
docs/modules/pbs/portal-playbook.md
docs/requirements/functional-requirements.md
docs/test-cases/pbs/dashboard/2026-06-15-dashboard-live-user-information-fields.md
docs/test-cases/pbs/dashboard/2026-07-05-dashboard-real-data-no-mock.md
docs/test-cases/pbs/period/2026-07-02-current-period-lifecycle.md
gantt/src/components/dev/dev-skills-data.generated.ts
gantt/src/components/pbs/pbs-period-view.tsx
gantt/src/services/pbs-period-admin-api.ts
gantt/src/version.ts
live-server/src/__tests__/unit/pbs-period-admin-route.test.ts
live-server/src/models/base/roster-period.ts
live-server/src/models/pbs/pbs-bid.ts
live-server/src/routes/pbs/period-admin.ts
live-server/src/services/crew-bid-import/crew-bid-import-service.ts
pbs-server/src/models/index.ts
pbs-server/src/models/pbs/pbs-award-result.ts
pbs-server/src/models/pbs/pbs-bid.ts
pbs-server/src/models/pbs/pbs-period.ts
pbs-server/src/scripts/pbs-business-time.ts
pbs-server/src/services/business-time/business-clock.ts
pbs-server/src/services/crew-bid-import/crew-bid-import-service.ts
pbs-server/src/services/days-off/days-off-bid-service.ts
pbs-server/src/services/days-off/days-off-draft-mappers.test.ts
pbs-server/src/services/days-off/days-off-draft-write.ts
pbs-server/src/services/days-off/days-off-property-write.ts
pbs-server/src/services/line/line-draft-property-write.ts
pbs-server/src/services/lineholder/current-bid.ts
pbs-server/src/services/lineholder/current-period-bid.test.ts
pbs-server/src/services/lineholder/shared-types.ts
pbs-server/src/services/pairing/pairing-bid-service.ts
pbs-server/src/services/pairing/pairing-property-write.ts
pbs-server/src/services/reserve/reserve-coverage-service.test.ts
pbs-server/src/services/standing-bid/standing-bid-service.ts
sql/schema/live/01-base.sql
sql/schema/pbs/01-pbs.sql
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-07-08-pbs-period-dictionary-consolidation.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh pbs
git status --short
```
