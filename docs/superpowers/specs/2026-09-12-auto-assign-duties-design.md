# Auto-assign Duties — design (grill-me interview output)

Date: 2026-09-12 · Author: Ryan + Claude · Scope: Live gantt only · Status: design approved through Q&A, implementation pending

Supersedes the single-purpose "Auto-assign open pairings" flow (skill note `.agents/skills/144-auto-assign-base-crew/SKILL.md`). The brain + hands architecture, the greedy legality-aware packer, and the Rust `previewDraftLegality` gate are kept; this spec extends the scope from flight pairings to duty types (FLY, RES, DO, ...) with a per-type configuration.

Method note: the `grill-me` skill (mattpocock-skills marketplace) is not installed on this machine; the interview was run by hand with the same one-decision-per-question discipline. Decisions below are Ryan's answers; items marked **Assumed** were not answered and use the recommended default.

## 1. Product goal

Given selected crew (roster context menu → **Auto-assign Duties**), fill each crew's roster across a date range with open duties of several types, honouring per-type limits, and show the planned outcome for review before replaying it as real gantt assign operations. Dispatcher presses Save to persist.

## 2. Decisions from the interview

| # | Question | Decision |
|---|---|---|
| 1 | FLY "weekly max 4 − RES" semantics | **FLY-only cap.** FLY ≤ max per window regardless of RES. RES has its own min/max row. |
| 2 | RES candidate matching (ADD RES pairings carry fleet `737`, crew J4020 is `7M8`) | **Base + division only** for RES. FLY keeps base + fleet matching. No data fix. |
| 3 | Fill order per crew | **FLY first, then RES, then DO into leftover free days.** |
| 4 | Post-configuration analysis | **Review step, then Apply.** Configure → Analyse → review table + trace → Apply to gantt → Save. Unmet minima are warnings, never blockers. |
| 5 | Window definition | **Rolling 7-day windows** ("every 7 days"), not calendar weeks. |
| 6 | Existing roster duties | **Count them.** Existing FLY/RES/DO rows in range seed the window/period counters. |
| 7 | Duty-type dropdown | **assignment_group level** (FLY, RES, GRD/LVE-style groups). Call type inside a group (PRAM vs PRPM) is chosen by the planner. |
| 8 | Scope | **Live gantt only.** Planner API stays source-neutral for a later Scenario adapter (§Gantt-Unify). |
| 9 | Rolling "min" meaning | **Max-gap rule.** Min N over 7 days ⇒ every 7 consecutive days fully inside the range contain ≥ N of that duty (Min 1 ⇒ never more than 6 days between two occurrences). Column names must not say "Weekly". |
| 10 | DO day choice | **Assumed:** latest free day that still satisfies the max-gap rule, so earlier days stay open for flying. |
| 11 | J4020 test RES row | **Assumed:** keep RES row (Min 1 / Period Max 2) so the run proves all three types. |

## 3. UI

### 3.1 Menu rename
Roster context-menu item `Auto-assign open pairings` → **Auto-assign Duties**. Dialog title `Auto-assign duties — <range>`. Update `data-testid`s only where the label is asserted; keep `auto-assign-*` ids.

### 3.2 Dialog (AppDialog, Wand2 icon) — phase `configure`
New first phase before the existing `planning` phase.

**Date range**: two date inputs, default = the `roster_period` row containing the viewport month (`resolveViewportMonthBounds()` → look up RP via `GET /api/base/roster-period`); fall back to the calendar month when no RP covers it. Range drives pool sizes live.

**Duty types table** (columns renamed per decision 9):

| # | Duty group | Period Max | Every 7 Days Min | Every 7 Days Max | Pool Size |
|---|---|---|---|---|---|
| 1 | FLY | — | 1 | 4 | n open (base+fleet) |
| 2 | RES | 2 | 1 | — | n open (base+division) |
| 3 | DO | 8 | 1 | 2 | — (no pairing pool) |

- Blank = no limit. Inputs are small numeric fields, `text-xs font-mono tabular-nums`.
- **Add duty type**: dropdown of `assignment_group` codes not already in the table (loaded from the dictionary/assignment-group API, not hard-coded). Row delete icon.
- Pool Size is read-only, recomputed when range changes: count of open pairings in range whose `assignment_group` = row group, with the group's matching rule (FLY: base+fleet; RES: base+division; other pairing-backed groups: base+fleet). Ground-only groups show "—". A group is "pairing-backed" when any open pairing with that `assignment_group` exists in range; otherwise it is treated as a ground task. With multiple crew, Pool Size shows the union count.
- Footer: Cancel · **Analyse**.

