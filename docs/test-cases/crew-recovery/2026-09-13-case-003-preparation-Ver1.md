# Case 3 preparation — Rule 8004 crew-fleet mismatch recovery

> Internal preparation record (skill 145). Fixture state for the Case-3 recovery demo.
> No secrets. Prepared 2026-09-13 (America/Vancouver), env `f8_sit_live`, branch `main`.
> Local stack: Gantt vite `:5567`, live-server `:3000`, ai-server `:3005`, Metro `:8081`.

## 1. Objective and status

Reproduce the demo-video business flow ("Case 3.mp4"): a **Rule 8004 crew-fleet mismatch**
on a fully-rostered pairing opens the Recovery UI from three entry points and exposes the
three standard recovery methods (Roster transfer/exchange, Standby Crew callout,
Cross-base positioning).

| Item | Status |
|---|---|
| 10 ADD-base 788-qualified crew seeded | Done |
| 8004 FLEET check enabled in the Live-FD ruleset | Done |
| 788 pairing fully rostered with 4 pilots | Done |
| Both flights changed 788 → 7M8; 8004 fires for all 4 crew | Done |
| Recovery entry points (Alert Center / Pairing pane / Roster pane) | **Verified — Playwright PASS** |
| Recovery option execution (Executable / cost / Preview / Apply / Save) | **Verified — Playwright PASS** |
| 8004 fully cleared by 7M8-qualified Roster transfers (Alert Center 4 → 0) | **Verified — Playwright PASS (§9)** |

## 2. Isolation from Case 1 and Case 2

Case 1 = crew `113` / `J4002` / pairing `152056`; Case 2 (S2 ADD) = `T2001/T2021/T2022` +
standby `T2002–T2034`, pairing `152675`, flights `161242–161245`. Case 3 uses a **disjoint**
crew prefix (`L3xxx`), pairing (`152227`) and flights (`155785/155806`).

## 3. Fixture

### 3.1 Crew (skill 141)

Fixture `.agents/skills/141-crew-seed-generator/fixtures/ethiopia-add-788.json`
(`idPrefix L`, `idStart 3001`, `count 10`, `caCount 5`, base `ADD`, fleet `788`).

| crew_id | base | fleet_specific | rank |
|---|---|---|---|
| L3001–L3005 | ADD | 788 | CA |
| L3006–L3010 | ADD | 788 | FO |

`crew_fleet.fleet_specific = '788'` (the flight-facing code; `fleet` master row 788 already
existed with `fleet_grp=B787`, `ac_type=788`). No crew in the DB were qualified on `788`
before this seed.

### 3.2 Pairing and roster

* Pairing **152227** — base ADD, fleet **788**, division P, `FLY`, 1 duty / 2 segments,
  **2026-09-19** (ADD 00:15Z → 23:05Z), composition **CA ×2 + FO ×2 = 4 pilots**.
  Segments: ET452 ADD→CAI 02:15Z, ET453 CAI→ADD 07:20Z.
* Assigned via the same application function the UI uses (`rosterService.assignPairing`):
  L3001, L3002 (CA) and L3006, L3007 (FO) → 8 roster rows (4 crew × 2 segments).

**Route note:** the only ADD–MED 788 pairings (150638/150444) are dated 2026-09-01/02 —
already ended, and Recovery refuses a completed Roster (`canRecoverViolation` →
`isRosterCompleted`). All *future* ADD–MED pairings are 7M8. Case 3 therefore uses the
closest future 788 ADD turn (ADD–CAI–ADD) instead of ADD–MED. Only the route label differs;
the business flow and options are identical.

### 3.3 Fleet change (the demo trigger)

Both flights changed 788 → **7M8** via `flightService.update` (which propagates
`fleet → pairing_segment.fleet_seg`, the field 8004 reads first):

| flt_id | flt_num | flight.fleet | pairing_segment.fleet_seg |
|---|---|---|---|
| 155785 | ET452 | 7M8 | 7M8 |
| 155806 | ET453 | 7M8 | 7M8 |

### 3.4 Rule parameter

