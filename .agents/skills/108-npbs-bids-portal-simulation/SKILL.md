---
name: 108-npbs-bids-portal-simulation
description: Use when mapping legacy NPBS-Legend crew bids (CLASS-BidsReport_*.txt) onto our pbs-portal bid properties, or when running/extending the Playwright simulation that logs in as each crew and replays their bids through the real portal UI. Also covers the R'Bot "create crew bids"/"add bids" chat trigger that spawns this simulation headed. Triggers on "NPBS bids", "legend bids", "crew bids report", "replay crew bids", "bid simulation", "create crew bids", "add bids", or extending the test to more crew/bases/ranks/months.
---

# NPBS-Legend Bids → Portal Crew-Bids Playwright Simulation

Convert a legacy **NPBS-Legend** bids export into our **pbs-portal** bid properties, then drive the
real portal UI as each crew (login → open bid page → configure dialog → set tier → ADD BID → assert
the row lands). Used to test portal bidding against realistic, production-shaped bid data.

**Project rule #7 (hard):** never change product code to make a bid fit. Unmappable predicates and any
Playwright/login/UI blocker are *recorded*, not forced.

**Project rule #8 (hard — ALWAYS):** after every simulation run (direct or R'Bot-driven), generate the
MS Word report. The run is not done until the `.docx` exists:
```bash
node e2e/utils/npbs/generate-report.mjs   # → docs/test-cases/pbs/NPBS-Bids-Simulation-Report-YYYY-MM-DD-HHMM.docx
```
The default filename is timestamped (local `YYYY-MM-DD-HHMM`) so each run keeps its own report; pass an
explicit path as `argv[2]` to override.
It aggregates the latest `e2e/results/npbs-issues/*.json` (per-crew placed/blocked + screenshots) into
a Word summary. Report the path + headline tally (crew, placed/total, zero-bid crew, blockers) in the
completion message. No run report → work is incomplete.

## File map (this repo)

| Purpose | Path |
|---|---|
| Predicate→property mapping | `e2e/utils/npbs/mapping.mjs` |
| Parser (records/context/groups/tiers/dates/select) | `e2e/utils/npbs/parse-npbs-bids.mjs` |
| Parser unit tests (`node --test`) | `e2e/utils/npbs/parse-npbs-bids.test.mjs` |
| Fixture generator CLI | `e2e/utils/npbs/generate-fixture.mjs` |
| Committed fixture | `e2e/fixtures/pbs/npbs-bids-jun2026.json` |
| Page object (drives the UI) | `e2e/pages/pbs-portal/bid-workbench-page.ts` |
| Simulation spec (PBS-33xx) | `e2e/tests/pbs-portal/npbs-crew-bids-simulation.spec.ts` |
| Unmapped/issue reports | `e2e/results/npbs-issues/` |
| Failure snapshots | `image/pbs/<crew>_<testId>_<tier>-<code>_<tag>_<ts>.png` |
| Word report generator | `e2e/utils/npbs/generate-report.mjs` → `docs/test-cases/pbs/NPBS-Bids-Simulation-Report-YYYY-MM-DD-HHMM.docx` |
| Sample export | `docs/test-cases/CLASS-BidsReport_March2026.txt` |
| Playbook | `docs/modules/pbs/npbs-bids-simulation-playbook.md` |
| Original design spec | `docs/superpowers/specs/2026-06-20-npbs-bids-to-portal-playwright-simulation-design.md` |
| Current catalog refresh spec | `docs/superpowers/specs/2026-07-17-npbs-bids-simulation-current-catalog-refresh-design.md` |

## NPBS report grammar

- `76`-dash long rulers delimit alternating **header** / **body** segments.
- Header: `Seniority N   Category <BASE>-<FLEET>-<RANK>   Employee #  <id>` + `Default Bid` | `Current Bid`.
- Body: `Bid Preferences:` then numbered preference lines (priority order). `51`-dash short rulers
  delimit **bid groups**; only the **first/primary** group carries numbered lines.
- Each crew appears as up to two records (Default + Current).

## The 6 conversion rules

1. **Map** each predicate → portal property (table below); route to its page.
2. **Context:** Current beats Default (keyed by Employee #).
3. **Groups:** split body on short rulers; primary group = the numbered one.
4. **Tier:** primary group's real predicates (skip `… Bid Group` / `Award Pairings` /
   `Clear Schedule and Start Next Bid Group`) → **T1..T7**; drop beyond 7.
