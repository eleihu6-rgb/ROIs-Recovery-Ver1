# Scenario Acc-Ref Live Segment Fallback Plan

> **For agentic workers:** Execute task-by-task. Smallest change; no speculative abstractions.

**Goal:** Scenario acc-ref resolves dep/arr airports from live `pairing_segment` when scenario segments are missing.

**Tech Stack:** Node ESM scripts, Vitest/node:test, TypeScript service mirror.

## Task 1: Extend `loadAccRefRows`

- Modify: `live-server/scripts/acc-ref-tz.mjs`
- Add optional `livePairingSegmentTable`
- Left-join live segments; coalesce arp: rf → ps → lps

## Task 2: Wire Scenario callers

- Modify: `live-server/src/services/rule/legality-preview.ts` — pass live table when `contextType === 'scenario'`
- Modify: `live-server/scripts/scenario-legality.mjs` — `recalculateScenarioAccRefTz`

## Task 3: Mirror TypeScript service

- Modify: `live-server/src/services/rule-check/acc-ref-tz-service.ts` — scenario path joins live segments as fallback

## Task 4: Regression test

- Add: `live-server/scripts/__tests__/acc-ref-live-segment-fallback.test.mjs`
- Assert scenario options / SQL include live join + coalesce order
- Assert UTC-zone updates differ from airport-zone updates (existing buildAccRefUpdates pattern)

## Task 5: Verify

```bash
cd live-server && node --test scripts/__tests__/acc-ref-live-segment-fallback.test.mjs scripts/__tests__/acc-ref-preflight-order.test.mjs
```
