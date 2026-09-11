# 开发上下文（2026-09-10）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-10 14:54:27 PDT
- Wing：`gantt`
- Topic：`cost-library-pg`
- Title：Cost Library PostgreSQL and UI
- Git branch：`feat/gantt/roundtrip-pairing-builder`

## 本轮对话上下文

Approved Cost Library implementation delivered across dedicated PG tables, live-server API/calculators and real Legality UI. Spec: docs/superpowers/specs/2026-09-10-cost-library-pg-design.md. No new approval needed for this scope. User explicitly requested multiple agents and GPT-5.5 testing.
Five cost tables keep immutable revisions and pinned set membership; template 001 is protected and copies use atomic numbering. GH default 85, through90 at1.2, above90 at1.5; standby default factor0.5 and cutoff60minutes, configurable. Seventeen illustrative defaults are not verified airline tariffs. Workbenches calculate saved revisions; automatic recovery selection/payroll are outside scope.
SQL migration/seed and repeatable installer are documented in docs/modules/crew-recovery/cost-library-database.md. Configured f8_sit_live installation/repeat verification passed using the configured environment connection. No UAT write. Other DB synchronization adds structure/missing defaults without overwriting customized prices/membership.
GPT-5.5 backend tests:31 PASS. GPT-5.5 real UI Playwright:3 PASS in13.4s; cleanup0 sets/instances; seed templates unchanged. Receipts: docs/test-cases/crew-recovery/cost-library.md and cost-library-pw.md. Gantt/backend builds and typechecks passed; npm run check:ui PASS0 hard/124 existing warnings; git diff --check passed. Same-run desktop/mobile screenshots in docs/assets/screenshots/crew-recovery/cost-library-*. Mobile existing shell leaves narrow working area; desktop primary planning surface.
Live UI http://localhost:5173/altair/legality -> Cost Sets/Cost Templates. Compiled live-server running port3000 from live-server with env file; no tunnel changes. Preserve unrelated dirty files. No commit/push performed.
Previous context preserved at docs/dev-context/2026-09-09-gantt-roundtrip-pairing-builder.md. This context adds Cost Library work, not a replacement for prior pairing decisions.

## 当前工作树快照

### git status --short