5. **Dates:** shift `Mar … 2026` → `Jun … 2026` (text, ISO `2026-03-dd`, and the Period line).
6. **Select crew:** default buckets `YVR-CA, YVR-FO, YYZ-CA, YYZ-FO`, 6 each, crew needs ≥4 mapped props.

## Current mapping (portal property codes — authority: `packages/contracts/pbs-*-bids.js`)

Only map to conditions visible in the current employee bid UI. If a legacy NPBS predicate points at a
hidden/retired condition, return `{ skipped, reason: "hidden-current-catalog: ..." }` instead of
opening stale UI.

- **pairing** current targets:
  - Landing/Layover airport → `168 Airport Preference` (`event=landing|layover`, locations, optional date/layover fields left off unless present).
  - Pairing Number → `102 Pairing Preference` (`pairing-preference`; search/select actual pairings).
  - Check-In / Check-Out Time → `103 Pairing Check-In / Check-Out Time`.
  - Duty Legs → `107 Flight Legs per Duty`.
  - Pairing Length → `112 Pairing Length` (`>N => minDays=N+1`, `<N => maxDays=N-1`, `=N => min=max=N`).
  - Flight Number → `116 Flight Number Preference`.
  - Redeye → `117 Redeye Preference`.
  - Deadhead / Time Between Flights / Month-End Carryover map only when the NPBS text explicitly provides those fields.
  - `Any Duty On` is recorded as `unsupported-current-editor: Work Day Preference` because the current editor requires check-in windows not present in the legacy predicate.
- **days-off** current targets:
  - Prefer Off → `201 Prefer Off` (specific dates/date range/days of week/weekends/time window; no fulfilment/min/max).
  - Long Stretch Off / Compressed Flying → `204` only when the predicate includes a date window; action is default Award.
- **line** current targets:
  - Credit Window Preference → `429` (company low/high when legacy says Minimum/Maximum Credit Window; custom only with explicit values).
  - Minimum Base Layover → `407`.
  - Commuter Pattern → `408`.
  - Efficient Flying First → `428`.
  - Mixed Block Pattern → `410` only when the legacy text clearly expresses reserve/flying mixed-block segments.
  - Reserve Avoidance → `427`.
- **reserve** current target:
  - Short Call Type → `301 Reserve Preference`.
  - old `302 Reserve Day On` is hidden and must not be replayed.
- Compound `If…If…` → map the **primary** clause, log the rest. Exotic predicates → skip + log.

## Portal UI shape (grounded in the current live DOM)

- Current bid pages are merged:
  - `/bid` for `DAYS OFF`, `PAIRING`, `LINE` tabs.
  - `/reserve` remains separate for current Reserve Preference.
- The merged `/bid` page uses `data-testid="bid-page"`, tab labels `FAVORITED PROPERTIES`, `DAYS OFF`,
  `PAIRING`, `LINE`, and search placeholder `Search Bid Properties`.
- Add workspaces still exist inside the active tab:
  `pairing-add-properties-workspace` for Pairing and `rule-bid-add-properties-workspace` for Days Off/Line.
- Existing rows on `/bid` are `data-testid="tier-summary-row"` and carry a visible type badge:
  `Days Off`, `Pairing`, or `Line`. `clearExisting(kind)` MUST delete only rows for the requested kind.
- Config dialogs use current condition-specific aria labels (for example `Airport Preference airports or cities`,
  `Flight Legs per Duty operator`, `Pairing Length minimum days`, `Configure bid for Commuter Pattern min days on`).
  Do not rely on the old universal `BID <name>` labels except for legacy generic controls that still expose them.
- Login: `userCode`=Employee #, password `rois` (plaintext accepted). **Auth lockout:** rapid repeated
  logins trip a per-account lockout (~60s); log in **serially**, one per crew (the spec does this).
- The **pairing** panel hydrates slowly on the remote demo DB — wait up to 120s for the workspace.

## Run / extend

```bash
# 1. unit-test the parser
node --test e2e/utils/npbs/parse-npbs-bids.test.mjs

# 2. (re)generate the fixture from an export
node e2e/utils/npbs/generate-fixture.mjs [input.txt] [fixtureOut] [reportOut]

# 3. run the simulation (serial; --no-deps if pbs-setup not needed)
cd e2e && npx playwright test --config=config/playwright.config.ts --project=pbs-portal \
  --no-deps npbs-crew-bids-simulation.spec.ts --workers=1 --reporter=list
```

