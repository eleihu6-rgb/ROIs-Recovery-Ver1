# F8 Crew App Live Roster Link Design

Date: 2026-08-28

## Decision

Use Option B: connect `Royce-Travel-APP-Ver2` crew app to ROIS CMS `live-server` for F8 roster data.

This keeps TG/PR/EK untouched:

- TG and PR continue using the existing `portalKind: "rois"` WebView capture flow.
- EK continues using the existing API-backed roster flow.
- F8 becomes a new API-backed airline whose source is our CMS live roster data.

## Product Goal

Crew app users for the new F8 client can log in with a crew id, fetch their roster from ROIS CMS, and see the roster in the app's existing trips/agenda/roster screens.

Initial validation target:

- Airline: F8
- Crew id: `113`
- Source: ROIS CMS live roster
- Password source: existing PBS portal credential in `pbs.pbs_user.password_hash`
- Duties: all live duties that can be represented in the mobile contract
- Default roster window: current month plus next month
- Simulator proof: app login and roster render for crew `113`

## Source Of Truth

For this option, the crew app reads from live roster data, not PBS award results.

Live data source chain:

- `crew.crew_id` identifies the crew member.
- `roster_flight.crew_id` links assigned duties to crew.
- `roster_flight.pairing_id` links duties to `pairing`.
- `pairing_segment.pairing_id` plus duty/segment fields links pairings to flight segments.
- `flight` provides flight schedule fields where needed.
- Published roster may be considered later, but is not the first source for this option.

The endpoint must not expose the internal Gantt response shape. It should return a stable mobile roster contract designed for the crew app.

## Backend Design

Add a new live-server route module, tentatively:

`POST /api/mobile-roster/session`

Request:

```json
{
  "airline": "F8",
  "crewId": "113",
  "password": "..."
}
```

Response:

```json
{
  "apiVersion": "1",
  "airline": "F8",
  "crew": {
    "crewId": "113",
    "firstName": "",
    "lastName": "",
    "base": "YEG",
    "rank": "CA"
  },
  "pairings": [
    {
      "pairingId": "12345",
      "label": "F8...",
      "checkInUtc": "2026-09-01T10:00:00.000Z",
      "releaseUtc": "2026-09-03T22:00:00.000Z",
      "assignment": "FLY",
      "flights": []
    }
  ],
  "groundDuties": []
}
```

Implementation notes:

- Put route handling in `live-server/src/routes/mobile-roster/`.
- Put query and mapping logic in `live-server/src/services/mobile-roster/`.
- Register under `/api/mobile-roster`.
- Validate with Zod at the route boundary.
- Use parameterized SQL and schema validation; do not build dynamic SQL from request values.
- Restrict airline to `F8` for this first integration.
- Return only the authenticated crew's roster rows.
- Use a date window to avoid unbounded reads. Default to current month plus next month, with optional explicit `startDate` / `endDate` once needed.

Authentication for the first simulator integration should be deliberately narrow:

- Authenticate F8 crew `113` against the same credential source used by the PBS portal: `pbs.pbs_user.password_hash`.
- Reuse the PBS portal account gates where applicable: active status, effective date window, `password_access = '1'`, and `portal_access = '1'`.
- Do not store a separate crew-app password.
- Do not reuse internal planner JWTs for the mobile app.
- Do not expose this endpoint publicly without HTTPS, CORS allowlist, and a real mobile auth mechanism.

## App Design

In `Royce-Travel-APP-Ver2/rn-app`:

- Add F8 to `WIRED` airlines with API-backed roster behavior.
- Add test credentials for crew `113`.
- Generalize the EK-specific API adapter naming where required so the parser accepts `airline: "F8"` without changing EK behavior.
- Keep persisted trip/duty storage separate enough that switching F8/TG/PR/EK cannot mix data.
- Keep app UI text English.
- Bump `APP_VERSION` in `rn-app/src/version.ts` as required by the crew app rules.

The existing `EkRosterLoginScreen` and `ekRosterLogin.ts` are currently named for EK. The smallest viable implementation can reuse that route for all `portalKind: "rois-api"` airlines, but user-facing loading/error text should be airline-aware so F8 does not show "Loading Emirates roster".

## Validation Plan

Backend:

- Add focused Vitest coverage for the live-server mobile roster service mapper.
- Add route-level validation coverage for invalid airline, missing crew id, bad password, disabled portal account, and the F8 crew `113` happy path using a mocked service or test DB fixture pattern already used in live-server.
- Run the smallest relevant live-server test command.

App:

- Add Jest coverage for F8 API response parsing and trip mapping.
- Run `npx jest rn-app/__tests__/features/<f8-roster-test>.test.ts`.
- Run `npx tsc --noEmit`.
- Add a Maestro flow for F8 crew `113`.
- Run simulator validation for F8 crew `113`.
- Because crew app rules require it after changes, also run TG and PR simulator flows to verify existing sources still work and data does not mix.

Manual data validation:

- Query the remote PostgreSQL authority for crew `113` live roster rows before simulator validation.
- Confirm at least one roster item in the app corresponds to the live-server response.

## Risks

- Live roster may include planner draft/current operational data that is not intended for crew publication. This is the main product risk of Option B.
- Existing app API code is EK-named and hard-checks `airline === "EK"`, so careless changes could regress EK.
- Mobile auth is not yet production-ready if we only add a test credential path.
- Direct live-server exposure needs CORS, HTTPS, rate limiting, and logging discipline before external client use.
- Roster windows must be bounded to avoid full-table reads for mobile refresh.

## Out Of Scope

- Changing TG/PR portal capture.
- Changing EK roster fetching behavior.
- Building a full production F8 identity system.
- Linking PBS bidding or award-result workflows into the crew app.
- Exposing planner-only Gantt APIs directly to mobile.

## Open Questions

1. Confirm whether `portal_access` is sufficient for mobile roster access or whether `app_access` must also be required.
2. Confirm the expected display labels for non-flying live duties that do not map cleanly to the app's existing `groundDuties` schema.
