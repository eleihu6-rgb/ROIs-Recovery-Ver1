# Live Gantt Manday KPI Save Flicker

## Problem

In Live Gantt, deleting one DO duty for `CrewId=911` updates the roster-panel KPI immediately:

- `MDO` changes from `13` to `12` before Save.
- `MCredit` and other manday KPIs can also move optimistically before Save.

After clicking Save, the panel briefly shows the pre-edit server base again, for example `MDO=13`, then later returns to the correct post-save value `MDO=12`.

## Root Cause

The Live roster panel displays manday KPIs as:

```text
server crewStatsMap value + client draft delta
```

The save sequence in `gantt/src/stores/draft-store.ts` currently does this:

1. Commit draft operations to `/api/draft/commit`.
2. Clear `operations`.
3. Promote current `rosterItems` to `baseItems`.
4. Refresh dirty crew roster rows.
5. Clear the crew-stats cache.
6. Mark the Gantt dirty.

After step 2 and step 3, the client draft delta becomes `0`. But the currently displayed `crewStatsMap` still contains the old pre-save server stats until a later reload path updates it. That creates the transient display:

```text
old server stats + 0 draft delta
```

For `CrewId=911`, that means the panel can flash back to `MDO=13`. The later `roster-updated` WebSocket self-broadcast calls `refreshCrewsFromBroadcast`, reloads stats, and the panel returns to `MDO=12`.

The same sequencing affects `MCredit`, `MBH`, `YBH`, `MAL`, `YAL`, and `YDO`, because all seven KPIs use the same `crewStatsMap + mandayDelta` display path.

## Desired Behavior

After Save succeeds, roster-panel manday KPIs must not regress to pre-edit values. The committer should see one continuous transition:

```text
pre-edit 13 -> draft 12 -> saved 12
```

There should be no visible intermediate `13` after Save.

## Final Design

After any successful draft commit path, after refreshing dirty crew roster rows where needed and after clearing stats cache, immediately reload manday stats for the same dirty crew IDs and current Live viewport month before marking the Gantt dirty and resolving Save.

Implementation target:

- `gantt/src/stores/draft-store.ts`
  - Import `getLiveViewportYearMonth`.
  - Preserve `dirtyCrewIds` before clearing draft operations.
  - For `dirtyCrewIds.length > 0`, call:

    ```ts
    const crewStore = useCrewStore.getState()
    crewStore.clearCrewStatsCache()
    await crewStore.loadCrewStats(dirtyCrewIds, getLiveViewportYearMonth())
    ```

  - Avoid a separate final `clearCrewStatsCache()` that would discard the freshly loaded cache.

This keeps the fix client-side and uses the already-authoritative backend sequence: `/api/draft/commit` recomputes manday synchronously before broadcasting `roster-updated`.

## Alternatives Considered

- Suppress self-handling of `roster-updated`: this would reduce duplicate refreshes, but it does not fix the local stale stats window before the broadcast arrives.
- Keep draft delta after Save until broadcast: this is more complex because the saved roster is no longer a draft and future edits would need careful delta ownership.
- Add `/api/draft/commit` response stats: stronger contract, but broader API work. The current backend already has fresh stats by the time commit returns, so a client refetch is the smallest fix.

## Tests

Update the existing two-user Playwright regression that drives the real Live UI:

- Delete a credited duty and assert rendered `MCredit` changes before Save.
- Click Save.
- Observe rendered roster-panel KPI samples during the save window and assert `MCredit` never returns to the pre-save value.

This guards the shared `crewStatsMap + mandayDelta` path used by `MDO`, `MCredit`, `MBH`, `YBH`, `MAL`, `YAL`, and `YDO`. Manual QA for `CrewId=911` should verify the concrete reported DO case:

- `MDO=13` before deleting the DO.
- `MDO=12` after deleting the DO before Save.
- Save does not show an intermediate `MDO=13`.

Focused verification:

- `cd gantt && npm test -- --run src/stores/__tests__/crew-stats-cache.test.ts`
- `cd gantt && npm run build`
- `cd e2e && GANTT_TEST_USER=Ryan GANTT_TEST_PASS=Our2027 npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/mcred-cross-user-update.spec.ts --reporter=list`

## Risk

Low to medium. The change adds one already-existing stats refetch on Save for dirty crew only, scoped to the current viewport month. It does not affect first paint and should only run after an explicit Save.
