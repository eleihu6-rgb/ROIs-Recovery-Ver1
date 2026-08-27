# NPBS-Legend Bids → Portal Simulation Playbook

> How to run, regenerate, and extend the Playwright simulation that replays legacy NPBS-Legend crew
> bids through the real pbs-portal UI. Companion to skill `108-npbs-bids-portal-simulation` and design
> `docs/superpowers/specs/2026-06-20-npbs-bids-to-portal-playwright-simulation-design.md`.

## What this exercise does

Takes a legacy **NPBS-Legend** bids export (`docs/test-cases/CLASS-BidsReport_*.txt`), maps each
crew's bid preferences onto our portal bid properties (with tiers), and drives the portal as each crew:
**login → open bid page → configure dialog → set tier → ADD BID → assert the row lands.** It validates
portal bidding against realistic, production-shaped data and is registered in the e2e regression suite.

**Hard rule (#7):** never change product code to make a bid fit. Unmappable predicates and any
login/UI blocker are recorded under `e2e/results/npbs-issues/`, never forced.

## Components

```
docs/test-cases/CLASS-BidsReport_March2026.txt        # legacy export (sample)
        │  node e2e/utils/npbs/generate-fixture.mjs    # parse + map + select 24 crew + shift dates
        ▼
e2e/fixtures/pbs/npbs-bids-jun2026.json               # committed, deterministic fixture
e2e/results/npbs-issues/unmapped-report.json          # coverage + dropped-predicate stats
        │  e2e/tests/pbs-portal/npbs-crew-bids-simulation.spec.ts (PBS-33xx)
        │     uses e2e/pages/pbs-portal/bid-workbench-page.ts
        ▼
Playwright pass/fail  +  e2e/results/npbs-issues/<employeeId>.json (per-crew placed/blockers)
```

## The 6 conversion rules

1. **Map** predicate → current visible portal property (see skill `108` mapping table); route to the
   merged `/bid` tab or `/reserve`.
2. **Context:** Current bid beats Default (per Employee #).
3. **Groups:** primary (numbered) bid group only.
4. **Tier:** primary group's real predicates → T1..T7 (top = highest); drop beyond 7.
5. **Dates:** `Mar … 2026` → `Jun … 2026` (invalid shifts like `Jun 31` clamp to `Jun 30`).
6. **Crew:** default buckets `YVR-CA, YVR-FO, YYZ-CA, YYZ-FO`, 6 each, ≥4 mapped props per crew.

## Run

```bash
# parser unit tests (fast, no browser)
node --test e2e/utils/npbs/parse-npbs-bids.test.mjs

# regenerate the fixture from an export
node e2e/utils/npbs/generate-fixture.mjs            # defaults: March2026 export -> jun2026 fixture

# run the simulation (SERIAL — one login at a time to avoid the auth lockout)
cd e2e
npx playwright test --config=config/playwright.config.ts --project=pbs-portal \
  --no-deps npbs-crew-bids-simulation.spec.ts --workers=1 --reporter=list

# one crew only
... --grep "#73 "
```

`--workers=1` is required: rapid concurrent logins trip a per-account auth lockout (~60s window).

## Reading results

- `e2e/results/npbs-issues/<employeeId>.json` — per crew: `placed` count, `placedDetail`, and `issues`
  (each with tier, property code/name, the original predicate, a `reason`, and an `image` path).
- `e2e/results/npbs-issues/unmapped-report.json` — totals, bucket counts, and `droppedReasonCounts`
  across all effective crew.
- `image/pbs/<crewId>_<testId>_<tier>-<code>_<tag>_<timestamp>.png` — a screenshot of every failed
  step (login, page-load, or a property that could not be placed), captured automatically.

## Word report

Generate a MS Word (.docx) summary after a run — dependency-free (staged OOXML + system `zip`):

```bash
node e2e/utils/npbs/generate-report.mjs            # -> docs/test-cases/pbs/NPBS-Bids-Simulation-Report.docx
```

The report covers: methodology, summary stats, per-crew results, blocker breakdown, placement by
property code, and a failure table listing each blocker's snapshot filename.

### Known/expected blockers (recorded, not product bugs)

| Reason | Meaning |
|---|---|
| `hidden-current-catalog: ...` | Legacy predicate maps to a retired/hidden property; the current employee portal should not replay it. |
| `unsupported-current-editor: Work Day Preference` | Legacy `Any Duty On` has date/day but no check-in window, while the current Work Day editor requires windows. |
| `needs-value: ...` | The current editor requires fields not present in the legacy predicate, e.g. Long Stretch date range. |
| `add-bid-disabled (value not accepted): Pairing Preference` | Property 102 requires selecting a real current-period pairing row; legacy NPBS labels may not exist in this base/period. |
| `unsupported-input: <type>` | The page object does not yet drive that bid control; add a handler in `bid-workbench-page.ts`. |
| `property-not-found-in-workspace` | Property name not located (pagination/search); extend the opener. |
| `login-failed` | Auth lockout or account issue; recorded as a blocker for that crew. |
| `add-bid-rejected` | Portal validation rejected the value (and it was not a pre-existing duplicate). |

## Extending

- **More crew per bucket / different ranks / bases:** edit `BUCKETS`, `perBucket`, `minProps` in
  `e2e/utils/npbs/generate-fixture.mjs`, regenerate, re-run. The spec is data-driven — no test edits.
- **New input types:** add a `case` to `fillBid()` in `bid-workbench-page.ts` grounded in the current
  dialog's aria-labels. For `/bid`, `clearExisting(kind)` must stay scoped by type badge (`Days Off`,
  `Pairing`, `Line`) so one tab does not delete another tab's bids.
- **New month / new export:** point the generator at the new `.txt`; adjust the `shiftDates` target in
  `parse-npbs-bids.mjs` if the sample month differs from the live target month.
- **Make Pairing Preference placeable:** feed real current-period pairing labels into the picker, or
  keep absent legacy labels as blockers — never submit typed text without selecting a real row.

## Latest run (2026-06-20 baseline)

- **24/24 crew tests pass.** Bids placed: **107/149 (72%)** — FULL=6, PARTIAL=18, ZERO=0.
- Remaining blockers (recorded, with snapshots): Pairing Number 102 (26 — autocomplete; legacy IDs not
  in the June pairing set), a few airports 101 not in the airline option set (7), days-off steppers
  202/203/205 and line flags 401/405 (`unsupported-input`, 12 — page-object handlers not yet added),
  2 rejected, 2 exceptions.
- Report: `docs/test-cases/pbs/NPBS-Bids-Simulation-Report.docx`. Snapshots: `image/pbs/` (42).
- Regenerate by re-running the suite then `generate-report.mjs`.