In `f8_sit_live` all three 8004 instances had **FLEET Enable Check = N** (only BASE = Y), so
the fleet mismatch could never fire. Enabled via the Legality API (same endpoint the
Legality tab uses, which triggers a scoped live recheck):

`PATCH /api/legality/rule/22/params` with paramJson
`...["RANK","N","0","CD","FLY"],["FLEET","Y","0","CD","FLY"]`.

An ADD-wide FLEET row then gave case-2 crew **T2001** a collateral alert (rostered on 738
pairing 150406, only B787-qualified). The row is therefore scoped to
`["ADD","*","788","FLEET","Y","0","CD","FLY"]` — Base **ADD**, Fleet **788** — so only
788-qualified ADD crew are checked. After the recheck, the **only** fleet-8004 rows in the
database are the four case-3 crew; case 1 / case 2 carry none.

Rule id 22 = `8004001` (instance **8004/001**), linked to workset **103**
("PBS Solver Ruleset FD", LIVE, division P) — the ruleset the Legality tab auto-selects.

### 3.5 Resulting violations

4 persisted `rule_violation` rows (severity 1), recomputed 2026-09-13T17:05:05Z:

```
8004  L3001  152227  Row 3: Crew fleet (788) is invalid for the pairing (7M8) on 2026-09-18.
8004  L3002  152227  ... (same)
8004  L3006  152227  ... (same)
8004  L3007  152227  ... (same)
```

(Message is the current unified BASE/RANK/FLEET wording from the live-server legality path;
the video's older "Crew fleet 7M8 is not a valid qualification for the roster" string is the
pre-`5adf4a9` format.)

## 4. Recovery UI verification (real UI, Playwright)

Spec `e2e/tests/gantt/recovery-case-003.spec.ts`, config `e2e/config/case3.config.ts`.

Command:

```bash
cd e2e && GANTT_BASE_URL=http://localhost:5567 GANTT_API_URL=http://localhost:3000 \
  npx playwright test --config=config/case3.config.ts
```

Result: **PASS (1 test, 59.4 s)**.

Asserted:

1. All 10 seeded `L3xxx` crew are loaded in the Live crew store.
2. L3001/L3002/L3006/L3007 carry pairing 152227 in the roster pane.
3. **Entry 1 — Alert Center:** row `L3001/152227` has `data-recoverable="true"`; select →
   "Recovery Selected" opens the Recovery dialog.
4. **Entry 2 — Pairing pane:** row right-click → **Recovery** opens the same dialog.
5. **Entry 3 — Roster pane:** row right-click → **Recovery** opens the same dialog.
6. Each dialog shows Rule 8004 and the three method filters
   (`recovery-plan-filter-roster|standby|cross-base`).

Screenshots (inspected via OCR, since image viewing is unavailable in this session):

| Screenshot | Shows |
|---|---|
| `docs/assets/screenshots/crew-recovery/case3-roster-4-pilots-Ver1.png` | roster rows L3001/L3002/L3006/L3007 |
| `docs/assets/screenshots/crew-recovery/case3-entry1-alert-center-Ver1.png` | "Rule 8004 · ET452 · 1 Crew · 1 Roster", message, Recovery methods |
| `docs/assets/screenshots/crew-recovery/case3-entry2-pairing-pane-Ver1.png` | same dialog from the Pairing pane |
| `docs/assets/screenshots/crew-recovery/case3-entry3-roster-pane-Ver1.png` | same dialog from the Roster pane |

### 4.2 Option-level verification

Spec `e2e/tests/gantt/recovery-case-003-options.spec.ts` (same config/command):
**PASS (1 test, 40.2 s)**. One roster-transfer option driven through every boundary:

