# Crew App Shared Duty Swap Search

**Date:** 2026-10-22
**Status:** Approved by explicit user request
**Module:** `crew-app/`

## Goal

Use one compact Search Pairing form for Matrix and Twin Rail so both approaches expose the same filters, controls, validation, responsive layout, and visual hierarchy.

## Scope

- Replace Twin Rail's private search form with the existing shared `SearchForm` used by Matrix.
- Preserve Twin Rail's own search lifecycle, default window, options loading/retry, and return-to-rails action.
- Keep one-column layouts on compact phones and two columns on tall/wide layouts, matching Matrix behavior.
- Make report and flight-end time ranges compact numeric controls. Typing four digits such as `0830` displays and submits `08:30`; incomplete or invalid times remain visibly invalid through the existing validation.
- Keep Reset, Search, saved-search, crew-choice, and hide-empty behavior in the shared component.
- Update stale Twin Rail selectors/tests to the shared form contract.

## Affected Modules

- `src/features/dutySwap/components/SearchForm.tsx`: shared form behavior and compact HHMM input.
- `src/features/dutySwap/twinRail/TwinRailScreen.tsx`: render shared form.
- `src/features/dutySwap/twinRail/TwinSearch.tsx`: remove obsolete duplicate.
- Duty Swap Jest, Maestro, and native UI tests: shared selectors and real-user coverage.

## Risks

- Twin Rail could lose its close/back behavior; retain `onClose` and verify rails return without another search.
- Existing automation selectors become stale; update them without weakening business assertions.
- Auto-formatting could corrupt partial input; normalize only digit input up to four digits and preserve validation for incomplete values.
- Wider shared usage means compactness changes affect Matrix, Twin Rail, and Match; validate all six reference viewports and both supported airlines.

## Verification

- Regression-first Jest for shared rendering in Matrix and Twin Rail, HHMM normalization, reset/search, crew choice, and all six reference layouts.
- Full Duty Swap Jest and TypeScript.
- Root UI-standard and diff checks.
- Real UI in order: iPhone Air, `iPhone Duo — Test`, iPad; PR and TG isolation; no real swap submission.
- Versioned screenshots showing the compact shared search and one-day Twin Rail swipe state.

## Twin Rail Puck Simplification

The first puck line shows the pairing start date before the pairing/flight identifier, for example `29 Oct · TG465/TG466`. The second line shows only the airport chain, then available time, BLH, and CRD facts. Flight numbers must not repeat on the second line; narrow pucks continue to reveal information progressively without increasing the fixed puck height.

The rail's top date row uses a carrier-themed inset band. Weekdays use muted card ink and day numbers use the carrier action colour so both retain contrast against that band across light and dark carrier palettes.