**Extend to more crew/bases/ranks:** edit `BUCKETS`/`perBucket`/`minProps` in `generate-fixture.mjs`,
regenerate, re-run. The spec is data-driven — no test-code change needed.
**New month export:** point the generator at the new `.txt`; adjust the `shiftDates` target if the
sample month differs from the live target month.

### Generator flags (added 2026-06-22 for the real June export)

| Flag | Purpose |
|---|---|
| `--exclude-bases YEG` | **All-crew mode** — select EVERY crew except the listed bases; buckets auto-derived from the data and **uncapped** (overrides `--per-bucket`/`--bases`/`--ranks`). |
| `--min-props 1` | Lower the inclusion floor (default 4). Use `1` for "enter for all crew" so crew with few mappable props still run. |
| `--no-shift` | Boolean. **Skip `shiftDates` entirely** — use when the source is ALREADY the target month (a real month export). Dates enter verbatim, including any stray off-month dates the crew actually bid. |

Real-export example — enter **all non-YEG crew** for the live June calendar, no date shift:
```bash
node e2e/utils/npbs/generate-fixture.mjs \
  docs/test-cases/CLASS-BidsReport_June2026.txt \
  e2e/fixtures/pbs/npbs-bids-all-nonyeg-jun2026.json \
  e2e/results/npbs-issues/_fixture-report-all-nonyeg.json \
  --exclude-bases YEG --period-start 2026-06-01 --period-end 2026-06-30 --min-props 1 --no-shift
# → 586 crew (no YEG). Run HEADLESS for a set this size (~30s/crew ≈ 5h); a visible
#   browser for hundreds of crew is pure overhead. clearExisting() per page = "clean up if exists".
```
**Smoke first (always, for big runs):** slice 2 crew out of the fixture, run headless, confirm PASS,
THEN launch the full set in the background — never launch a 5-hour run unproven (§No-Illusion).
**Background:** `nohup … &` detaches it from harness tracking — start a separate harness-tracked
monitor (`while pgrep -f "playwright test.*npbs-crew-bids"…; do sleep 60; done`) so completion notifies you.

## Gotchas (verified)

- **CRLF source export (CRITICAL — silent zero-bid):** the real June export is **CRLF**; the March
  sample was LF. A trailing `\r` makes the numbered-predicate regex `^\s*\d+\.\s+(.*)$` fail (`$`
  won't match before `\r`) → parser extracts **0 predicates AND 0 dropped** for every crew (the
  tell-tale: 665 effective crew, all `props:0 dropped:0`). Fixed once in `splitRecords` by splitting
  on `/\r?\n/`. If a new export yields all-zero props, suspect line endings first (`file <txt>` →
  "CRLF line terminators").