| Step | Observed |
|---|---|
| Executable / Filtered / Best cost tabs | present and switchable; `All / Executable / Filtered` counts render |
| Executable list | candidate **L3003** (CA, ADD, 788) Executable; cost **Unpriced** |
| Cost breakdown | `recovery-option-cost-dialog` opens; state is **Unpriced** (no cost-library entry for an ADD transfer in this fixture — honest, not "free") |
| Preview | in-memory "Preview mode · Before + After"; "Recovery Roster is simulated and not saved"; "Transfer to L3003" |
| Apply | draft only: "Recovery option applied to the unsaved Gantt draft. Use Save to commit it."; `draftOps` non-empty; source released / target holds the Pairing **in the draft** |
| Save | "Changes saved successfully"; `draftOps` back to 0 |

Screenshots: `case3-options-{executable,cost-breakdown,preview,applied-draft,saved}-Ver1.png`.

**Soft-fleet outcome (product decision 2026-09-12):** after Save the roster is
`L3002 / L3003 (CA) + L3006 / L3007 (FO)` on pairing 152227, and the 8004 **remains** for
L3003 ("Crew fleet (788) is invalid for the pairing (7M8)") — a 788-only candidate cannot
clear a 7M8 fleet mismatch. The fleet constraint does not block executability, so the
transfer commits and the warning persists. A fully clearing transfer needs a 7M8-qualified
candidate. (Later correction: the ADD 7M8 pool `J40xx` is **not** fully busy in this window —
`J4001`–`J4018` (CA) and `J4023`–`J4040` (FO) are free on 2026-09-19; only `J4020`–`J4022` hold a
09-19 duty. See §9 for the fully-clearing run.)

Originally not verified: 8004 clearance by a qualified replacement; cross-base / standby option
execution; crew-app notification. **8004 clearance is now verified — see §9.** Cross-base /
standby execution and crew-app notification remain unverified.

## 5. Code changes and findings

### 5.1 Gap found and fixed — Pairing pane had no 8004 recovery entry

`gantt/src/components/roster/context-menu.tsx`: `pairingRecoverySnapshot` only handled
Rule **3007** (published delay) via `hasPairingActualDelay`; the committed HEAD version had
no pairing-pane Recovery entry at all. For an 8004 fleet alert the Pairing pane therefore
offered no Recovery item, so the demo's "three entry points" requirement was not met.

Fixed by resolving a recoverable alert for the pairing first (reusing the same
`findRecoverableAlert` + `ruleViolationsMap` / `persistedViolationsMap` plumbing the Roster
right-click uses), then falling back to the published-delay branch. No new abstraction —
the existing `recovery:open` window event and `RecoveryViolationDialog` are reused.

`npx tsc --noEmit` (gantt): clean except the pre-existing
`service-status-pill.tsx` 104/115/116 errors.

### 5.2 Pre-existing stale tests (not caused by this prep)

* `live-server` `npm run test:8004-regression` → **1 fail**: the mock source supplies
  `fleetSegments`/`fleetQuals`, but the current `rule8004` core reads
  `competencyFlights`/`competencyQuals`, and the expected message still uses the old wording.
  It is a pure unit test (no DB, imports the HEAD core) — fails identically with and without
  `SKIP_RUST_BINS=true`. Needs updating to the current core contract.
