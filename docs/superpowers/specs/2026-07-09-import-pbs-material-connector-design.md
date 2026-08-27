# Import PBS Material Connector Alignment Design

Date: 2026-07-09

## Context

The Scenario sidebar currently exposes **Import PBS material**, but the confirm action only closes the dialog. The UI payload still contains fields from an older draft contract: `base`, `rank`, `fleet`, and `mode`. The real F8/NOC inbound path lives in `connector-server`:

- `POST /api/admin/connectors/:id/trigger?startDt=YYYY-MM-DD&endDt=YYYY-MM-DD`
- For `f8_import` connectors this calls `runF8ImportSync(fastify, config, startDt, endDt)`.
- The F8 orchestrator imports flight, crew, pairing, roster-flight, optional roster-ground, and manday depending on connector code / endpoint config.
- Roster-ground is already supported when the connector endpoint config has `rosterGroundUrl`.

The requested product change is to make the Import PBS Material dialog match the connector import contract and use `roster_period` as the period/date source.

## Requirements

1. Remove dialog conditions:
   - Base
   - Rank
   - Fleet
   - Mode

2. Add material choices:
   - Flight
   - Pairing
   - Roster
   - RosterGround
   - Crew

3. Replace free date range input with roster-period selection:
   - Load options from live `roster_period`.
   - Find the RP containing current time: `rp_start <= now <= rp_end`.
   - Show that current RP plus 5 preceding and 5 following RPs.
   - Sort by `rp_start` ascending.
   - Default selection is current RP.
   - After selection, show `rp_start` and `rp_end` on the right as disabled date fields.
   - User cannot edit dates directly.

4. Connector import must account for upstream 1000-row response caps:
   - Current code retries by smaller chunks only on thrown errors.
   - It does not currently identify a successful but capped response such as exactly 1000 returned rows.
   - Roster-flight and roster-ground still use 10-day chunks, which can silently truncate data if the provider caps result rows at 1000.

## Proposed Implementation

### Frontend: `gantt`

Update `gantt/src/components/scenario/import-pbs-dialog.tsx`:

- Remove Base/Rank/Fleet multi-select loading and fields.
- Remove Mode select.
- Change payload to:

```ts
interface ImportPbsPayload {
  rosterPeriodId: number
  rosterPeriod: string
  startDate: string
  endDate: string
  scope: {
    flight: boolean
    pairing: boolean
    roster: boolean
    rosterGround: boolean
    crew: boolean
  }
}
```

- Add RP select with options loaded on open.
- Show disabled `rp_start` and `rp_end` date inputs next to the RP select.
- Keep at least one material checkbox required.

Update `gantt/src/components/scenario/scenario-list-panel.tsx`:

- Replace the placeholder confirm handler with an actual import call.
- Set/importing state while the request is running.
- Show success/failure notification.

Add a focused service, likely `gantt/src/services/import-pbs-material-api.ts`, instead of reusing `crew-bids-api.ts`.

### Live-server API

Add a small authenticated/admin route in `live-server`, rather than calling connector-server directly from the browser.

Reasoning:

- Gantt already talks to live-server under the existing auth/session model.
- Connector admin routes require connector admin scope and may not be browser-routable through the same public origin.
- A live-server proxy keeps connector host/token details server-side and avoids exposing connector admin credentials.

Suggested endpoints:

- `GET /api/scenario/import-pbs-material/roster-periods`
  - Query live schema `roster_period`.
  - Return 11-item window around the current RP.
  - Sort by `rp_start asc`.
  - Response fields: `id`, `rosterPeriod`, `rpStart`, `rpEnd`, `isCurrent`.

- `POST /api/scenario/import-pbs-material`
  - Body: `{ rosterPeriodId, scope }`.
  - Server looks up `rp_start/rp_end` by `rosterPeriodId`; do not trust dates from client.
  - Trigger connector import(s) with `startDt` and `endDt` derived from RP.
  - Return triggered connector statuses / sync IDs.

Connector routing options:

- If importing full material, trigger the main F8 roster connector; the orchestrator already does flight -> pairing -> roster and optional roster-ground.
- For crew-only import, trigger the `f8-crew` connector.
- For flight-only or pairing-only import, trigger `f8-flight` or `f8-pairing`.
- For `RosterGround`, prefer adding explicit orchestration support rather than assuming roster-flight import always includes it. Today roster-ground only runs inside the full roster path when `rosterGroundUrl` exists.

Approved scope semantics:

- Material selections are independent. `Roster` does not automatically include Flight or Pairing.
- If roster-flight import cannot match a referenced Pairing, ignore that roster-flight data instead of failing the whole import.
- `RosterGround` can be imported independently.

### Connector-server

To support material-specific import cleanly, extend `runF8ImportSync` with optional scope:

```ts
interface F8ImportScope {
  flight?: boolean
  crew?: boolean
  pairing?: boolean
  roster?: boolean
  rosterGround?: boolean
  manday?: boolean
}
```

Keep existing behavior as default scope for scheduled/manual connector runs, so existing automation is not changed.

For route compatibility:

- Existing `startDt/endDt` query params remain.
- Add optional query/body scope only for the live-server proxy path or admin path if needed.

### 1000-row Cap Detection

Current state:

- `fetchWithChunkRetry` splits on thrown errors only.
- `f8Post` and `extractList` return arrays without metadata.
- If the upstream returns exactly 1000 rows due to a cap, the import treats it as complete.

Proposed behavior:

- Add a row-cap-aware fetch helper for F8 imports.
- Configurable cap default: `maxRowsPerResponse = 1000`.
- If a response length is `>= maxRowsPerResponse`, treat the chunk as suspicious and split it into smaller chunks.
- Split sequence should continue down to 1-day chunks.
- If a 1-day response still returns `>= 1000`, fail that day with an explicit error or log a hard warning and mark the connector log as capped. Recommended: fail the import rather than silently truncating.
- Apply this especially to roster-flight and roster-ground. It can also be enabled for all F8 entities for consistency.

Potential function shape:

```ts
fetchWithChunkRetry(fn, startDt, endDt, chunkDays, {
  maxRowsPerResponse: 1000,
  splitOnCap: true,
  failOnSingleDayCap: true,
})
```

The row-cap handling should have unit tests for:

- 10-day chunk returns 1000 -> splits.
- Sub-chunks return <1000 -> merged result.
- 1-day chunk returns 1000 -> throws a cap/truncation error.
- Existing thrown-error retry behavior remains unchanged.

## Tests

Required focused coverage:

- `connector-server` unit tests for row-cap splitting and single-day cap failure.
- `live-server` route test for RP window selection:
  - current RP selected
  - previous 5 / next 5 returned
  - sorted by `rp_start asc`
- `live-server` route test for import trigger:
  - validates scope
  - looks up server-side RP dates
  - calls connector trigger with `startDt/endDt`
- `gantt` component test for dialog:
  - no Base/Rank/Fleet/Mode controls
  - shows Crew and RosterGround material checkboxes
  - defaults current RP
  - date fields disabled
- Playwright test driving real Scenario sidebar import dialog and confirming the UI path.
- Run `npm run check:ui` after frontend style changes.

## Risks / Questions

- Connector admin authentication and routing need confirmation. Direct browser calls to connector-server should be avoided unless the deployed route already proxies connector admin safely.
- Material scope semantics need final confirmation:
  - Resolved 2026-07-09: no dependency expansion; roster rows without matching pairing are ignored; roster-ground is independently runnable.
- The upstream 1000-row cap cannot be proven from code inspection alone. The safe code behavior is to treat `>=1000` as capped and split/fail visibly.
