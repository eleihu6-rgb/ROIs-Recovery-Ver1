# Case 4 review fixes — 14 September 2026

## Reported issues and resolution

1. **Search capped with no pairing options.** Old breadth-first queue started with every earlier base departure; 256 unrelated states could prevent the anchor from ever being explored. Regression tests reproduced failure for both outbound and inbound anchors before the fix. Case 4 now starts at the selected flight, connects backwards to base and forwards to base, preferring direct base connections within the existing budget. Exact airline/fleet and current rotation validation remain mandatory. Legacy roundtrip and Cases 1–3 recovery algorithms are unchanged. A capped search is explicitly incomplete, not proof that no valid route exists.
2. **Long-layover chart unreadable.** Each duty has an independent proportional time axis, full flight/route/date/time/block labels outside the bars, and a separately labelled ground/rest interval. Bars stay clipped to their tracks. Independent scales and unscaled layovers are disclosed. No pairing legality or maximum-layover rule was changed.
3. **Case 4 layout differs from Cases 1–3.** Aligned AppDialog width/header/subtitle, compact 240px Recovery methods / By strategy rail, inset content, scrolling and fixed right-aligned footer. Pairing Options remains first and roster methods disabled until Build. Build is a form submit from the fixed footer, still an immediate save. Legacy components were not restyled. Cost tiers are not invented before crew costs exist.

The selected anchor date is now explicit in the header. The exact **ET895 Sep19** flight is ID **159575**, currently fleet **7M8**, unlike the prepared Sep17 flight **159578**, fleet **738**. Both were exercised through actual flight context menus. The wide-scope replay used **Aug25–Oct07**, as reported; the prepared replay used Sep17–25. Sep19 data was read only, never seeded/relabelled or built.

## Verification (localhost:5173/altair, existing live-server :3000)

### Focused tests — PASS, 91 tests

```sh
cd live-server
npx vitest run src/__tests__/services/pairing/recovery-rotations.test.ts src/__tests__/services/pairing/roundtrip-build.test.ts src/__tests__/services/pairing/roundtrip-routes.test.ts
# 22 PASS; new outbound/inbound starvation tests first failed against the old implementation.
cd ../gantt
npx vitest run src/services/__tests__/open-pairing-recovery.test.ts src/services/__tests__/open-recovery-save-reconcile.test.ts src/services/__tests__/recovery-trigger.test.ts src/services/__tests__/recovery-draft.test.ts src/services/__tests__/recovery-candidates.test.ts
# 69 PASS
```

### Real UI — PASS, 8 distinct tests

From `e2e/`:

```sh
npx playwright test -c config/case4.config.ts --grep 'read-only'
CASE4_RUN_WRITES=1 npx playwright test -c config/case4.config.ts --grep 'Build saves'
CASE4_RUN_WRITES=1 npx playwright test -c config/case4.config.ts --grep 'Standby Crew'
npx playwright test -c config/case4-help.config.ts
RUN_CASES_1_3_READONLY=1 npx playwright test -c config/cases-1-3-readonly.config.ts
```

- Read-only tests cover Sep17, exact Sep19 wide scope, two-duty long layover, readable flight labels, no content overflow, enabled/visible footer Build, and Close with no drafts. Repeated after final reset: 2 PASS.
- Build saved isolated Sep17 target **152688**, row 1, close/reopen directly at roster options.
- Standby CA C4002 USD0 / FO C4018 USD343.75: actual Preview → footer Apply → Gantt Save for both ranks, four persisted target flight assignments after reload.
- Cases 1–3 each opened their real costed recovery options, without Apply/Save.
- Help navigation, new timeline/search wording and loaded screenshots passed.
- Initial UI iterations exposed stale date-picker assumptions (runtime uses roster periods), overly short 5-second backend waits, and an overflow assertion that included AppDialog's intentionally outboard close icon. Tests were corrected to actual controls, 60-second request waits, and content/flight-label overflow checks. All final runs above passed; failed artifacts were retained.

### Other gates

- `npm run check:ui` — PASS, 0 hard violations / 124 existing warnings.
- `git diff --check` — PASS.
- `/tmp/rois-case4-skill-venv/bin/python /Users/kimi/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/145-crew-recovery-case-study` — PASS.
- `cd gantt && npx tsc --noEmit` — FAIL: same three existing `service-status-pill.tsx` errors (`ServiceEntry.livePort`, `SystemStatus.checkedAt`), no new errors in changed components.
- Available Crew and Move-up full Save workflows were not repeated in this follow-up; their earlier delivery evidence remains in the original Case 4 report. Shared footer handlers were exercised with Standby. No production multi-controller stress test.

## Restoration and protection

Scoped reset removed the four test target assignments and soft-deleted test pairing 152688, preserving audit history. Earlier build-only attempt 152687 was also scoped-reset. No user's Sep19 pairing was created or reset.

```sh
node --import ./live-server/node_modules/tsx/dist/loader.mjs .local/case4/reset.cjs 152688
node --import ./live-server/node_modules/tsx/dist/loader.mjs .local/case4/reset.cjs --verify
node .local/case4/inventory.cjs --compare
```

Reset and verification PASS: Case4 baseline semantics and original unpaired anchors intact. Cases 1–3 ordered-record hash unchanged:
`a1ee222c67c0827bd3dee8419266367d86eaa52826df2648bc72439ec7239cf6`.

## Evidence

Visually inspected screenshots under `docs/assets/screenshots/crew-recovery/`:

- `case4-sep19-long-layover-layout-Ver1.png`: Sep19–Oct01 rotation with readable independent duty scales, explicit 291:45 ground / 289:30 rest, matching shell and visible Build footer.
- `case4-saved-open-pairing-Ver2.png`: reopening the immediately saved pairing at roster options.
- `case4-C4018-preview-Ver3.png`: compact preview and footer actions; subsequent Apply/Save/reload assertions passed.
- `case4-help-Ver3.png`: supported instructions, new chart/search note and updated pairing screenshot.
- `cases-1-3-readonly-J4002-152056-Ver4.png`, `cases-1-3-readonly-T2001-152675-Ver5.png`, `cases-1-3-readonly-L3002-152227-Ver5.png`: unchanged legacy recovery layouts and costed options.

Recovery skill and Help updated. Supporting agents audited layout/test setup and implemented the bounded chart edit; primary reviewed the code, corrected runtime selector assumptions, ran tests and visually inspected evidence. No commit/push; unrelated worktree changes preserved. Context file saved separately; MemPalace indexing is unavailable on this checkout.
