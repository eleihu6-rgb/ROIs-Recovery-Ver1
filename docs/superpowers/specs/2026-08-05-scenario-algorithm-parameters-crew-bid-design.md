# Scenario Algorithm Parameters and Crew Bid Design

## Problem

The Scenario detail currently reports `Using defaults` from a coarse
`configuredCount` check, even when the user has changed only some algorithm
parameter tabs. The parameter dialog also writes directly to the database,
which makes its save action inconsistent with the Scenario detail toolbar.
Scenario optimization should additionally allow planners to opt out of crew
bid extraction and delivery to the RO solver.

## Decisions

### Parameter status

- The Scenario detail status remains `Using defaults` only when no algorithm
  parameter item differs from the effective template default.
- When one or more items differ, the status names the changed tabs, for example
  `Changed: Credit Range, Floor Rescue`.
- The comparison is value-based and uses the effective parameter values returned
  by the API, so default-valued rows created for a scenario do not count as
  user changes.
- The status is recalculated after loading, after local edits, and after the
  Scenario detail save completes.

### Unified save

- Opening the parameter dialog loads the current merged parameter values into a
  local draft.
- The dialog's completion action only returns the edited parameter items to the
  Scenario detail draft and closes the dialog. It does not call
  `PUT /api/scenario/:id/parameters`.
- The Scenario detail Save action sends the ordinary Scenario fields and the
  optional parameter items in one update request.
- The live-server update handler validates and persists both parts from the same
  update request. Existing standalone parameter GET/PUT endpoints remain
  available for compatibility, but the Gantt flow no longer uses the PUT
  endpoint. The existing service uses its Drizzle and PostgreSQL clients in
  sequence rather than introducing a new cross-client transaction abstraction.
- A failed save leaves the Scenario detail and parameter draft dirty so the
  planner can retry.
- Parameter editing remains disabled while the Scenario is RUNNING, DONE, or
  PUBLISHED according to the existing detail-panel capability rules.

### Crew Bid tab

- Add a `Crew Bid` tab to the same Algorithm Parameters dialog.
- It contains one checkbox, checked by default: `Include crew bids in this
  optimization`.
- The tab explains in English that disabling it skips crew-bid extraction and
  does not send crew-bid preference data to the RO solver.
- The value is stored as a Scenario parameter code (default `true`) and follows
  the same unified draft/save path as other parameters.
- During RO run preparation, engine-server reads the stored value. When false,
  it skips bid-package login, download, and extraction entirely. When true, the
  existing scenario-scoped bid-package behavior is unchanged.
- The engine treats a missing/invalid value as enabled for backward compatibility
  with existing scenarios.

## API shape

- Extend the Scenario update request with optional `algorithmParameters`, an
  array of `{ code, value }` items.
- The response remains the normal `ScenarioDetail`; the frontend refreshes the
  merged parameter response as needed for display.
- Add the `crew_bids` parameter template with a boolean default of `true`.

## Verification

- Frontend unit tests cover effective-default comparison, changed-tab labels,
  local dialog completion without a parameter PUT, and Crew Bid default/toggle.
- Live-server tests cover atomic Scenario update plus parameter persistence and
  validation.
- Engine-server tests cover enabled and disabled bid-package preparation.
- Playwright drives the real Scenario detail: change one parameter, verify only
  its tab is named, click dialog completion, verify the detail Save button is
  dirty, save, reload, and verify the value and status. It also unchecks Crew
  Bid and proves the run preparation does not request the bid package.
- Run focused module tests, the focused Playwright specs, `npm run check:ui`,
  and relevant builds.

## Risks and scope

- The existing scenario parameter table is retained; no schema migration is
  needed beyond seeding the new template through the existing parameter-service
  template mechanism.
- Direct callers of the standalone parameter PUT endpoint are not changed in
  this task.
- The engine change only controls preference-package extraction. It does not
  remove unrelated bid-related fields from other ro_input sections.
