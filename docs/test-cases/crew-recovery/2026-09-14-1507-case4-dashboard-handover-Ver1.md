# Case 4 dashboard and Shift Handover — 14 September 2026

## Delivered

- Added Case 4 to the shared dashboard case registry and the Related case dropdown.
- Renamed Trigger to **Disruption cause**. Labels: Case1 **Crew sick leave**, Case2 **Flight delay**, Case3 **Aircraft fleet change**, Case4 **Ad hoc new flight**. Rule numbers remain secondary diagnostic context for Cases1–3.
- Case4 honestly shows **Not built**, **Unassigned**, **Build pairing first**, **Estimate after build**; no invented pairing ID, rule, crew assignment or executable count.
- **Open in Live** opens the Flight pane, clears the prior pairing-ID filter, loads isolated C4001–C4020 as candidates, locates prepared ET895 Sep17 flight159578 (738), and zooms the window. It does not build or assign anything. Cases1–3 keep their pairing links.
- Added the requested durable handover entry through the real UI: ID **6**, case-4, Day, Watch, author **Recovery preparation**. It describes the prepared unpaired entry, search Sep17–25, build-before-staffing, and Save semantics. It remains saved intentionally, including after reload. Repeated test runs reuse the exact visible note rather than adding duplicates.
- Help explains the dashboard and handover entry points. Existing backend caseRef string contract needed no schema/API change.

## Verification

PASS:

```sh
cd gantt && npx vitest run src/services/__tests__/recovery-dashboard-cases.test.ts
# 3 tests: cause labels, protected pairing IDs, truthful unpaired Case4 descriptor
cd ../live-server && npx vitest run src/__tests__/routes/dashboard-handover.test.ts
# 5 tests, including case-4 persistence contract
cd ../e2e && npx playwright test -c config/dashboard-recovery.config.ts
# 4 real-UI tests: table, saved handover, existing Case3 link, Case3 → Case4 link → flight right-click Recovery
npx playwright test -c config/case4-help.config.ts
# 1 Help test, wording and loaded screenshots
cd .. && npm run check:ui
# 0 hard violations, 124 existing warnings
git diff --check
```

`cd gantt && npx tsc --noEmit`: FAIL, same 3 existing service-status-pill.tsx missing livePort/checkedAt type properties. No new errors from this task.

Screenshots captured during those runs and visually inspected:
- `docs/assets/screenshots/gantt/dashboard-handover-added-Ver2.png`: all four causes and persisted Case4 note. Unrelated top KPI cards are still loading; changed dashboard panels are populated and asserted.
- `docs/assets/screenshots/gantt/dashboard-case4-flight-recovery-Ver1.png`: correct selected ET895 Sep17 and Pairing Options, no Build/roster mutation.
- `docs/assets/screenshots/crew-recovery/case4-help-Ver4.png`: new dashboard/handover instructions.

Agent support: bounded test/schema audit and E2E edits; primary reviewed test code, fixed wait sequencing, implemented integration, ran all tests and visually inspected evidence.

## Data safety and remaining caveats

Only the requested handover row was written. No flight, pairing, crew or roster edits/reset were performed. Case3 quick-link regression passed.

The **older** Case4 protection snapshot comparison failed against the currently shared database:
- expected `a1ee222c67c0827bd3dee8419266367d86eaa52826df2648bc72439ec7239cf6`
- observed `9ea1ca4d29aad48a2f9a2446b6ac41349ed730d37dab2af7dd48a1ab37ce15f0`

Read-only diff found unchanged table counts/IDs, but 2 ET2681/ET2682 flight timing rows, 2 associated Case2 pairing segments and 6 roster actual-time rows have `s2_et_scenario` audit updates; 103 crew rows have filiale/audit changes. These are not writes performed by this dashboard task. No pre-task fresh snapshot was captured, so do not claim a clean before/after comparison for this turn. Original manifest remains untouched; current private snapshot is `.local/case4/manifest-handover-current.json`. **Do not reset these shared changes to the older baseline.**

Dashboard cases remain curated fixture descriptors, not live coverage status; after a planner builds the prepared flight, descriptor text does not dynamically become a newly saved pairing ID. The existing handover list shows latest20 entries, so the test's duplicate check covers that visible scope. No commit/push.
