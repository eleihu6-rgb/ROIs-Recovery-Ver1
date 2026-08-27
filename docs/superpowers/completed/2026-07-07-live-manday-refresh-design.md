# Live Manday Refresh Design

## Goal

Make live crew-manday refresh reliable for both operational edits and manual/scheduled refreshes, including real BLH recomputation from current `roster_flight -> flight.blk_min`.

## Scope

- Extend the live admin refresh endpoint so operators can trigger `recomputeBlh=true` for a date window.
- Ensure the endpoint can recompute all active crew in a scoped window by passing explicit crew ids, so daily rows that lost activity are zeroed and BLH is recalculated.
- Preserve the existing `scope=ghosts` behavior.
- Fix draft commit `swap` handling so Manday recompute uses the swapped roster dates instead of falling back to the current date.
- Add a production CLI for Linux cron/systemd timers that calls the same unified Manday driver.

## Design

`POST /api/admin/manday-credit-refresh` gains an optional query parameter `recomputeBlh=true|false`.

For `scope=all&recomputeBlh=true`, the route loads all crew ids from `f8.crew` and calls:

```ts
recompute(pool, { schema: 'f8', crewIds, startDt, endDt, updatedBy, recomputeBlh: true })
```

This intentionally makes the operation crew-scoped, because the Manday driver only zeroes daily rows in scoped mode. That is required for a full repair refresh.

For `scope=all` without `recomputeBlh=true`, behavior remains unchanged: credit/flags refresh without taking ownership of import-fed BLH.

The new CLI `live-server/scripts/live-manday-refresh.ts` accepts `--start=YYYY-MM-DD`, `--end=YYYY-MM-DD`, optional `--recompute-blh`, and optional `--recent-days=N`. It loads crew ids when recomputing BLH and uses `DATABASE_URL`.

Draft commit will collect swap result dates from `rosterService.swap(...)` so swap-only commits recompute the correct roster window.

## Testing

- Unit-test the admin route query handling and recompute options.
- Unit-test draft commit swap date collection using mocked services.
- Type-check/build live-server.

## Deployment Notes

Linux deployments must build `rule-engine-rs/target/release/ruletool` before invoking Manday refresh. A cron/systemd timer should call the CLI nightly for a recent rolling window, for example the last 60 days with `--recompute-blh`.
