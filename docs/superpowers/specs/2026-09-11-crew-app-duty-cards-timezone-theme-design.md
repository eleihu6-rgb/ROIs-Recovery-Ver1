# Crew App — ground-duty cards, days-off concept, time-zone convention, theme alignment

- **Date:** 2026-09-11
- **Module:** `crew-app` (React Native, Royce Travel / `royce-travel-rn`)
- **Requested by:** Ryan (7 items, one message thread)
- **Status:** implemented the same day; this note records the decisions taken where the
  request left a choice open. `brainstorming` skill is not exposed in this agent session,
  so the design is written here per root `CLAUDE.md` §Design-Before-Implementation.

## 1. Scope

| # | Request | Where it lands |
|---|---|---|
| 1 | Run the sim with ET crew J4001 | `crew-app/.maestro/et_crew_duty_sim.yaml` (parameterised) |
| 2 | Login fails with "Invalid F8 roster envelope" — caused by the Sep 9 / Sep 17 ground duties; the duty card only fits flights | `travel/ekRosterApi.ts`, `roster/dutyDisplay.ts`, `v2/ScheduleScreen.tsx` |
| 3 | A blank day is not a day off — only an explicit days-off duty gets a card | `v2/ScheduleScreen.tsx` (list is built from duty days) |
| 4A | Merge the separate "Report" row into the leave-home/wake-up/check-in row, order wake up → leave home → check-in | `v2/ScheduleScreen.tsx` |
| 4B | Those three markers belong to the duty's **first** leg only | `v2/model.ts` (`LegView.firstLeg`), `v2/ScheduleScreen.tsx` |
| 4C | Airport-local must actually convert (ET877 STD 10:10L ADD → STA 13:10L LLW); show the `L` / ` B` / `Z` convention; add a tooltip | `settings/timeFormat.ts`, `settings/airportZones.ts`, `settings/alarmSetup.ts`, `settings/settingsSlice.ts`, `v2/model.ts`, `v2/TimeZoneScreen.tsx` |
| 5 | Login select box colours follow the page background | `auth/LoginScreen.tsx` |
| 6 | Select-airline page style aligned | `auth/LoginScreen.tsx` (`AirlinePicker`) |
| 7 | Post-login loading page is purple | `auth/EkRosterLoginScreen.tsx` |

## 2. Root cause of #2 (measured, not inferred)

`POST /api/mobile-roster/session` for J4002 returns:

```json
{"assignment":"DO","label":null,"startUtc":"2026-09-08T21:00:00.000Z","endUtc":"2026-09-09T20:59:00.000Z", ...}
{"assignment":"AL","label":null,"startUtc":"2026-09-16T21:00:00.000Z","endUtc":"2026-09-17T20:59:00.000Z", ...}
```

`roster_flight.label` is NULL on day-off / leave rows (1 150 such rows in SIT), so the
service's `coalesce(p.pairing_label, rf.label)` yields null. The app's zod
`groundDutySchema` declared `label` / `assignment` / `startUtc` / `endUtc` as
`requiredString.optional()` — *undefined* is allowed, **null is not** — so
`parseEkRosterResponse` failed and `parseF8RosterEnvelope` reported
"Invalid F8 roster envelope", aborting the whole login.

**Decision:** make the transport schema accept nulls (they are real server values), and
derive the display label from the assignment code, which is always present. Rows without
a start/end window are skipped instead of failing the login (a duty we cannot place on a
day must not cost the crew their roster).

## 3. Duty-code vocabulary (from `f8_sit_live.assignment`)

`FLY` stays a trip card. Ground codes now map explicitly:

| code | label | category |
|---|---|---|
| `DO` / `GDO` | Day Off / Guaranteed Day Off | off |
| `AL` | Annual Leave | leave |
| `VAC` / `ILL` | Annual Leave / Sick Leave | leave |
| `RES` / `PRAM` / `PRPM` | Reserve / Standby AM-PM / Standby Night | reserve / standby |
| `SIM` | Simulator | training |
| `GRD` / `SFT` | Ground Duty / Shift | other |
| `DHD` / `PAX` | Deadhead / Positioning | deadhead |

## 4. Days-off concept (#3)

The Schedule list is now built from **duty days only**: a day shows a card when it has
flight legs, a ground duty, a layover, or a meeting. A day with nothing on it is simply
absent from the list (the date strip still shows every day of the month, with a duty dot).
An explicit airline days-off row (`DO`) *does* produce a card — that is the airline
telling the crew they are off, and is different from "no roster row for that date".

## 5. Time-zone convention (#4C)

Times render as `13:00L` (airport local), `13:00B` (base time) and `13:00Z` (UTC) — the
three modes named in the request, suffix immediately after the digits. `Phone local time`
(a pre-existing fourth mode) keeps no suffix, since the crew already knows their phone's
zone and the request did not define a marker for it.

For `airport` mode the app now converts the UTC instant into the *named airport's* zone
instead of printing UTC. That requires an IATA → IANA table covering the ET network;
`settings/airportZones.ts` holds it plus a fixed-offset table for the no-DST zones, so
times stay right even if the JS engine's IANA database is incomplete (the reason the
original Bangkok fallback existed).

The crew's **base** time zone was hardcoded to `Asia/Bangkok`; it is now set from the
roster's `crew.base` on login (ADD for the ET crews), which is what "Base time" has to
mean for a non-TG carrier.

## 6. Visual alignment (#5, #6, #7)

The auth stack already renders on the `altair` (sage/teal) gradient; the airline select
box and the airline picker were still using the app-theme purple tokens, and the
post-login loading screen used `colors.primary` (purple). All three now use the carrier
palette for the signed-in airline (`emerald` for ET), so login → loading → Home is one
continuous theme.

## 7. Verification plan

- Jest: roster envelope with null ground-duty labels, duty-code mapping, time-zone
  suffix/конversion, blank-day filtering, and the existing trip-card snapshots.
- `npx tsc --noEmit`.
- Maestro sims on the iOS simulator for **J4001** (all-flying roster) and **J4002**
  (Day Off Sep 9, Annual Leave Sep 17) against `cr.rois.one/api` → local `live-server`.
- Screenshots into `docs/assets/screenshots/crew-app/` with `-Ver<N>` names.