```text
 M .claude/settings.json
 M docs/architecture/codebase-index.md
 M docs/architecture/data-model.md
 M docs/assets/screenshots/gantt/ek-et-base-loop-integrity-Ver1.png
 M docs/dev-context/LATEST.md
 M e2e/config/cr-public-validation.config.ts
 M e2e/tests/gantt/ek-et-base-loop-integrity.spec.ts
 M e2e/tests/gantt/ek-et-duty-rest-integrity.spec.ts
 M gantt/src/components/legality/legality-view.tsx
 M gantt/src/components/shell/shell-sidebar.tsx
 M gantt/src/config/menu-registry.ts
 M gantt/src/stores/shell-store.ts
 M live-server/src/index.ts
?? .agents/skills/141-crew-seed-generator/fixtures/ethiopia-add-7m8.json
?? docs/assets/screenshots/crew-recovery/
?? docs/assets/screenshots/gantt/cr-public-pairings-per-day-Ver1.png
?? docs/assets/screenshots/gantt/demo-live-add-base-tour-Ver1.png
?? docs/assets/screenshots/gantt/ek-et-duty-rest-integrity-Ver3.png
?? docs/assets/screenshots/gantt/pairing-builder-option-a-desktop-Ver1.png
?? docs/assets/screenshots/gantt/pairing-builder-option-a-mobile-Ver1.png
?? docs/assets/screenshots/gantt/pairing-builder-option-a-results-Ver1.png
?? docs/assets/screenshots/gantt/pairing-builder-option-b-desktop-Ver1.png
?? docs/assets/screenshots/gantt/pairing-builder-option-b-mobile-Ver1.png
?? docs/assets/screenshots/gantt/pairing-builder-option-b-results-Ver1.png
?? docs/assets/screenshots/gantt/pairing-builder-option-c-desktop-Ver1.png
?? docs/assets/screenshots/gantt/pairing-builder-option-c-mobile-Ver1.png
?? docs/assets/screenshots/gantt/pairing-builder-option-c-results-Ver1.png
?? docs/assets/screenshots/gantt/pairing-builder-option-c-ver2-four-segments-Ver1.png
?? docs/assets/screenshots/gantt/pairing-builder-option-c-ver2-four-segments-Ver2.png
?? docs/assets/screenshots/gantt/pairing-builder-option-c-ver2-layover-Ver1.png
?? docs/assets/screenshots/gantt/pairing-builder-option-c-ver2-layover-Ver2.png
?? docs/assets/screenshots/gantt/pairing-builder-option-c-ver2-mobile-Ver1.png
?? docs/assets/screenshots/gantt/pairing-builder-option-c-ver2-mobile-Ver2.png
?? docs/assets/screenshots/gantt/pairing-builder-option-c-ver2-results-Ver1.png
?? docs/assets/screenshots/gantt/pairing-builder-option-c-ver2-results-Ver2.png
?? docs/assets/screenshots/gantt/pairing-builder-option-c-ver2-search-Ver1.png
?? docs/assets/screenshots/gantt/pairing-builder-option-c-ver2-search-Ver2.png
?? docs/assets/videos/
?? docs/dev-context/2026-09-09-gantt-roundtrip-pairing-builder.md
?? docs/modules/crew-recovery/
?? docs/superpowers/plans/2026-09-10-cost-library-pg.md
?? docs/superpowers/plans/2026-09-10-crew-cost-mockups.md
?? docs/superpowers/specs/2026-09-09-pairing-builder-mockups/
?? docs/superpowers/specs/2026-09-10-0917-crew-recovery-cost-library-design-Ver1.md
?? docs/superpowers/specs/2026-09-10-cost-library-pg-design.md
?? docs/superpowers/specs/2026-09-10-crew-cost-standby-tiers-Ver2.md
?? docs/superpowers/specs/2026-09-10-crew-recovery-cost-library-mockups/
?? docs/superpowers/specs/2026-09-10-legality-cost-mockup-Ver1/
?? docs/superpowers/specs/2026-09-10-legality-cost-mockup-design-Ver1.md
?? docs/test-cases/crew-recovery/
?? e2e/config/cost-library.config.ts
?? e2e/config/demo-video.config.ts
?? e2e/docs/
?? e2e/results/cost-library/
?? e2e/results/demo-video/
?? e2e/results/roundtrip-builder/
?? e2e/tests/gantt/assign-add-7m8-crew-batch-j4001-j4040.spec.ts
?? e2e/tests/gantt/cost-library.spec.ts
?? e2e/tests/gantt/cr-public-pairings-per-day.spec.ts
?? e2e/tests/gantt/demo-live-add-base-tour.spec.ts
?? e2e/utils/demo-video/
?? gantt/src/components/cost/
?? gantt/src/services/cost-library-api.ts
?? gantt/src/types/cost-library.ts
?? live-server/scripts/install-cost-library.mjs
?? live-server/src/routes/cost/
?? live-server/src/services/cost/
?? sql/migration/2026-09-10-cost-library.sql
?? sql/seed/2026-09-10-cost-library.sql
?? sql/seed/2026-09-10-crew-add-j4001-j4040-add-7m8.sql
```

### unstaged changed files

```text
.claude/settings.json
docs/architecture/codebase-index.md
docs/architecture/data-model.md
docs/assets/screenshots/gantt/ek-et-base-loop-integrity-Ver1.png
docs/dev-context/LATEST.md
e2e/config/cr-public-validation.config.ts
e2e/tests/gantt/ek-et-base-loop-integrity.spec.ts
e2e/tests/gantt/ek-et-duty-rest-integrity.spec.ts
gantt/src/components/legality/legality-view.tsx
gantt/src/components/shell/shell-sidebar.tsx
gantt/src/config/menu-registry.ts
gantt/src/stores/shell-store.ts
live-server/src/index.ts
```

### staged files

```text
(none)
```

## 新窗口恢复建议

新窗口先阅读：

1. `NEXT_CONTEXT.md`
2. 本文件：`docs/dev-context/2026-09-10-gantt-cost-library-pg.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
