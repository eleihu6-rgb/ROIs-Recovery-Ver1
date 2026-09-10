# Cost Library Template Defaults And Formula Receipt

Date: 2026-09-10

## Scope

- Cost Templates hide the Cost Catalogue pane, matching the Rule Templates navigation pattern.
- Cost Template workbenches seed a meaningful default case and calculate it from the saved revision.
- Cost Set workbenches remain blank for user-entered planner values.
- Each successful workbench calculation shows a plain-English calculation logic note after the breakdown/result area.
- DDL/DML sync scripts are included:
  - `sql/migration/2026-09-10-cost-library.sql`
  - `sql/seed/2026-09-10-cost-library.sql`
  - `live-server/scripts/install-cost-library.mjs`

## Verification

```bash
cd gantt && npx tsc --noEmit --pretty false
npm run check:ui
git diff --check
cd e2e && npx playwright test --config=config/cost-library.config.ts
```

Result:

- TypeScript: PASS
- UI standard gate: PASS, 0 hard violations, 124 existing warnings
- Whitespace: PASS
- Focused Cost Library Playwright: PASS, 4/4 tests in 17.2s

## Screenshot Evidence

- `docs/assets/screenshots/crew-recovery/cost-library-templates-default-case-Ver6.png`
- `docs/assets/screenshots/crew-recovery/cost-library-templates-default-workbench-Ver6.png`
