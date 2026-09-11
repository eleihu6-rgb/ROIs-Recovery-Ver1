# ROIS crew-portal roster fixtures (real captures)

Live captures of the THAI ROIS test portal (`crew-sea-test.roiscloud.com`),
saved for reference + as parser test fixtures. **All four test crews share the
password `Pier2026`.** Each crew has a DIFFERENT roster, so capturing all four
surfaces the full range of duty/assignment types (one crew alone only shows ~7).

> ⚠️ The portal IGNORES the `crewId` query param — it returns the roster of
> whoever the `Authorization` JWT + `userId` header belong to. To get a given
> crew's roster you must log in AS that crew (its own token) and send
> `userId: <thatCrew>`. Querying `crewId=X` with crew Y's token returns Y's data.

## Files

`cal_<crew>_<YYYY-MM>.json`       — `GET /api/rosterFlight/selectPortalCalendar` (duty list; assignment, times, briefStart). No airports, no course detail.
`report_<crew>_<YYYY-MM>.json`    — `GET /api/rosterFlight/selectCrewRosterReport` (per-day duty report; dep/arv airports, hotel, brief/debrief, duty hours).
`detailAll_<crew>_<YYYY-MM>.json` — `GET /api/rosterFlight/selectPortalCalendarDetailAll` (per-day DETAIL; the ONLY source of TRAINING/course info). One file captured for crew 36826 May 2026 (the screenshot case).

### Training/course detail — `selectPortalCalendarDetailAll`
The plain calendar has NO course info for TRG/SIM. This richer endpoint does, under
`data[].portalCalendarDetailRosterGroundInfoVoList[]` (ground duties) — each row:
`{ assignment, location, role, courseType, courseName, courseDesc, device, programName, remarks, portalCalendarDetailTrainingInfoVos:[{crewId,crewName,trainingRole}] }`.
- Match a calendar TRG duty to its detail row by `assignment + startDateTime` (same string).
- `courseName` = course code (e.g. `BTCFARE`); `courseDesc` = description (`CA FIRST AID RECURRENT`); `role` = this crew's training role (`TE`/`IP`); `device` = `DMK/PB01`; `courseType` = `Ground`.
- `portalCalendarDetailTrainingInfoVos` = the other participants on the course — intentionally NOT modelled in the app (per user: only this crew's own info).
- The endpoint returns the WHOLE month inline (the SPA also re-calls it per single day on cell click, but the month call already has everything), so the app captures it automatically alongside the calendar — no per-duty click needed.

Crews: `23605`, `35459`, `44117`, `45779`. Months: `2026-04`, `2026-05`, `2026-06`
(Jul/Aug 2026 returned empty — roster not yet published past June at capture time, 2026-06-01).

## Duty/assignment taxonomy (the `assignment` field = the duty-type key)

`type` is `F` (has a flight-row shape: fltNum + brief/debrief) or `G` (ground, time-window only).

| assignment | type | meaning                         | times             | extra data in payload                    | app category |
|------------|------|---------------------------------|-------------------|------------------------------------------|--------------|
| `FLY`      | F    | Revenue flight                  | timed             | fltNum, dep/arv (report), brief/debrief  | **flight (trip card)** |
| `DHD`      | F    | Deadhead (positioning as pax)   | timed             | fltNum, dep/arv (report), brief/debrief  | Deadhead |
| `SIM`      | F    | Simulator session               | timed             | session code as fltNum (`HOSIM:A33\|34`, `350 AATC`), brief→debrief, BKK | Training |
| `TRG`      | G    | Training (ground)               | timed             | BKK, duty hours; sometimes startDt/endDt (roster-period span, NOT a course span) | Training |
| `CHMSBA`   | F    | Standby A (e.g. `CHMSBA350`)    | timed window      | fltNum = code+fleet, brief/debrief = window | Standby |
| `CHMSBB`   | F    | Standby B                       | timed window      | as above                                  | Standby |
| `CHMSB3`   | G    | Standby (variant 3)             | timed window      | BKK                                       | Standby |
| `PHMSBB`   | G    | Public-holiday standby B        | timed window      | BKK                                       | Standby |
| `MEETING`  | G    | Meeting                         | timed window      | BKK, duty hours                           | Meeting |
| `OFFICE`   | G    | Office duty                     | timed window      | BKK                                       | Meeting |
| `BLOCK`    | G    | Blocked / reserve day           | all-day OR timed  | —                                         | Reserve |
| `OFF`      | G    | Day off                         | all-day           | —                                         | Off |
| `VOFF`     | G    | Voluntary day off               | all-day           | —                                         | Off |
| `VAC`      | G    | Vacation / annual leave         | all-day           | —                                         | Leave |
| `VAC_PH`   | G    | Vacation (public holiday)       | all-day           | —                                         | Leave |
| `HOL`      | G    | Holiday (public holiday)        | all-day           | —                                         | Leave |

### Field notes
- `startDateTime`/`endDateTime` are **crew BASE (Asia/Bangkok, UTC+7, no DST) wall clock**, NOT UTC. Convert with `roisBaseToUTC()` (subtract 420 min). `localStartDateTime`/`localEndDateTime` are airport-local (= BKK for all ground duties).
- All-day duties use `00:00`–`23:59`.
- `color` is the portal's calendar colour (e.g. OFF/BLOCK `a5d6a7` green, leave `ffeb3c` yellow, training/sim `f67c01` orange, standby `05a045` green, meeting/office `a52a2a` brown).
- **Trainer, trainee, course name, and a specific training LOCATION do NOT exist anywhere in the roster API** (verified across all 4 crews). The richest training data available is: the SIM session code (in `fltNum`), the brief→debrief window, BKK as the location, and the duty-period hours (`dpHours`) from the report.

## Re-capture recipe (no simulator needed)

```sh
BASE="https://crew-sea-test.roiscloud.com/tg/apiPortal"
PIN="--resolve crew-sea-test.roiscloud.com:443:52.148.112.153"   # AliDNS flaps; pin it
# 1. public key → 2. RSA-encrypt "Pier2026" (PKCS#1 v1.5) → 3. POST /login
#    body {"user":{"passwords":<enc>,"userCode":<crew>,"captcha":"","uniqueCode":""}}, header Authorization: Bearer null
#    response.data = 157-char JWT
# 4. GET selectPortalCalendar / selectCrewRosterReport with Authorization: Bearer <jwt> + userId: <crew>
```
