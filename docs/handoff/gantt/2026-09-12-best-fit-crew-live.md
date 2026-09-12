# Gantt Handoff — Best-fit crew for open pairings (Live), 2026-09-12

## Scope

Live Gantt slice of the best-fit crew feature: given one or more open pairings, rank the crew
who can legally take them, then hand a reviewed shortlist to the normal assign path.

Design: `docs/superpowers/specs/2026-09-11-best-fit-crew-batch-design-Ver2.md` (see its
§Implemented for the as-built record and the deliberate deviations).
Interactive prototype: `docs/superpowers/specs/2026-09-11-best-fit-crew-mockups/`.

## What Changed

Backend (`live-server`, read-only planner — same brain/hands split as Auto-assign):

- `src/services/assignment/preview-roster-items.ts` — the ONE definition of the
  `PreviewRosterItem[]` for "crew C takes pairing P", plus duty-level pairing credit.
  `auto-assign-service.ts` now delegates its `expandAccepted` to it (behaviour unchanged).
- `src/services/best-fit/best-fit-service.ts` — candidate pipeline (Stage 1 eligibility via the
  shared `validateAssignment`, isolated before/after legality delta, cost, combined preview).
- `src/routes/best-fit/best-fit.ts` — `POST /api/best-fit/pairing`,
  `POST /api/best-fit/combined-preview`; registered in `src/index.ts`.

Frontend (`gantt`):

- `src/services/best-fit-api.ts`, `src/stores/best-fit-store.ts`
- `src/components/best-fit/best-fit-dialog.tsx` — one screen: worklist, per-slot ranking,
  evidence detail, combined bar, apply-to-draft
- `src/utils/best-fit-candidates.ts` (entry-2 list), `src/utils/best-fit-apply.ts` (hands)
- Entries: `pane-condition-strip.tsx` (`best-fit-button`, Live pairing pane icon cluster) and
  `roster/context-menu.tsx` ("Find best-fit crew…" on a pairing row); wired from
  `panes/pairing-pane.tsx`; mounted once in `shell/app-shell.tsx`.

Tests / evidence:

- `live-server/tests/unit/best-fit-service.test.ts` (19), existing `auto-assign-service.test.ts` (6)
- `gantt/src/utils/__tests__/best-fit-candidates.test.ts` (10)
- `e2e/tests/gantt/best-fit-crew-open-pairings.spec.ts`
- `docs/assets/screenshots/gantt/best-fit-crew-live-Ver2.png`

## How the Rust simulation works

Per pairing, per open rank slot, per eligible crew:

1. **Stage 1** resolves the slot with `@rois/shared-rules.validateAssignment` — the same function
   `precheckAssignment` uses, including the rank-acting downgrade. Base/fleet/division come from
   one bulk current-effective query.
2. **Baseline and after in one request**, both with the **pairing-scoped overlay**
   (`focusPairingIds`): baseline = the crew's roster with the shortlisted pairings removed;
   after = same roster plus that crew's hypothetical segment rows.
3. **Delta** by identity `(rule, instance, scope, pairing, duty, flight, window)`. Identical →
   `existingViolations` (shown, never blocking). Anything else → new/changed. Severity ≥ 3 blocks;
   < 3 stays selectable as a soft warning.
4. Engine failure → `unknown`, never `pass`, and not shortlistable.
5. **Combined preview** puts the chosen slot/crew combinations on one hypothetical roster per crew
   and diffs it against the same baseline.

### Traps found the hard way — do not regress these

- **Never use a window overlay for the baseline.** It replaces a date slice with the loaded roster
  rows and can drop duties at the slice edges, which invents "new" findings (this produced several
  false hard blocks). Both sides must use the pairing-scoped overlay.
- **The combined preview must diff too.** Returning the crew's raw after-state surfaces unrelated,
  pre-existing findings and blocks valid shortlists.
- **Missing manday is not zero.** A crew with no `crew_manday_*` row for the period arrives as
  MBH/MCred 0, which used to sort as "the free-est crew" on both ranking bases. Such crew are now
  `statsAvailable: false`, rank below known crew, and show `no data`.
- **Cost: only the guarantee member is priced.** Feeding credit hours into every cost member billed
  the whole catalogue for one pairing (USD 57,645 on the demo set). Hotel / per-diem / deadhead /
  callout / booking / delay / standby members are `not-applicable` with a reason until each gets an
  event adapter.
