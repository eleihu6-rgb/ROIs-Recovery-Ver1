# Roster Bulk Delete Stage Timing

## Goal

Show accurate overall elapsed time and real elapsed time for each bulk-delete phase:

1. Deleting
2. Rechecking
3. Recomputing Manday
4. Broadcasting

The final UI must retain the server-authoritative timings after the task completes.

## Current Findings

- The worker currently stores only one `progress` object in BullMQ.
- Each progress update overwrites the previous stage, so historical phase timings cannot
  be recovered from an existing completed job.
- The API computes active overall elapsed time from `startedAt`, but the browser updates
  the displayed value only after each polling response.
- The current SIT task `1` completed successfully in `95,857 ms`; its stage timings were
  not persisted.

## Design

### Backend

- Add stage timing data to the persisted BullMQ progress payload.
- Record a stage start before each phase begins and record its final elapsed time when the
  phase ends.
- Include the Manday mutation-window lookup in the Manday phase timing.
- Mark Manday as `skipped` when no eligible Manday window exists.
- Start rechecking and Manday preparation concurrently after deletion. The worker still
  awaits both branches before entering Broadcasting and marking the task completed.
- Keep the existing overall `startedAt`, `elapsedMs`, `percent`, `stage`, and result fields
  for API compatibility.
- For active tasks, calculate both overall and active-stage elapsed time from server-side
  timestamps.
- For completed or failed tasks, return frozen server-side final values.

Suggested shape:

```ts
interface RosterBulkDeleteStageTiming {
  stage: 'deleting' | 'rechecking' | 'recomputing-manday' | 'broadcasting'
  status: 'pending' | 'active' | 'completed' | 'skipped' | 'failed'
  startedAt?: string
  finishedAt?: string
  elapsedMs: number
}
```

The persisted progress contains `stages: RosterBulkDeleteStageTiming[]`.

### Frontend

- Render one overall progress row and one compact timing row per phase.
- Display the active overall timer continuously using the server `startedAt` anchor and
  a browser monotonic clock between polls.
- When a completed/failed response arrives, replace the live estimate with the final
  server `elapsedMs`.
- Display each stage's server-provided `elapsedMs`; for the active phase, update it
  continuously from its `startedAt`.
- Use stable labels and a compact layout suitable for the existing dense Gantt dialog.
- Keep the existing polling loop and roster refresh behavior.

### Compatibility

- Existing clients that only read `stage`, `percent`, and `elapsedMs` continue to work.
- The task result continues to expose `durationMs`.
- No database schema change is required.

## Testing

- Worker unit test verifies phase transitions, completed/skipped states, and monotonic
  stage timings.
- Route test verifies active elapsed calculation and final frozen elapsed values.
- Gantt component test verifies all four phase rows and final server timings.
- Existing Playwright bulk-delete flow is extended to assert stage labels, timer display,
  and roster refresh after completion.

## Risks

- Historical completed jobs created before this change cannot provide phase timings; the
  UI should show unavailable/pending timing for those records rather than invent values.
- Browser and server clocks may differ; the browser must use the server timestamp returned
  by the task API as its anchor and freeze to server values on terminal states.
