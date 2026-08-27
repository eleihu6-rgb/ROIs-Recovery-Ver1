# 7505 Crew Base Local RP Window Design

## Context

Rule `7505` currently has split time semantics in the shared legality recheck path:

- The persisted warning `message` was recently changed to show roster-period labels from `ctx.dateFrom` / `ctx.dateTo`, so a June 2026 run displays `2026-06-01, 2026-06-30`.
- The actual `days_off` counting still runs through `check-7505` with one shared UTC window and `--offset 0`.

That mismatch is wrong for crews whose prime base is in an Americas timezone. For example, a Vancouver or Toronto crew can have activity that is still local `2026-05-31` while already inside the UTC range starting at `2026-06-01 00:00:00Z`. In that case the current rule may count May 31 local activity inside the June rostering period even though the warning text says the checked period is June 1 through June 30.

The user requirement is stricter than a message-only fix:

- The warning message dates must be the crew-base-local roster-period dates.
- The actual `7505` legality check must use the same crew-base-local roster-period window.
- The verification/persist helper `live-server/scripts/check-7505-gdo.mjs` must be updated to the same semantics so diagnostics do not disagree with production recheck behavior.

## Requirement

For rule `7505` in Live and Scenario legality recheck:

- Define the checked rostering-period window per crew using the crew member's prime-base local day boundary.
- Use that same per-crew local window for:
  - `days_off` counting
  - leave-day counting and band-row selection
  - persisted `start_dt` / `end_dt`
  - warning `message`
- For a June 2026 check, the user-visible message must show:
  - `2026-06-01, 2026-06-30`
- For a Toronto crew, the actual UTC window for that June check is local `2026-06-01 00:00` through local `2026-07-01 00:00`, which is `2026-06-01 04:00:00Z` through `2026-07-01 04:00:00Z`.
- For a Vancouver crew, the actual UTC window for that June check is local `2026-06-01 00:00` through local `2026-07-01 00:00`, which is `2026-06-01 07:00:00Z` through `2026-07-01 07:00:00Z`.

## Non-goals

- Do not change the Rust `7505` counting kernel logic in `rule-engine-rs/src/lib.rs`.
- Do not redesign the broader timezone infrastructure used by other rules.
- Do not change frontend rendering, DTOs, DB schema, or Gantt UI components.
- Do not rewrite historical `rule_violation` rows in place.
- Do not convert this task into a generalized IANA-timezone rewrite for all legality rules.

## Recommended Approach

Use the existing offset-based pattern already used by other legality scripts and keep the fix surgical.

1. In the shared legality core, change `rule7505()` from one batch run over all crews with one shared UTC window into per-crew evaluation.
2. Reuse `source.crewOffsets()` to get each crew's prime-base UTC offset in minutes.
3. For each crew:
   - group that crew's `assignmentsAll()` rows
   - compute the UTC instant representing that crew's local `ctx.dateFrom 00:00:00`
   - compute the UTC instant representing that crew's local day after `ctx.dateTo`
   - call `check-7505` with that crew's activities, offset, and RP window
4. Persist the returned violation using that same per-crew UTC window.
5. Keep the displayed warning message labels as `ctx.dateFrom` and `ctx.dateTo`, because those are the intended local roster-period calendar labels.

This is the smallest safe fix because:

- It makes the calculation and message use the same time semantics.
- It reuses existing `crewOffsets()` data instead of adding new schema reads or API surface.
- It keeps the Rust checker untouched.
- It keeps Live and Scenario on one shared legality code path.

## Detailed Design

### 1. Shared legality core

Change site: `live-server/scripts/legality-recheck-core.mjs`

Current behavior:

- `rule7505()` computes:
  - `rpStart = epochSec(ctx.dateFrom)`
  - `rpEnd = epochSec(ctx.dateTo + 'T23:59:59Z') + 1`
- then runs one `check-7505` invocation over all crews with `--offset 0`

New behavior:

- Load `const offsets = await source.crewOffsets()`
- Load `const assignA = await source.assignmentsAll()`
- Group `assignA` by `crew_id`
- For each crew:
  - resolve `offsetMin = offsets.get(crewId) ?? DEFAULT_OFFSET_MIN`
  - compute:
    - `rpStartUtc = epochSec(ctx.dateFrom) - offsetMin * 60`
    - `rpEndUtc = epochSec(nextDay(ctx.dateTo)) - offsetMin * 60`
  - emit the shared `R` param rows plus only that crew's `A` activity rows
  - invoke `check-7505` with:
    - `--rp-start <rpStartUtc>`
    - `--rp-end <rpEndUtc>`
    - `--offset <offsetMin>`
  - persist results using returned `rpS` / `rpE`