* `gantt` `recovery-trigger.test.ts` → **1 fail** ("ignores rules that are not Recovery entry
  points" still expects 3007 to be ignored). This is the **uncommitted 3007/FDP-discretion
  work** in the worktree; it is unrelated to Case 3.

## 6. Reset / replay

Replay instructions (scripts under `.local/case3/`):

* Re-seed crew (idempotent): `seed-crew.mjs fixtures/ethiopia-add-788.json`.
* Re-assign pairing: `assign-pairing.cjs` (pairing 152227, 4 crew).
* Re-apply the trigger: `change-fleet.cjs` (flights → 7M8 + scoped 8004 recheck).
* After an Apply/Save option run: `reset-152227.cjs` releases any crew that took the pairing
  and re-assigns the original 4 (`rosterService.removeByPairingAndCrew` / `assignPairing`) + recheck.
* Reset the trigger: `revert-150638.cjs` is the 150638 variant; for 152227 set the flights
  back to 788 and de-assign with `rosterService.removeByPairingAndCrew`.

Preserve: the 8004 FLEET `Enable Check=Y` param (the case precondition). Case 1 and Case 2
data were not modified; pairing 150638 (first, past-dated attempt) was fully reverted
(flights back to 788, crew de-assigned, stale 8004 rows cleared).

## 7. Online Help delivery (Case study 3)

Published as a Help Case Study alongside Case 1 and Case 2 (skill 003):

| Artifact | Location |
|---|---|
| Topic body | `gantt/src/components/help/topics/recovery/recovery-case-003.tsx` |
| Registry | `gantt/src/components/help/help-data.ts` (after `recovery-case-002`), `stepCount: 10` |
| Lazy import | `gantt/src/components/help/help-view.tsx` |
| Screenshots (6) | `gantt/public/help/screenshots/s3-{entry-alert-center,entry-pairing-pane,entry-roster-pane}-Ver1.png`, `s3-options-executable-Ver2.png`, `s3-options-cost-breakdown-Ver1.png`, `s3-options-preview-Ver1.png` |
| Content test | `e2e/tests/gantt/help/help-recovery.spec.ts` — image count 6 + text assertions + search keywords |
| Version | `FRONTEND_VERSION` 450 → 451 → **452** (the cost article revision) |

Content covers: the incident (pairing 152227, ET452/ET453 changed 788 → 7M8), the crew and the
ADD/788 scoping, the three entry points, the three recovery methods, the
Executable/Filtered/Best-cost tiers, the library-priced transfer cost breakdown (with Unpriced
kept as the state for contexts that have no tariff), the soft-fleet warning, and the
Preview → Apply (draft) → Save boundaries. It is published as **Partial** because a 788-only
replacement does not clear the 8004 and the Standby / Cross-base options were not executed.

Receipts: full Help suite **75 passed (1.1 m)**
(`npx playwright test -c config/playwright.config.ts --project=gantt tests/gantt/help/ --reporter=list --no-deps`
with `GANTT_BASE_URL=http://localhost:5567`); the run also captures
`docs/assets/screenshots/gantt/help-recovery-recovery-case-003-Ver1.png`.

Notes / limitations:
* Help topics were screenshotted from the real Playwright UI runs above, not the
  `capture-help-screenshots.ts` harness; total added PNG weight ≈ 1.1 MB (5 images, comparable to
  Case 2's 4 × ≈1.0 MB).
* Screenshots were inspected by OCR, not by eye (image viewing is unavailable in this session).
* `scripts/check-help-menu-coverage.mjs` and `scripts/check-legality-help-coverage.mjs` each report
  one **pre-existing** gap unrelated to this change (System → Interface page; rule 7509
  Avoid Co-pairing). No topics were invented to silence them.

## 8. Transfer cost pricing — library-priced recovery options (read-only verification)

**Problem.** Every roster-transfer option in the Case 3 dialog showed **Unpriced**, so the
planner saw no cost at all for the case's primary recovery method. Two causes: the front end
sent no `transferContext` (so the route fell through to a component build that had no tariff
for an ADD transfer), and `calculate-cost/batch` was capped at 128 inputs, so a Live roster's
larger option list 400'd and marked every candidate Unpriced.

**Change.**
* `live-server/src/services/recovery/transfer-gh-cost.ts` (new) — GH-only estimate: the receiving
  crew's incremental guaranteed-hours pay plus the source crew's released-duty saving, priced
  through the Cost Library `guarantee` calculator. It throws, and the route reports
  `Calculation unavailable: …`, for cross-base / cross-role / multi-rank / non-pilot contexts, a
  target already assigned to the pairing, a non-ADD-based target, or a pairing that spans months.
* `live-server/src/routes/recovery/recovery-cost.ts` — `transferContext` added to the schema;
  `priceComponents()` extracted; the `transfer` branch sums the configured roster-change
  components with the transfer GH rows.
* `gantt/src/services/recovery-candidates.ts` — `optionToLibraryCostInput` emits
  `transferContext` for `mode: 'transfer'`.
* `gantt/src/services/recovery-api.ts` — `chunkRecoveryCostInputs` splits the batch to 128 so the
  whole option list prices instead of 400-ing.
* Cost library components used: `1009` Roster transfer base (150) + `1015` Roster change penalty
  (260) = **US$410.00**, plus `1016` follow-on impact (1800) when follow-ons exist.

**Unit tests (PASS).**
* `live-server`: `npx vitest run src/services/recovery/transfer-gh-cost.test.ts src/services/recovery/swap-gh-cost.test.ts` → **33 passed**.
* `gantt`: `npx vitest run src/services/__tests__/recovery-swap-gh.test.ts` → **4 passed**
  (includes the transfer-context mapping).

**Real-UI read-only verification (PASS).**
`e2e/tests/gantt/recovery-case-003-costs.spec.ts` — opens Recovery on pairing 152227 / source
L3001 and reads the option costs, with **no Apply / Save** (asserts `draftOps === 0`).

```
cd e2e && GANTT_BASE_URL=http://localhost:5567 GANTT_API_URL=http://localhost:3000 \
  npx playwright test --config=config/case3.config.ts tests/gantt/recovery-case-003-costs.spec.ts --reporter=list
→ 1 passed (45.5s)
```

Observed: **35** transfer quotes, **25** under-GH at **US$410.00**, **10** over-GH
(US$430.00 / 450.00 / 540.00 / 800.00 / 810.00 / 880.00 / 1,235.00 / 1,415.00 / 1,460.00 /
1,547.50). Cost-breakdown dialog: **4 priced rules**, PRICED TOTAL US$410.00. Over-GH example
J4002: `+US$20.00` incremental GH pay on top of the US$410.00 base → US$430.00. Non-ADD-based
candidates (e.g. 1347, 1581) correctly report
`Calculation unavailable: Transfer GH pricing requires the receiving crew to be based at the pairing base`.

Evidence: `docs/assets/screenshots/crew-recovery/case3-options-executable-Ver2.png`,
`case3-options-cost-breakdown-Ver2.png`, `case3-options-cost-breakdown-over-gh-Ver2.png`
(visually inspected — the Executable list shows BEST COST US$410.00 and the breakdown dialog
shows the four priced rules).

**Stale Help corrected.** `recovery-case-003.tsx` previously said the ADD transfer cost was
"Unpriced because no cost-library entry exists" — no longer true. The article now documents the
priced breakdown and points at the new `s3-options-executable-Ver2.png` /
`s3-options-cost-breakdown-Ver1.png` captures; `FRONTEND_VERSION` 451 → **452**.

**Data side-effect (SIT).** `crew_manday_fd_daily` September-2026 credit was recomputed for the
L3/T2/J4 candidate pool (`.local/case3/recompute-pool.ts`) so receiving crews have a saved credit
baseline; crews with no saved rows are priced from a documented 0h baseline.

## 9. The 8004 is fully cleared — 7M8-qualified Roster transfers (write run)

**Closes the §4 gap.** The last open item was "not verified: 8004 clearance by a qualified
replacement". This run executes the clearing transfers on the real Live UI and proves the Alert
Center **8004 count goes 4 → 0** with no new 8004 on the incoming crew.

**Key correction to the earlier guess.** The ADD 7M8 pool is **not** busy across 2026-09-17..21.
`J4001`–`J4018` (CA) and `J4023`–`J4040` (FO) have no duty overlapping the 152227 window
(2026-09-19 00:15–11:20Z); only `J4020` (CA) / `J4021`,`J4022` (FO) hold a 09-19 duty row. The
Recovery **Executable** list therefore already offered 7M8-qualified transfers (`J4003`, `J4004`,
`J4005`, `J4009`, `J4011`, `J4014`, `J4015`, `J4019` at US$410.00 with **no fleet warning**), while
788-only candidates (`L3003`–`L3005`, `T20xx`) carried
`Fleet mismatch: Target Crew … is not qualified for aircraft type 7M8`.

**Test.** `e2e/tests/gantt/recovery-case-003-clear.spec.ts` (new; matched by
`e2e/config/case3.config.ts` `-clear`). For each of the four 788 crew it opens Recovery on the
Roster context menu, filters the Roster plan to **Executable**, asserts the chosen **7M8** target
row carries **no** `Fleet mismatch`, ticks it, **Apply**s to the draft and **Save**s, then reads the
Alert Center 8004 rows back and asserts the count stepped down 4 → 3 → 2 → 1 → 0.

```
cd e2e && GANTT_BASE_URL=http://localhost:5567 GANTT_API_URL=http://localhost:3000 \
  npx playwright test --config=config/case3.config.ts tests/gantt/recovery-case-003-clear.spec.ts --reporter=list
→ 1 passed (2.7m)
```

Steps executed (source 788 → target 7M8, seat):

| # | Transfer | After step: remaining 8004 crew |
|---|---|---|
| 1 | L3001 → **J4003** (CA) | L3002, L3006, L3007 |
| 2 | L3002 → **J4005** (CA) | L3006, L3007 |
| 3 | L3006 → **J4024** (FO) | L3007 |
| 4 | L3007 → **J4025** (FO) | *(none — 8004 = 0)* |

Final pairing 152227 crew: **J4003, J4005 (CA) + J4024, J4025 (FO)** — all 7M8-qualified.

**Independent DB confirmation** (`f8_sit_live`): `rule_violation_2026_09` has **0** rows with
`rule_code='8004'` and `pairing_id=152227`; **0** 8004 rows for the incoming crew; the four active
roster rows are J4003/J4005/J4024/J4025.

**Evidence (real-UI screenshots, visually inspected):**

| File (under `docs/assets/screenshots/crew-recovery/`) | Shows |
|---|---|
| `case3-clear-baseline-alert-center-Ver1.png` | Alert Center grouped by Rule: `8004/001` present with **4** rows (L3001/L3002/L3006/L3007). |
| `case3-clear-option-7m8-Ver1.png` | Recovery Executable list: `Transfer to J4003` at US$410.00 with no warning, next to the L3003 `Fleet mismatch` warning. |
| `case3-clear-final-alert-center-Ver1.png` | Same view after the four saves: **no 8004 group and no 8004 row**; RULE count 61 → 57. |
| `case3-clear-final-roster-Ver1.png` | Roster scrolled to J4003 holding pairing 152227. |

**Help updated.** `recovery-case-003.tsx` no longer says "a fully clearing replacement is not yet
demonstrated"; Step 10 documents the four transfers and the 8004 → 0 outcome, with the new
`s3-clear-before/after-alert-center-Ver1.png` captures (topic image count 6 → 8).
`help-data.ts` overview corrected. `FRONTEND_VERSION` 452 → **453**.

**Fixture restored.** After the run, `.local/case3/reset-152227.cjs` (run via
`live-server/node_modules/.bin/tsx`) released the four 7M8 crew, re-assigned
`L3001/L3002/L3006/L3007`, and rechecked 8004 → the prepared baseline (4 × 8004) is intact.

**Still not verified (unchanged).** Standby Crew callout and Cross-base positioning execution for
this case; crew-app notification delivery.

## 10. Ryan feedback 2026-09-13 — fleet match is mandatory; cost variety

Two items raised after reviewing the Case-3 Recovery dialog.

### 10.1 DONE — drop crew who are not fleet-qualified (fleet matching is a must)

> *"when scroll down, some crew had no fleet, that mean they are not usable, what is the point to
> list them here? remove them. for this case, fleet matching is a must"*

Supersedes the 2026-09-12 soft-fleet decision **for the fleet-qualification trigger only**.

* `gantt/src/services/recovery-candidates.ts` — new `fleetHardBlocked(crew)` = `trigger ===
  'roster-qualification' && requiredFleets.some(f => !qualifiesForFleet(crew, f))`. An unqualified
  candidate is now **omitted** from the Roster plan (transfer, swap) and from the Standby list
  instead of being offered with a `Fleet mismatch` warning. Every other trigger keeps aircraft type
  soft.
* **Swap return direction (was missed on the first pass).** A swap is two-way: the releasing crew
  receives the candidate's Pairing. For an 8004 that Pairing is another 7M8 duty, so the 788 source
  crew simply carries the mismatch across and the row still warned
  `Fleet mismatch (8004) … on 2026-09-20`. A swap is now dropped too when
  `trigger === 'roster-qualification'` and the source crew is not qualified for the candidate
  Pairing's fleet — a fleet swap needs **both** directions to be valid. Net effect on Case 3: the
  Roster plan contains **transfers only** (18 options); every swap row is gone.
* Unit tests flipped to the new contract in `gantt/src/services/__tests__/recovery-candidates.test.ts`
  (`does not treat a partial fleet code as a qualification (8004 fleet is a hard filter)`,
  `drops a receiving Crew who does not hold every loaded flight fleet on an 8004 recovery`,
  `drops a swap whose return pairing would leave the source crew on an unqualified fleet (8004)`).

**Verified.** `cd gantt && npx vitest run src/services/__tests__/recovery-candidates.test.ts
src/services/__tests__/recovery-swap-gh.test.ts` → **30 passed**. Real-UI read-only cost run:
transfer candidates **36 → 18** (only 7M8-qualified crew; the L3003/L3004/L3005 and T20xx
fleet-mismatch rows are gone) and **non-transfer (swap) quotes `[]`** — no unresolved-8004 rows.
Full clear re-run still PASS: **1 passed (28.3s)**, 8004 4 → 0.

Help updated: `recovery-case-003.tsx` now says fleet matching is **mandatory** / unqualified crew
are **not listed**; new capture `s3-options-executable-Ver3.png`; `help-data.ts` overview corrected;
Help content spec updated. Help suite **75 passed**. `FRONTEND_VERSION` 453 → **455** (455 because a
concurrent Case-2 Help change had already taken 454).

### 10.2 OPEN — design a wider cost spread (needs a business call)

> *"need to design different cost, by adjust these crew roster, make some of them get over GH pay,
> it would highlight the cost saving for airlines, lowest cost crew ranks higher"*

Mechanics (measured): the transfer quote = US$410.00 configured roster-change components
(1009 + 1015) **+ the receiving crew's incremental GH pay**. Incremental pay is 0 while the crew
stays under the Cost-Library guarantee (`cost_type 1002` / instance 1 / `guarantee`: **85 h** at
US$100/h, ×1.2 to 90 h then ×1.5). Adding the 152227 duty (7:35) crosses 85 h only when the crew's
saved September credit is already **> 77:25**.

Current Executable ladder (CA source L3001, after 10.1) — 18 candidates, cheapest first:

| Saved Sept credit | Crew | Transfer quote |
|---|---|---|
| ≈08:00–48:30 | J4003, J4004, J4005, J4009, J4011, J4014, J4015, J4019 | **US$410.00** (under GH; ranked first) |
| 77:36–94:12 | J4002, J4006, J4018, J4016, J4001, J4017, J4007, J4010, J4013, J4008 | US$430.00 → **US$1,547.50** (over GH) |

So a cost ladder already exists (cheapest ranked first, up to US$1,137.50 saved vs the dearest), but
the cheapest **eight** rows are all US$410.00 because those crew are all well under GH. Making the
*top* of the list vary needs the cheap band to shrink, which is a fixture-design choice:

* **Option A (recommended)** — accept the ladder as-is. No data change; the saving is already
  demonstrable (US$410.00 vs US$1,547.50). Optionally nudge J4004 (7:35 short of the floor) over GH
  with one small extra duty so a second low price appears.
* **Option B** — rebalance the cheap band: assign extra September 7M8 flying to the under-GH
  candidates so they cross 85 h. Blocked/expensive: J4011/J4014/J4015 are Case-1 crew (their credit
  feeds Case-1 GH numbers) and J4004/J4009/J4019 appear in the one-time batch-assign spec; the
  others need ~30–70 h of extra flying each.
* **Option C** — lower the demo guarantee in the Cost Library (85 h → e.g. 60 h) so more candidates
  land over GH. Cheapest to implement but changes Case-1/Case-2 GH quotes and their Help/specs.
