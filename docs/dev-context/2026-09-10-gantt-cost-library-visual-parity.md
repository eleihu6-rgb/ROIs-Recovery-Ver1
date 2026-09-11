# 开发上下文（2026-09-10）

> 这份文档由 `./save-context.sh` 生成，用于给后续 AI / 开发者恢复本次对话上下文。
> 只记录开发侧上下文，不写产品用户记忆、数据库密码、Token 或其他运行时敏感信息。

## 基本信息

- 时间：2026-09-10 15:20:51 PDT
- Wing：`gantt`
- Topic：`cost-library-visual-parity`
- Title：Cost Library visual parity and crew comparison
- Git branch：`feat/gantt/roundtrip-pairing-builder`

## 本轮对话上下文

User approved docs/superpowers/specs/2026-09-10-cost-library-visual-parity.md and explicitly proceeded to development. Comprehensive alignment with legality-cost-mockup-Ver1 plus earlier workbench screenshot chart comparison, not only backgrounds/icons.
Implemented cost-library-view.tsx visual hierarchy, readable catalogue labels, counts, set descriptions/status/selection, responsive table columns and formatted prices; historical standby loads pinned GH histories. cost-detail.tsx has parameter title icon, three-column forms and spaced tier table. New cost-workbench.tsx keeps single crew and adds Compare crews for GH/standby via existing saved-revision server calculator, before/after bars on shared scale, saved GH marker, standby HH:MM KPIs, side-by-side breakdown/cash difference and baseline replaced row. Clears stale outputs and discards stale in-flight responses. No schema/API/payroll math changes. All workbench crew values are user-entered scenarios, not new payroll records.
Global unlayered universal border-color reset overrides Tailwind layered accents. Fixed only local cost selection edges and GH/formula markers with inline existing theme tokens; no global CSS changes. Teal result tint uses readable foreground text; disabled/unpriced is neutral and not comparable.
GPT-5.5 verification: focused backend31 PASS, real UI Playwright3 PASS; receipt docs/test-cases/crew-recovery/cost-library-visual-parity.md. Gantt tsc --noEmit PASS, npm run check:ui PASS0 hard/124 preexisting warnings, git diff --check PASS. Versioned same-run screenshots in docs/assets/screenshots/crew-recovery/. Parent visually inspected standby-compare-workbench-tall-Ver2.png and standby-mobile-breakdown-bottom-Ver1.png: complete comparison/baseline row visible, amber marker clear. Element screenshots inside clipped scrollports were misleading; final evidence uses taller desktop viewport and genuine mobile page screenshots at chart/breakdown positions. Mobile uses existing collapsed shell sidebar.
Default acceptance: GH85,1.2 through90,1.5 beyond; rate100; standby0700/dep1000 factor0.5 cutoff60 and pairing5.75 ->2:00 eligible,1:00 standby,6:45 assignment. A84->90:45 costs712.50;B70->76:45 costs0;delta712.50. Default template configurations preserved; test fixtures cleanup exact IDs.
Live UI remains http://localhost:5173/altair/legality -> Cost Sets. No commit/push, no UAT writes, no extra DB deployment required. Preserve unrelated dirty files. Previous PG implementation context docs/dev-context/2026-09-10-gantt-cost-library-pg.md; pairing context docs/dev-context/2026-09-09-gantt-roundtrip-pairing-builder.md remain relevant.

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
?? .claude/skills/demo-video/
?? docs/assets/screenshots/crew-recovery/
?? docs/assets/screenshots/gantt/add-7m8-crew-batch-roster-Ver1.png
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
?? docs/dev-context/2026-09-10-gantt-cost-library-pg.md
?? docs/modules/crew-recovery/
?? docs/superpowers/plans/2026-09-10-cost-library-pg.md
?? docs/superpowers/plans/2026-09-10-crew-cost-mockups.md
?? docs/superpowers/specs/2026-09-09-pairing-builder-mockups/
?? docs/superpowers/specs/2026-09-10-0917-crew-recovery-cost-library-design-Ver1.md
?? docs/superpowers/specs/2026-09-10-cost-library-pg-design.md
?? docs/superpowers/specs/2026-09-10-cost-library-visual-parity.md
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
?? e2e/tests/gantt/validate-add-7m8-crew-batch-j4001-j4040.spec.ts
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
2. 本文件：`docs/dev-context/2026-09-10-gantt-cost-library-visual-parity.md`
3. `docs/dev-context/LATEST.md`

然后运行：

```bash
./scripts/memory/wakeup-rois-ai.sh gantt
git status --short
```
