# Crew App New Duty Optimization

Status: IMPLEMENTATION DESIGN — 2026-10-21

## Goal

Turn Home › Quick actions › Analyzer › New duty from a web-style rule form into a fast iOS duty calculator. The crew member starts from the current local reporting time, supplies only operational facts, and receives an immediate EASA FDP projection.

## New-duty input contract

- Reporting time defaults to the device's current local `HH:MM` when Analyzer is opened.
- Latest chock-on is an optional local `HH:MM` field and starts empty.
- The editable operational facts are sectors, crew composition, augmented-crew rest facility, and home/away base. Block, Rest, and split break are not collected in New duty; roster What-if retains its published/derived Block and Rest metrics.
- New Duty Rest is a calculated required-rest KPI derived from DP: home base uses `max(DP, 12h)`; away base uses the existing applicable DP/floor rule. It is not evaluated against a user-entered actual-rest value.
- Acclimatisation, crew category, prior off-duty period, time-zone difference, commander discretion, manual FDP, and manual DP are not shown in the New duty flow. The initial optimized flow evaluates an acclimatised flight-deck duty without discretion; roster What-if keeps its existing rule controls.
- Basic composition does not require a rest-facility selection. Three- and four-pilot compositions default to Class 2 and expose Classes 1–3.

## Timing calculation

When latest chock-on is empty:

```text
maximum FDP = selected EASA/operator table limit + qualifying split-duty extension
latest legal chock-on = reporting time + maximum FDP
actual FDP = unavailable
actual DP = unavailable
```

When latest chock-on is a valid clock:

```text
actual FDP = elapsed clock time from report to chock-on, crossing midnight when needed
actual DP = actual FDP in this initial flow because no separate release/debrief endpoint is collected
```

The calculation updates as soon as a complete valid `HH:MM` or compact `HHMM` value is entered; compact input is normalized to `HH:MM` on blur. Clearing the field restores the maximum-FDP projection. The UI explicitly describes DP as using the same endpoint so it does not imply that a separate release time was observed.

## iOS interaction and responsive layout

- Use existing carrier tokens, `PageShell`, panels, segmented pills, and native `TextInput`; add no dependency.
- Place report and optional chock-on together. MAX FDP and latest legal chock-on belong with the live KPI summary, below the inputs on a phone and in the right pane on wide layouts.
- Use a native-style minus/value/plus stepper for sectors with 44-point-or-larger targets and a compact value cell sized for its one-digit operational value.
- On a regular iPhone, render sectors, crew composition, and duty end as compact horizontal fact rows; use short visible labels (`Basic` / `3P` / `4P`, `Home` / `Away`) while retaining full accessibility meaning. After time entry, the projection and first FDP KPI must be visible in the same viewport without a deliberate result scroll.
- Group composition/home-base choices separately from duration totals. Inputs remain one column on compact screens and use the existing two-pane editor/result layout on wide screens.
- Preserve the six reference viewport contracts. The regular iPhone remains a single scroll column; wide Duo/iPad place form and live result side by side. On the Duo inner display, the two panes divide the usable area 50/50 at the hinge boundary.
- Roster What-if uses a Duo-wide density treatment: departure and arrival editors stay side by side with 44-point controls, repeated helper copy is removed, and rule choices become compact rows. Reset and Save scenario move into a labeled action group in the Duo's physical right-edge rail; iPhone and iPad retain the in-content actions.

## Compatibility and scope

- Add an optional latest-chock-on field to saved input. Existing roster and saved scenarios without the field retain their current manually supplied FDP/DP values.
- No server, database, portal capture, roster What-if calculation, remote rule engine, or EASA table change is included; the only roster What-if change is the Duo-wide density and action placement described above.
- Stored New duty scenarios preserve the optional chock-on and reopen with the same derived result.

## Verification

- Engine Jest: blank chock-on projection, same-day elapsed FDP, overnight elapsed FDP, exact limit, and one-minute exceedance.
- Screen Jest: current reporting-time default, removed fields, phone-first input set, blank projection, immediate actual FDP, clearing back to projection, and all six responsive viewports.
- Run focused Jest, TypeScript, root UI-standard check, and `git diff --check`.
- Validate the real UI in order on Air, Duo, and iPad for TG and PR, capturing and visually inspecting versioned screenshots from the automation run.