### 3.3 Phase `planned` (review)
Existing trace list stays. Add above it a **per-crew outcome table**: one row per duty type with `assigned / existing / period max` and the worst rolling-window status (`ok`, `min unmet in N windows`, `max hit`). Windows that miss a min are listed under the row as warning chips (`Sep 08–14: 0 FLY`). Footer: Cancel · **Apply to gantt (n)**. Apply is enabled whenever n > 0.

### 3.4 Phase `applying` / `done`
Unchanged replay driver, extended so a DO step dispatches the `add-ground-task` draft op instead of `assign-pairing`.

## 4. Backend — `POST /api/roster/auto-assign/plan` (extended, backward compatible)

Request adds:

```ts
dutyTypes?: Array<{
  group: string            // assignment_group code, e.g. 'FLY' | 'RES' | 'DO'
  periodMax?: number | null
  every7Min?: number | null
  every7Max?: number | null
}>
```
Omitted `dutyTypes` ⇒ legacy behaviour (`[{ group: 'FLY' }]`), so existing callers (R'Bot `auto_assign_pairings`, best-fit, J4001–J4007 specs) are unaffected.

Response adds per crew:

```ts
outcome: Array<{
  group: string
  existing: number; assigned: number; periodMax: number | null
  windows: Array<{ start: string; end: string; count: number; minUnmet: boolean; maxHit: boolean }>
}>
```
Steps gain `group` on `consider | skip | assign` and a new step kind `assign-ground` `{ group, assignment, startDtUtc, endDtUtc, base }`.

### 4.1 Algorithm per crew (display order)
1. Resolve base, fleets, division (existing). Load existing roster rows in range grouped by `assignment_group` (FLY via `pairing_id IS NOT NULL`; RES/DO/ground via `roster_flight.assignment` → `assignment_group_map`, many-to-many — take the row's primary group per skill 131).
2. Build a day grid in **crew-base local time** (base tz from `airport` table; ADD = UTC+3). Mark occupied days from existing duties.
3. Counters: `periodCount[group]`, and a function `windowCount(group, dayIdx)` over the rolling 7-day window ending/starting at that day.
4. **FLY pass**: existing even-distribution packer, with two extra skip reasons `period-max` and `every7-max` (checked on every 7-day window the candidate touches, using duty days not pairing count when the pairing spans days). Then the legality preview + backtrack-trim as today.
5. **RES pass**: candidates = open pairings `assignment_group='RES'`, same base, same division, in range, ignoring fleet. Pick to satisfy `every7Min` on windows that miss it (earliest unmet window first, candidate that also respects `every7Max` and `periodMax` and does not overlap), then stop; RES never exceeds its min unless `every7Min` is null and `every7Max`/`periodMax` allow (then it fills like FLY). Preview + trim again including FLY survivors.
6. **DO pass** (and any ground-only group): walk windows; where `every7Min` unmet, place a full base-local day (`00:00–23:59:59` local → UTC) on the **latest** free day inside the window that keeps every window ≤ `every7Max` and `periodCount < periodMax`. Ground items go through the same `previewDraftLegality` (rule 1001 overlap etc.).
7. Emit `outcome` from final counters. Nothing is committed (rolled-back preview txn).

Rules the Rust engine already enforces (7305 consecutive days, 7505 GDO per RP, 8002, 1001, ...) remain the legality truth; the dialog limits are planner-side packing constraints, not new rules.

## 5. Frontend replay
`runAutoAssignReplay` handles `assign-ground` steps by calling `rosterStore.addGroundTask(paneId, { crewIds:[crew], assignment:'DO', depArp: base, arvArp: base, startDtUtc, endDtUtc })`, which stages the draft `add-ground-task` op like the manual Ground Task dialog (§Simulate-User compliant: same optimistic apply + live legality).

## 6. Files
- `gantt/src/components/roster/auto-assign-dialog.tsx` — configure phase, duty table, outcome table.
- `gantt/src/components/roster/auto-assign-duty-table.tsx` — new, table component.
- `gantt/src/services/auto-assign-api.ts` — request/response types.
- `gantt/src/utils/auto-assign-driver.ts` — ground step.
- Roster context menu (label rename) + `ui-store.ts` (no change to open/close API).
- `live-server/src/services/roster/auto-assign-service.ts` — passes above; `roster.ts` Zod schema.
- `live-server/tests/unit/auto-assign-service.test.ts` — new cases.
- `e2e/tests/gantt/auto-assign-duties-j4020.spec.ts` — new.
- Skill note 144 and in-app Help topic updated (rename).

## 7. Verification
- **Unit (Vitest)**: FLY every7-max 4 blocks the 5th FLY in any 7-day window; period max for DO; RES base+division match ignores fleet; DO placed on latest free day; existing roster seeds counters; legacy request without `dutyTypes` yields identical plan to today.
- **Playwright (real UI, `GANTT_BASE_URL=https://cr.rois.one` for Ryan's sign-off)**: open Live gantt at Sep 2026, right-click **J4020** → Auto-assign Duties; assert defaults (RP 2026-09-01→09-30, three rows, FLY pool > 0, RES pool = 42, DO "—"); set FLY min 1 / max 4, RES min 1 / period 2, DO min 1 / period 8 / max 2; Analyse; assert outcome table shows FLY ≤ 4 in every window, DO count ≥ 1 in every window and ≤ 8, RES 1–2; Apply; assert roster pane shows DO pucks on J4020 as full base-local days and FLY/RES pucks present; Save; reopen and re-assert counts (poll, per the mutation-race memory). Screenshot `docs/assets/screenshots/gantt/auto-assign-duties-Ver1.png`.
- Regression: J4001/J4002/J4006/J4007 specs still pass (legacy path).

## 8. Risks / open items
- Rolling max-gap min is strict: with sparse pools a window may stay unmet; shown as a warning, not blocked (decision 4).
- FLY pairings spanning multiple days count as duty days against `every7Max`; confirm during test that a 2-day pairing counting as 2 matches Ryan's expectation (decision 1 chose per-pairing cap for FLY; day counting applies only to window overlap detection — see §4.1 step 4; if this reads wrong, flip to per-pairing count, one-line change).
- Base tz for DO comes from the airport table; verify ADD offset exists in data before relying on it.
- `assignment_group_map` is many-to-many; a code mapped to two groups is counted under its first-listed group only.
- Rulesets: planner still validates against the default active ruleset (existing gap).

## 9. Implementation notes (2026-09-12, after build + real-UI validation)

Decisions that changed or were added while making the ADD and DXB runs pass on https://cr.rois.one:

- **Free-day reservation (new).** "FLY first, then DO into leftovers" alone produced zero DO days: four 2-day FLY pairings per 7-day window consume every day. The pairing passes now refuse a pick that would leave fewer free days in any touched window than a later ground type still needs for its Every-7-Days Min (`skip (reserve-day)` in the trace). FLY keeps priority; leftovers are guaranteed. Unit case (n).
- **Kept legality warnings (new).** Soft rules that name no planned duty and fire only once DO rows exist (7505 min days off in RP, 7508 single free day in 168h/672h) are not "fixed" by removing a day off, so the plan keeps the DO days, records them as `warnings` per crew, the review step shows "Legality warnings kept (accepted at Apply)", and the replay pre-accepts soft violations for ground steps (`autoAcceptSoft`). Hard violations still block. Unit case (o).
- **Cross-crew slot tracking (new, fixes a latent multi-crew bug).** Plans are computed crew by crew; before, two FO crew in one plan were both given the same single FO slot and the second failed at replay. The planner now carries consumed slots (`pairing_composition` plan − fill) across crew in one plan; the later crew sees `skip (no-slot) … already taken by an earlier crew in this plan`. Unit case (p).
- **FLY row pool = FLY + FLT.** Both assignment groups are "Flight Duties" in F8 data; the legacy un-grouped pool included both, so the FLY row matches the family (parity proven by J4007 even-distribution spec).
- **RES catalogue.** `RES` has no `assignment_group` master row; the duty-groups endpoint unions groups present on open pairings.
- **Replay failures are visible.** The dialog lists steps skipped on replay with the reason; the e2e asserts that list is empty.
- **Legacy specs.** J4001/J4002/J4006/J4007 now configure FLY-only with no limits before Analyse (legacy shape) and reset the crew's September first; R'Bot spec waits longer for the three-pass plan.
- **Environment traps hit today** (not code): `rule-engine-rs/target` was a self-referential symlink (all sync roster mutations 500) and `e2e/node_modules/@playwright` was a symlink into a subagent sandbox. Both fixed; see memory `env-traps-ruletool-symlink-and-e2e-playwright`.

Validation receipts: `e2e/tests/gantt/auto-assign-duties.spec.ts` (ADD J4020/J4021/J4022 PASS, DXB K1001/K1002/K1003 PASS), legacy J4001/J4002/J4006/J4007/R'Bot PASS (workers=1), Vitest 16/16, `npm run check:ui` PASS. Screenshots: `docs/assets/screenshots/gantt/auto-assign-duties-{add,dxb}-{configure,analyse,applied}-Ver1.png`.