- **Pre-apply re-check.** `Assign N to draft` re-runs the combined preview first and writes nothing
  if the fresh verdict is not ok — another planner may have moved crew since the button lit up.

## Decisions

- **Live-only for now.** Scenario is gated off (the button is behind a Live-only prop), because
  Scenario needs scenario-context preview plus the display-id ↔ `sourcePairingId` mapping.
- **Per-pairing endpoints, not a job queue.** The dialog fires one bounded request per selected
  pairing (max 5 per run, max 6 candidates per slot) so progress and cancellation come for free.
  A job/polling contract is the right answer if the batch needs to exceed a single screen.
- **Assign = draft, never publish.** `Assign N to draft` replays each seat through
  `assignPairingDraft` (drag-drop's own path: draft op + precheck + live legality + rollback + lock)
  and the planner presses **Save**. No auto-save, no background assignment.

## Validation

Run in an isolated worktree built from `origin/main` (the feature branch it was developed on is
~107 files behind main, so verification there was not sufficient):

```sh
cd live-server && npx tsc --noEmit -p tsconfig.json
cd live-server && npx vitest run tests/unit/best-fit-service.test.ts tests/unit/auto-assign-service.test.ts
cd gantt && npx tsc --noEmit
cd gantt && npx vitest run src/utils/__tests__/best-fit-candidates.test.ts
cd e2e && GANTT_BASE_URL=http://127.0.0.1:5273 npx playwright test --config=config/playwright.config.ts \
  --project=gantt --no-deps tests/gantt/best-fit-crew-open-pairings.spec.ts --reporter=list
npm run check:ui
```

Results: gantt `tsc` clean; 25 backend units + 10 gantt units pass; the Playwright spec passes
(~24-29 s) against the real Live Gantt and the real `rule-engine-rs` binaries, covering
run → verdicts → hard-blocked not selectable → shortlist → combined check → assign to draft → undo;
`check:ui` PASS with 0 hard violations.

## Known Issues Carried In

1. **`live-server` does not typecheck on `origin/main`.** `src/services/rule/legality-preview.ts:266`
   assigns a `string | null` `dimension` while the interface declares
   `'BASE' | 'RANK' | 'FLEET' | null` (introduced by `6237137`, unmodified by this work). It is
   pre-existing and unrelated, so it was left alone — but `npx tsc --noEmit` in `live-server` is red
   on main regardless of this feature. The best-fit files themselves introduce no type errors.
2. `live-server/tests/unit/legality-recheck-core-param.spec.ts` has 10 failures on this machine
   (Rust binary staleness vs `rule-engine-rs/src`), also pre-existing.
3. Pairing-canvas right-click is unreliable in demo data (playbook §11.4), so Entry 1 is covered by
   unit tests rather than driven in the Playwright spec.

## Data Caveat For Demos

Only ~343 crew have any 2026 `crew_manday_*` row out of ~9,178 loaded, and existing rows often carry
0 block hours. With MBH 0 and month credit far below the 85 h guarantee floor, both ranking bases
flatten (fairness degrades to crew-id order; cost is 0). Seed manday for the roster period of the
crew in scope before demoing the ranking.

## Environment Notes

- The Gantt dev server is **not** on :5566 on this machine — that port serves another project
  (`ROIs-Suit-aiGen-EVACC`). Run `cd gantt && npx vite --port 5273 --host 127.0.0.1` in a foreground
  session (it exits if backgrounded from a short-lived shell) with
  `VITE_LIVE_TARGET=http://127.0.0.1:3000`.
- Log in through the real form (`login-user-code` / `login-password` / `login-sign-in`); seeding
  `sessionStorage` directly did not authenticate in the e2e harness.
- Live starts with no data on a fresh session (`live-empty-state` → Filter → Apply); a session whose
  filters were already applied comes up loaded. The spec handles both.

## Next Steps

1. Scenario parity (scenario-context preview + display-id mapping) if it is wanted there.
2. Cost adapters for the not-applicable members (layover nights, per-diem, DHD, callout) so the cost
   basis has more than the guarantee delta to work with.
3. Optional convenience: "assign and save" after a passing combined check — needs an explicit
   product decision, since it lets Best-fit publish.
