# Crew App Duty Analyzer — On-device FDP / DP / Rest

Status: IMPLEMENTATION DESIGN — 2026-10-21

## Goal

Add `Analyzer` to Home › Quick actions. The signed-in crew member can inspect the FDP, duty-period (DP), block and rest values published with their own TG/PR roster, clone a duty into a non-destructive what-if, create a new hypothetical duty, and save scenarios locally for later review.

The implementation blends the interaction ideas from the standalone `onblock.html#iphone` mockup into the existing Crew App. It does not copy the mockup's tab shell, colors, or hard-coded sample calculations.

## Product modes

1. **My roster**
   - Render each signed-in crew `Trip` as one dated pairing/rotation card; the pairing date comes from its check-in date without device-time-zone shifting.
   - Group the pairing's legs into nested duties. A multi-duty rotation such as MNL–YVR–MNL remains one pairing with outbound and inbound duty rows.
   - Show the portal-published FDP, DP, block and rest values exactly as captured for each duty.
   - Leave a roster metric value blank when the portal pull has not supplied it; never label it as zero or as a calculated portal value. What-if may derive an advisory value locally without changing the roster card's provenance.
   - Offer `What-if` for each flight duty inside the pairing.

2. **What-if**
   - Clone the selected duty, every flight segment, and its portal metrics. Never mutate Redux roster data.
   - Render the duty in operational order: duty report first, then numbered flight segments. Report time is a duty-level event, not part of segment 1.
   - Every segment departure and arrival is freely editable with a touch-friendly exact-time field plus 5-minute earlier/later controls. The editable value is the event airport's local wall clock; its label includes the airport code, and the supporting line shows both `Local HH:mm` and `UTC HH:mm`.
   - UTC remains the canonical stored instant. Any local edit immediately recalculates and displays UTC, and every linked/UTC instant change immediately regenerates local time using the airport's IANA time zone for that exact date, including daylight-saving transitions. A missing airport time zone or non-existent DST wall time blocks the edit instead of silently assuming UTC.
   - Report time is frozen by default. Crew may unfreeze it, enter any time, or use the same 5-minute controls.
   - Selecting a flight reveals contextual actions; no exception controls occupy the default screen. The actions are `Move linked times`, `Divert & add recovery`, and `Cancel selection`.
   - Linked movement accepts any minute amount and moves either the selected segment, the selected segment plus following segments, or the whole duty. Report time remains separate.
   - Diversion changes the selected segment from `A → planned B` to `A → divert C`, then inserts a local recovery segment `C → planned B` immediately afterward. The divert arrival and recovery departure/arrival remain editable. Reopening the action updates the recovery segment instead of duplicating it.
   - Recalculate FDP, DP, Block, following Rest, limits, and margins from the edited timeline. Portal values and the source roster remain unchanged.
   - Show baseline and simulated values together. An exceeded metric uses a warning icon plus red text/badge; non-exceeded metrics retain the normal carrier treatment.

3. **New duty**
   - Collect the facts needed by the bundled rules: report and release times, reference-time offset, sectors, crew composition, acclimatisation state, rest facility for augmented crew, home-base/away rest, previous release or rest-before, next report or rest-after, split-duty break, and operator-discretion use.
   - Recalculate immediately as fields change. Invalid or incomplete inputs produce a specific `Needs input` result, never a guessed conclusion.

4. **Saved scenarios**
   - Save, reopen, update, and delete what-if/new-duty scenarios in AsyncStorage.
   - Storage is keyed by `airline:crewId`; PR and TG data cannot mix.
   - Persist normalized inputs, source-duty snapshot, result, rule-pack version and timestamp. Do not persist portal credentials, cookies, tokens, or raw portal payloads.

## Rule provenance and scope

The engine is a pure TypeScript module and has no remote-rule-engine dependency.

The versioned local rule pack is configuration, separate from the evaluator:

- EASA 7005 / ORO.FTL.205: maximum FDP for acclimatised Basic, 3P and 4P flight-deck duties by reference-time band, sector count and rest facility.
- EASA 7010: maximum FDP when acclimatisation is unknown.
- EASA 7026 / ORO.FTL.235(a)(1): minimum rest is the greater of the applicable fixed floor and the preceding DP (home-base 12:00; away-base rows are selected by time-zone difference).
- EASA split duty: up to 50% of the qualifying break is added to the applicable FDP limit, matching the source implementation.
- CrewRules 6007: the internal 2P implementation table for FDP, DP and FT limits by report band/preceding ODP and landings.
- CrewRules 6008: the internal flight-deck commander-discretion ceilings (FDP +2:00 and FT +0:30 in the recovered instance). Normal and discretion limits remain separate in the calculation.

The Crew App presents one EASA analysis path. CrewRules IDs 6007/6008 are implementation details: they are not a selectable scheme and do not appear in crew-facing labels, result provenance, or explanations.

Unsupported combinations return `Needs review` with the missing rule family/modifier. In particular, the app must not silently apply flight-deck values to cabin crew or invent a standby adjustment. A saved scenario preserves that unresolved status.

## Evaluation contract