- **Off-month dates are real source data, not bugs:** the June export contains genuine `Mar …, 2026`
  Prefer-Off dates (crew bid March days). With `--no-shift` they enter **verbatim**; the portal may
  reject out-of-period dates → recorded as a blocker, never patched/shifted (hard rule #7).
- **Tiers (CRITICAL):** the config dialog's tier buttons (`TierToggleGroup`) carry an aria-label that
  OVERRIDES their accessible name, so `getByRole('button',{name:'T3'})` matches NOTHING. Locate by
  visible text inside `ul[aria-label="Tier options"]` and read `data-active`. Toggling is multi-select
  with "can't drop the last active" — to set a single tier, activate the target first, then deactivate
  the others (default is T1). `assertExisting` MUST verify the target tier's existing-row button is
  `data-active="true"` — otherwise a "everything lands at T1" bug passes silently (it did, once).
- **Idempotency:** drafts persist server-side; re-adding conflicts AND a prior run can leave the wrong
  tier. The spec calls `clearExisting()` (clicks each "Delete existing …" button) at the start of each
  page so every run places fresh at the correct tier. Do **not** use "Reset All" (draft-version conflict).
- **Airport Preference (168):** legacy `Any Landing In` / `Any Layover In` now maps to one current
  property, not old 101/104. The page object chooses `Landing` or `Layover`, opens
  `Airport Preference airports or cities`, filters each code through the listbox, and clicks matching
  options. Codes absent from the airline dictionary are recorded; never type unsupported free-text chips.
- **Pairing Preference (102) — picker, MUST select a real row.** Legacy `Pairing Number ...` now maps to
  current `Pairing Preference`, not old `Pairing Number`. Use the picker search input (`Search pairings`)
  and check `Select pairing <label>` for real period/base-scoped rows. Typed text is not enough; missing
  pairings stay blockers. Strip source suffixes such as `Check-In Date ...` and `Limit N` from the label
  before searching.
- **Work Day Preference (110):** the current editor requires check-in windows. Legacy `Any Duty On ...`
  only carries date/day, so the mapper records `unsupported-current-editor` instead of inventing a time
  window.
- **Date commas:** `Jun 3, 2026` contains a comma — the CSV splitter rejoins the year fragment; keep
  this when editing `mapping.mjs`.
- **Invalid shifted dates:** `Mar 31 → Jun 31` doesn't exist; `toIso` clamps to the month's last day.
- Verify placed rows **on the same page view** (no re-navigation) so the slow pairing panel's existing
  rows are already hydrated.
- **Failure capture:** every failed step screenshots to `image/pbs` (named crew/testId/tier-code/tag/ts)
  and the path is recorded in the crew's issue JSON. Run `generate-report.mjs` for the Word summary.

## R'Bot trigger ("create crew bids" / "add bids") — added 2026-06-21

R'Bot (gantt AI chat → `ai-server` :3005) can launch this simulation **headed** from chat.

- **Tool:** `create_crew_bids` in `ai-server/src/chat/tools.py` (required: `bases[]`, `ranks[]`,
  `start`, `end`). System prompt makes R'Bot **slot-fill** — it keeps asking until ≥1 base AND ≥1 rank
  AND a start+end date are present, then calls the tool. `crew_bids_params()` re-validates server-side
  (incomplete → no run, chat asks). It is NOT a client AiAction (`tool_call_to_action` returns None).
- **Run seam:** `ai-server/src/crewbids/runner.py` — `start_run(params)` (background thread + registry)
  → `build_fixture_cmd` (node generate-fixture, scoped) → `build_playwright_cmd(headed=True)`. Status:
  `GET /ai/crew-bids/runs/{id}`. The chat reply carries the run id.
- **Scope rule:** base AND rank → base×rank buckets, 6 crew each (`PER_BUCKET`). Pages =
  `days-off,pairing,line` (reserve skipped; via `CREWBIDS_PAGES`). Per crew: login → those pages →
  **explicit logout** (`PbsLoginPage.logout()` clicks `aria-label="Log out"` → "Log Out" confirm).
- **Parametric fixture:** `generate-fixture.mjs --bases YVR,YYZ --ranks CA,FO --period-start
  2026-07-01 --period-end 2026-07-31 --per-bucket 6`. `shiftDates(text,{month,year})` shifts the March
  source dates into the requested bidding month (day-of-month preserved). Spec reads `CREWBIDS_FIXTURE`.
- **Spec:** `docs/superpowers/specs/2026-06-21-rbot-create-crew-bids-design.md`. Tests: ai-server
  `tests/test_crewbids.py` + `test_chat_tools.py`/`test_chat_route.py` (slot-fill, fire, cmd builders).
- **Hard rules unchanged:** Playwright-only, never patch product code to force a bid, all blockers
  recorded. Headed run needs portal :3030 + ai-server :3005 up; LLM keys in `ai-server/.env`.
- **⚠ Target-month gotcha:** the run's month = whatever `--period-start/--period-end` (or the R'Bot
  date range) you pass; `shiftDates` then maps the March source day-of-month into THAT month. If you
  drive R'Bot with July dates for a wiring test, the live portal gets **July** bids even though the
  portal's bidding calendar is June. For the real June entry, run the committed June fixture
  (`e2e/fixtures/pbs/npbs-bids-jun2026.json`, `period:202606`) via `CREWBIDS_FIXTURE`, OR ask R'Bot
  for `2026-06-01 → 2026-06-30`. `clearExisting()` per page wipes the stale wrong-month rows first.
- **Reversed-range source bids** (e.g. crew 2376 T6 `Jun 31 → Jun 2`) are a source data-quality
  defect — the tier guard correctly refuses to claim they landed; recorded, never patched/weakened.