The warning message stays:

```text
The number of days off(${daysOff}) must be at least ${minDo} in ${period} ${unit} (${ctx.dateFrom}, ${ctx.dateTo}).
```

That label is now correct because the actual evaluated window is the crew-local RP window represented by those dates.

### 2. Verification/persist script

Change site: `live-server/scripts/check-7505-gdo.mjs`

Current behavior:

- reads all activities for the full window once
- runs `check-7505` once with:
  - `--rp-start <fromT00:00Z>`
  - `--rp-end <toT00:00Z>`
  - `--offset 0`

New behavior:

- read crew prime-base offsets once
- group activities by crew
- for each crew, compute the same crew-local RP UTC window used by production legality recheck
- run the Rust checker per crew with that crew-specific offset/window
- aggregate results into the existing summary format
- when `--persist` is used, persist using the same per-crew returned `rpStart` / `rpEnd`

This keeps the diagnostic harness aligned with the real legality path instead of silently proving the wrong rule.

### 3. Live and Scenario coverage

No separate Scenario-specific rule logic is introduced. The fix lands in the shared legality core, so both Live and Scenario legality recheck pick it up automatically as long as their adapters already provide `assignmentsAll()` and `crewOffsets()`.

## Data Sources

- Crew prime base: `crew_base`
- Base timezone / offset authority in current implementation:
  - `crewOffsets()` returns offset minutes using the existing `BASE_OFFSET_MIN` mapping
- Activity rows:
  - `assignmentsAll()` from the active legality source adapter
- Rule param rows:
  - resolved from the active ruleset in `ctx.instancesOf(7505)`

## Risks And Constraints

### Static offset mapping vs IANA timezone

The current legality adapters use static offsets from `BASE_OFFSET_MIN`, while `crewBaseTimezone()` uses IANA zone ids. That is a known limitation, but for the user's reported June 2026 Americas cases the existing offsets line up with DST-adjusted local time in current data.

This task will not broaden into an IANA-aware offset resolver. It stays within the existing offset-based contract to keep the change minimal and safe.

### Runtime cost

`rule7505()` will move from one batch invocation to one invocation per crew. This is a deliberate trade-off for correctness and for the smallest possible code change. The rule already operates on per-crew semantics, and this task prioritizes fixing incorrect legality boundaries over optimizing checker batching.

If performance later becomes a problem, a follow-up task can extend the Rust CLI to accept per-crew offsets in one batch run.

## Testing

Add or update focused backend/script tests only.

### Unit coverage

File: `live-server/tests/unit/legality-recheck-core-param.spec.ts`

Add a regression case that proves:

- a crew with an Americas base offset does not evaluate June RP using `2026-06-01 00:00:00Z`
- the generated message still shows `2026-06-01, 2026-06-30`
- the checker call is made with the crew-specific offset and crew-specific UTC RP window

Keep the existing message assertion, but update expectations so the test verifies both message correctness and calculation-window correctness.

### Script-level verification

Add or update targeted coverage around `check-7505-gdo.mjs` so it proves:

- the script evaluates per crew, not one shared UTC window
- the persisted/returned RP boundaries match the crew-local window

### Execution scope

Run the smallest relevant verification set first:

- targeted unit test for `legality-recheck-core`
- targeted verification for the `7505` script path
- typecheck only if the touched files require it

No Playwright is required for this task because the user-visible UI already reads persisted `rule_violation.message`; this fix changes backend legality semantics and text generation, not frontend interaction.

## Acceptance Criteria

- For June 2026 `7505`, a Toronto/Vancouver crew is checked over that crew's local June 1 through June 30 window, not over UTC June 1 through June 30.
- The warning message shows `2026-06-01, 2026-06-30`.
- `start_dt` / `end_dt` persisted for `7505` correspond to the evaluated crew-local RP window in UTC.
- `live-server/scripts/check-7505-gdo.mjs` uses the same semantics as production legality recheck.
- Live and Scenario shared legality behavior remains unified through the same core rule path.