Inputs and outputs are minutes and UTC instants internally. Roster What-if local wall-clock entry is converted through the event airport's IANA time zone at the event date; no device-time-zone inference is allowed. Repeated fall-back wall times resolve to the valid instant nearest the pre-edit instant, while non-existent spring-forward times are rejected.

For a delayed roster duty:

```text
simulated FDP = published FDP + final-leg delay
simulated DP  = published DP  + final-leg delay
simulated release = original report + simulated DP
simulated rest after = next duty report - simulated release
```

If a required published value or next report is absent, only the affected metric is `Not evaluated`; other metrics remain available.

For new duties:

```text
FDP = release - report
DP  = duty end - duty start (same endpoints in the initial new-duty flow)
rest = next report - release, or explicit rest duration
minimum rest = max(DP, applicable 7026 floor)
```

Boundary comparisons are inclusive at the limit. A value above the limit is exceeded. A result within 30 minutes of a limit is `Tight`; otherwise it is `Within limit`. Status always includes an icon/word and never depends on color alone.

## UI and responsive behavior

- Replace the placeholder `More` Home tile with `Analyzer`, preserving the six-tile row.
- Use one pushed `DutyAnalyzer` route with local mode state: `Roster`, `New duty`, `Saved`.
- The approved interaction and information-layout contract is `docs/assets/mockups/crew-app/duty-analyzer-what-if-mockup-Ver1.html`. Production mirrors its sequence, labels, touch targets, contextual actions, diversion flow, baseline comparisons, and exceeded warning behavior.
- Adapt only where required by the existing Crew App system: use carrier palette tokens, shared outline icons, `PageShell`, `AppDialog`, native scrolling/safe areas, and established compact/tall/wide geometry.
- Compact/Air and tall/Duo portrait use the mockup's one-column order: duty timeline, contextual flight actions when opened, crew composition, live result, change log, and save controls.
- Wide/Duo inner landscape and iPad use a two-pane flight-desk layout: timeline/actions on the left and sticky-equivalent live result/change log/save controls on the right. Do not simply enlarge the compact column.
- Result metrics include FDP, DP, Rest, and Block with baseline values and margins. Every duration is shown as `HH:MM`; primary metric values render `HH` at the established headline size and `:MM` two typography steps smaller. Status always includes an icon and text. Exceeded metrics alone use the semantic danger treatment.
- The result explanation includes a shared outline book action that opens an in-app `FDP Reference` page. Its first section traces the configured airline lookup as report airport-local time → reporting range → landing count → maximum FDP. The same operative lookup powers evaluation and highlights the matching row, landing column and intersection cell in the displayed airline table, preventing UI/calculation drift. A separate comparison card shows the literal `ORO.FTL.205(b)(1), Table 2` baseline by official reporting range and sector column; the page must never label the configured airline table itself as the official EASA table. It identifies the Easy Access Rules for Air Operations revision and states that the airline operations manual and approved flight-time specification scheme remain authoritative.
- Every Analyzer surface uses the carrier palette's readable foreground for its own surface. Accent and status colors remain on outlines, glyphs, selected fills and warnings rather than low-contrast secondary text.
- Saving confirms through the standard `AppDialog`. Deletion is also confirmed.
- A persistent note states that simulations are advisory, remain local, and do not amend the airline roster.

## Affected files

- `crew-app/src/features/dutyAnalyzer/` — types, rule pack, evaluator, roster adapter, owner-keyed storage, screen.
- `crew-app/src/features/v2/HomeScreen.tsx` — Quick Action replacement.
- `crew-app/src/features/v2/nav.ts`, `V2Navigator.tsx` — typed route.
- `crew-app/src/version.ts` — one increment from the current working-tree value.
- Focused Jest and native UI automation under the existing Crew App test locations.

No server, database, schema, portal-capture, duty-swap, or remote rule-engine change is required.

## Verification

Pure-engine Jest coverage:

- Every report-time band and sector boundary for the bundled EASA/6007 tables.
- Acclimatised vs unknown state.
- Basic vs augmented composition/rest facility.
- Split-duty extension and commander discretion calculated separately, without exposing internal rule IDs.
- Rest floor versus DP, exact-boundary pass, one-minute fail.
- Delayed final leg updates FDP, DP and next rest while preserving the portal baseline.
- Missing fields and unsupported standby/cabin combinations return explicit non-conclusive results.

Feature Jest coverage:

- Home Quick Action opens Analyzer.
- TG/PR roster renders dated pairing cards; multi-duty pairings stay grouped while preserving each duty's portal metrics and action.
- TG/PR portal metrics render without invented zeroes.
- What-if clone/edit/save/reopen/delete.
- Owner-keyed persistence and account isolation.
- New-duty live evaluation and validation.
- Six reference viewports: 420×912, 912×420, 669×951, 951×669, 834×1210 and 1210×834.

Real UI:

- Air first, then Duo outer/inner, then iPad, with TG and PR accounts.
- Capture and inspect versioned screenshots from the same automation run.
- Run focused Jest, `npx tsc --noEmit`, root `npm run check:ui`, and `git diff --check`.
