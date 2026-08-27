# Import PBS Material Stage Cell Simplification

## Goal

During PBS material import, each material/stage progress grid cell should show only:

- The stage status: `Waiting`, `Running`, `Done`, or `Failed`.
- The elapsed seconds for that stage.

## Scope

- Gantt UI only: `ImportPbsDialog` progress grid.
- Preserve the existing SSE import flow, percent calculation, stage ordering, result summary, and detailed final statistics.
- Do not show record counts or progress fractions inside stage cells.

## Timing Behavior

- Waiting stages show `0s`.
- Running stages count from the first running event timestamp when available.
- Done/Failed stages show the elapsed seconds from first running event to terminal event.
- If a terminal event is replayed without a prior running event, the reducer infers the start from the previous stage's terminal timestamp, then from the import start timestamp.
- The visible `Transform` column is the sum of connector `transform` + `enqueue`.
- Once the final result arrives, stage cells use the final material timing values so `Fetch`, `Trans`, and `Write` correspond to the result table timings (`fetchMs`, `transformMs + enqueueMs`, and `databaseMs`).

## Verification

- Update focused component tests for the progress grid.
- Run the focused Gantt test file.
