# NPBS-Legend Bids → Portal Crew-Bids Playwright Simulation — Design

> Date: 2026-06-20
> Status: Approved design (pending spec review)
> Author: AI (Claude) + eleihu6-rgb

## Goal

Use Playwright to simulate real crew operating the **pbs-portal** by replaying their bids from
the legacy NPBS-Legend system. We take the legacy `CLASS-BidsReport_March2026.txt` export, map each
crew's NPBS bid preferences onto our portal's bid properties (with tiers), and drive the portal UI
exactly as a crew would — logging in as the crew, opening each bid page/dialog, entering values,
selecting a tier, and clicking Add — then asserting each bid lands.

This validates portal bidding end-to-end against realistic, varied, production-shaped bid data,
and becomes a repeatable, extensible part of the standard e2e regression suite.

## Inputs & authoritative sources

- **Sample export:** `docs/test-cases/CLASS-BidsReport_March2026.txt` (1.5 MB, `Period: March 2026`).
- **Portal property catalogs** (the only authority for what the portal supports):
  - Pairing: `packages/contracts/pbs-pairing-bids.js` — codes **101–163**.
  - Days-off: `packages/contracts/pbs-days-off-bids.js` — codes **201–206**.
  - Reserve: `packages/contracts/pbs-reserve-bids.js` — **301** Short Call Type, **302** Reserve Day On, **311** Reserve Prefer Off.
  - Line: `packages/contracts/pbs-line-bids.js` — codes **401–427**.
- **Portal routes:** `/pairing`, `/days-off`, `/reserve`, `/line`, `/tier`, `/award`, `/dashboard`
  (under `SharedBiddingWorkbenchLayout`, base path `/fpqe/pbs/`, dev port 3030).
- **e2e infra:** `e2e/config/playwright.config.ts` (project `pbs-portal`), `e2e/pages/pbs-portal/*`,
  `e2e/tests/pbs-portal/*.spec.ts`, ID scheme `PBS-3xxx`, auth via `PbsLoginPage` (crew code + password).

## NPBS report grammar (observed)

```
----------------------------------------------------------------------------
Seniority <n>            Category <BASE-FLEET-RANK>      Employee #   <id>
Confirmation: <conf> on <ts>                            Default Bid | Current Bid
----------------------------------------------------------------------------
Buddies:

Bid Preferences:
       ---------------------------------------------------
   1.  Pairing Bid Group            <- group header
   2.  <predicate>                  <- numbered preference lines (priority order)
   3.  <predicate>
   ...
       Award Pairings               <- group footer (bare)
       ---------------------------------------------------
       Pairing Bid Group            <- next group
       ...
       ---------------------------------------------------
       Reserve Bid Group
```

- `Category` = `<BASE>-<FLEET>-<RANK>`, e.g. `YYZ-737-IFD`, `YVR-737-CA`, `YYZ-737-FO`, `YVR-737-FA`.
- Each crew appears as up to two records: a **Default Bid** and a **Current Bid**.
- Within a record, dashed sub-rulers (`-----`) delimit **bid groups**; a group opens with
  `Pairing Bid Group` or `Reserve Bid Group`.
- Numbered lines under a group are the crew's preferences **in priority order** (top = highest).
- Noise lines to ignore for tiering: `… Bid Group` headers, bare `Award Pairings`,
  `Clear Schedule and Start Next Bid Group`, `Buddies:`, blank lines.

## The 6 conversion rules

1. **Map NPBS predicate → portal property** via the mapping table below; route to the correct page.
2. **Context selection:** if a crew has a *Current Bid* record, use it; otherwise use *Default Bid*.
3. **Bid groups:** split a record into groups on the dashed sub-rulers; groups start at
   `Pairing Bid Group` / `Reserve Bid Group` and end at the next ruler.
4. **Tier mapping:** the ordered real predicate lines of the **first/primary bid group** map to
   **T1..T7** (top→bottom = highest→lowest). Predicates beyond position 7 are dropped and logged.
   Later bid groups in the same record are summarized in the unmapped log, not placed.
5. **Date shift Mar→Jun:** every `Mar <d>, 2026` becomes `Jun <d>, 2026` (day-of-month preserved;
   ISO `2026-03-dd` → `2026-06-dd`). Target month = **June 2026**.
6. **Crew selection:** 24 crew across 4 buckets (6 each), buckets = **YVR-CA, YYZ-FO, YVR-IFD,
   YYZ-FA** (both bases × all 4 ranks). A crew qualifies only if its **effective primary group has
   ≥4 mapped properties**. Selection is greedy by seniority within each bucket.

Rule #7 (project): **never change product code to fit.** Unmappable predicates and any Playwright /
login / UI blocker are recorded to an issues report; product code is untouched.

## Predicate → portal mapping table

