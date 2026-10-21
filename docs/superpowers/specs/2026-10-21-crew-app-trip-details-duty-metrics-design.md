# Crew App Trip Details Duty Metrics

## Scope

When Crew App imports a TG or PR roster, Trip Details must show the published
duty-level values in the crew's scan order:

`BLOCK · FDP · DP · REST`

The values belong to the duty summary card, immediately after the report area.
They must not be repeated on each flight-sector card. A value the portal does
not publish remains absent; the app must not display a synthetic zero.

## Existing Source of Truth

The current portal import already requests and parses:

- `selectPortalCalendar` for flight duties and report timing;
- `selectCrewRosterReport` for published FDP, DP, and duty Block totals; and
- `selectPortalCalendarDetailAll` for FDP, DP, per-leg Block, and Rest.

Those values are stored on each trip leg as `dutyFdpMinutes`,
`dutyDpMinutes`, `dutyBlockMinutes`, and `dutyRestHours`. `groupDuties` groups
the repeated leg values into one duty summary. No new persistence schema or
carrier-specific model is required.

## Design

1. Preserve the shared TG/PR parser and existing missing-value semantics.
2. Do not finalize a normal ROIS roster pull after the first calendar response.
   Prefer the complete three-endpoint, three-month capture; retain a bounded
   fallback when an endpoint is unavailable.
3. Render the duty metric row in `BLOCK`, `FDP`, `DP`, `REST` order. The existing
   compact equal-width row and carrier palette remain unchanged.
4. Keep duty metrics addressable by stable test IDs for real-UI validation.

## Affected Modules

- `crew-app/src/features/travel/PortalCaptureScreen.tsx`
- `crew-app/src/features/v2/TripDetailsScreen.tsx`
- focused Jest tests for portal completion and Trip Details

## Risks

- A missing ROIS endpoint can lengthen the roster-loading screen. The fallback
  remains bounded and the existing manual “Use captured roster” action remains
  available.
- Rest is not present in every report payload. It is shown only when detail-all
  or a proven layover gap supplies it.
- Four metrics must remain readable on compact phones and must not overlap on
  Duo or iPad layouts.

## Verification

- Real captured TG and PR fixtures prove FDP/DP/Block parsing and detail-all
  Rest parsing.
- Portal completion tests prove incomplete ROIS captures wait for enrichment
  while complete captures still finish quickly.
- Trip Details tests prove the exact `BLOCK · FDP · DP · REST` rendering order.
- TypeScript, UI-standard, and diff checks pass.
- Real UI is exercised with PR crew `473006` in Air → Duo → iPad order, and
  screenshots are inspected.