| NPBS predicate (normalized)                                  | Page      | Property |
|--------------------------------------------------------------|-----------|----------|
| `Award/Avoid Pairings If Any Landing In <apts>`              | pairing   | 101 Any Landing In Airport |
| `… If Pairing Number <PID…>` (incl. `Check-In Date`)         | pairing   | 102 Pairing Number |
| `… If Pairing Check-In Time <op> <t>` / `Between <t> And <t>`| pairing   | 103 Pairing Check-In Time |
| `… If Any Layover In <apts>`                                 | pairing   | 104 Any/Every Layover In Airport |
| `… If Pairing Total Credit <op> <hh:mm>`                     | pairing   | 105 Pairing Total Credit |
| `… If Departing On <dow/dates>`                              | pairing   | 106 Departing On |
| `… If (Any/Total) Duty Legs <op> N legs` / `Total Legs In Pairing` | pairing | 107 / 108 |
| `… If Average Daily Credit <op> <hh:mm>`                     | pairing   | 109 Average Daily Credit |
| `… If Any Duty On <date>`                                    | pairing   | 110 Any/Every Duty On Date/Day |
| `… If Pairing Check-Out Time <op> <t>`                       | pairing   | 111 Pairing Check-Out Time |
| `… If Pairing Length <op> N days`                            | pairing   | 112 Pairing Length |
| `… If TAFB <op> <hh:mm>`                                     | pairing   | 113 TAFB |
| `… If Any Enroute Check-In Time <op> <t>`                    | pairing   | 114 Any Enroute Check-In Time |
| `… If Any Leg With Employee Number <id>`                     | pairing   | 115 |
| `… If Any Flight Number <fid>`                               | pairing   | 116 |
| `… If Any Leg Is Redeye`                                     | pairing   | 117 |
| `… If Average Daily Block Time <op> <hh:mm>`                 | pairing   | 121 |
| `Prefer Off <dates/dow/Weekends/range/window>`              | days-off  | 201 Prefer Off |
| `Set Condition Maximum Days On In A Row N`                   | days-off  | 202 Max Consecutive Days On |
| `Set Condition N Consecutive Days Off In A Row`             | days-off  | 203 Min Consecutive Days Off |
| `Set Condition Minimum Days Off In A Row N` (+ `In Window`)  | days-off  | 203 / 204 |
| `Set Condition Pattern Between X and Y Days On, with Z Off`  | days-off  | 205 Days Off / Days On Pattern |
| `Set Condition Maximum Credit Window`                        | line      | 401 Max Credit Window |
| `Set Condition Minimum Credit Window`                        | line      | 402 Min Credit Window |
| `Set Condition No Same Day Pairings`                         | line      | 404 No Same Day Pairings |
| `Waive No Same Day Duty Starts`                              | line      | 405 Waive No Same Day Duty Starts |
| `Set Condition Short Call Type CRAM/CRPM/PRAM/PRPM/PRMM`     | reserve   | 301 Short Call Type |
| `Reserve Bid Group` / `Reserve Day On`                       | reserve   | 302 Reserve Day On |
| everything else (compound `If…If…`, `Counting Deadhead Legs`, `All or Nothing`, `Else Start Next Bid Group`, exotic conditions) | — | **skip + log** |

> The mapping deliberately ignores secondary/compound conditions when a predicate carries more than
> one `If` clause: we map the **primary** clause to its property and log the dropped clause(s). This
> keeps the simulation honest (no fabricated portal inputs) per rule #7.

## Architecture

Four cooperating units, each independently understandable/testable:

### 1. Parser — `e2e/utils/npbs/parse-npbs-bids.mjs`
- **Input:** path to an NPBS `.txt` export + selection config (buckets, per-bucket count, min props).
- **Output:** `npbs-fixture.json` (selected crew with ordered, mapped, tiered properties) and
  `unmapped-report.json` (per-crew dropped predicates + reasons).
- **Pure functions** (also unit-tested via Vitest in `e2e/utils/npbs/parse-npbs-bids.test.mjs`):
  - `splitRecords(text)` → records `{ category, base, fleet, rank, employeeId, context, lines }`.
  - `selectContext(records)` → effective record per crew (Current ⟶ else Default).
  - `splitGroups(lines)` → `[{ kind: 'pairing'|'reserve', predicates: string[] }]`.
  - `shiftDates(text)` → Mar→Jun.
  - `mapPredicate(predicate)` → `{ page, propertyCode, name, action, value, tier? } | { skipped, reason }`.
  - `buildCrewBids(record)` → `{ crew, properties: [...tiered...], dropped: [...] }`.
  - `selectCrew(allCrew, config)` → 24 crew across the 4 buckets.

### 2. Fixture — `e2e/fixtures/pbs/npbs-bids-jun2026.json` (committed)
Deterministic, reviewable. Regenerated by the parser; never hand-edited. Shape:
```jsonc
{
  "period": "202606",
  "buckets": ["YVR-CA","YYZ-FO","YVR-IFD","YYZ-FA"],
  "crew": [
    { "employeeId": "96", "category": "YVR-737-IFD", "base": "YVR", "rank": "IFD",
      "context": "Current",
      "properties": [
        { "tier": "T1", "page": "pairing", "propertyCode": 105, "name": "Pairing Total Credit",
          "action": "award", "bid": { "type": "duration", "operator": ">", "value": "40:00" } },
        { "tier": "T2", "page": "days-off", "propertyCode": 201, "name": "Prefer Off",
          "action": "award", "bid": { "type": "tag-list", "values": ["Jun 3, 2026", "Weekends"] } }
      ],
      "dropped": [ { "predicate": "…", "reason": "compound If…If…" } ] }
  ]
}
```

### 3. Spec — `e2e/tests/pbs-portal/npbs-crew-bids-simulation.spec.ts`
- Reads the fixture; `test.describe` per bucket, `test` per crew (`PBS-33xx`).
- Per crew: `PbsLoginPage.login(employeeId, 'rois')` → wait for `/dashboard`.
- Per property: navigate to `property.page`, open the add-property dialog, fill value + action,
  toggle the tier (T1–T7), click **Add**, and **assert the property row appears** (e.g.
  `pairing-property-row-*` / `rule-bid-existing-row` containing the value).
- A small **page-object helper** `e2e/pages/pbs-portal/bid-workbench-page.ts` encapsulates
  open-dialog / fill / set-tier / submit / assert-row per page type, keyed off `property.page`.
- **Blocker capture:** each crew runs inside a try/catch that, on any login/UI failure, writes
  `e2e/results/npbs-issues/<employeeId>.json` `{ step, error, screenshot }` and rethrows so the
  case is honestly red (no silent green; §No-Illusion). Issues are the extension/fix backlog.

### 4. Skill — `~/.claude/skills/107-npbs-bids-to-portal-bids/SKILL.md`
Captures the report grammar, the mapping table, the 6 rules, the parser/spec/fixture locations,
and the run/extend workflow. Per the standing "always package work into a skill" rule.

### 5. Playbook — `docs/modules/pbs/npbs-bids-simulation-playbook.md`
How to run, regenerate the fixture, read the unmapped/issues reports, and extend to more crew,
bases, ranks, or a new month's export.

## Data flow

```
CLASS-BidsReport_March2026.txt
        │  parse-npbs-bids.mjs  (splitRecords→selectContext→splitGroups→shiftDates→mapPredicate→selectCrew)
        ▼
npbs-bids-jun2026.json  +  unmapped-report.json
        │  npbs-crew-bids-simulation.spec.ts  (login as crew → UI place each tiered property → assert row)
        ▼
Playwright result  +  e2e/results/npbs-issues/*.json (blockers for later fixing)
```

## Testing

- **Parser unit tests** (Vitest): context selection (Current beats Default), group splitting,
  tier cutoff at 7, Mar→Jun shift (incl. `2026-03-dd`), a representative predicate→property case,
  and the ≥4-property crew filter. These prove the conversion logic independently of Playwright.
- **e2e spec:** the simulation itself is the test. The **regression-registered** subset is locked to
  crew + bid-types verified green on a real run; crew that cannot log in and predicates that cannot
  map are recorded in the issues/unmapped reports and documented as the extension backlog (this keeps
  the green suite honest per §No-Illusion while still recording blockers per rule #7).
- IDs added to `docs/test-cases/e2e/README.md`; spec tagged `@regression`.

## Known risks / open blockers (to be recorded, not pre-solved)

- **Crew login feasibility:** the demo DB may not contain every Employee # as a loginable account,
  or the password may differ from `rois`. Per rule #7 this is captured as a Playwright issue; the
  green regression subset uses only crew that actually authenticate.
- **Dialog input variety:** pairing property 26+ bid input types (duration, time-range, tag-list,
  date-or-dow, etc.). The bid-workbench page-object handles the input types the selected crew
  actually use; new input types encountered when extending crew are added to the helper.
- **Coverage honesty:** any silent cap (top-N predicates, skipped pages) is logged, never hidden.

## Addendum — post-approval additions (2026-06-20)

- **Failure snapshots:** every failed step (login, page-load, or an unplaceable property) is captured
  to `image/pbs/<crewId>_<testId>_<tier>-<code>_<tag>_<timestamp>.png`, and the path is recorded in the
  crew's issue JSON (`BidWorkbenchPage.snapshotFailure`).
- **Word report:** `e2e/utils/npbs/generate-report.mjs` builds `docs/test-cases/pbs/NPBS-Bids-Simulation-Report.docx`
  (dependency-free OOXML + system `zip`) summarizing methodology, per-crew results, blocker breakdown,
  placement by property code, and the failure→snapshot table.
- **Airport multi-select:** after a separate product change (commit `6b2d75de`), airport properties
  (101/104) use a listbox dropdown; the page object selects from it (`fillAirportSelect`) instead of
  free text.

## Out of scope

- Changing any product code, bid dialog, or property catalog to accommodate NPBS predicates.
- Mapping compound multi-`If` predicates fully (primary clause only; rest logged).
- The `/tier` and `/award` pages (read-only / mock) beyond verifying placed bids surface in `/tier`.
