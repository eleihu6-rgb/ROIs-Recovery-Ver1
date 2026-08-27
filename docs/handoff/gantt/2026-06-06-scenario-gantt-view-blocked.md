# Bug handoff — Scenario Gantt view cannot load (engine-server /optimize/result 401)

- **Date:** 2026-06-06
- **Area:** live-server ↔ engine-server integration (surfaces in gantt Scenario module)
- **Severity:** High for the feature (a completed scenario's Gantt cannot be opened at all in this environment)
- **Owner:** dev team (backend / integration + test-data)
- **Status:** OPEN — identified from the Regression playground. No fix applied.
- **Red specs (left failing as the signal):**
  - `e2e/tests/gantt/scenario-gantt-open.spec.ts`
  - `e2e/tests/gantt/scenario-gantt-edit.spec.ts`

## Symptom

Opening a scenario's Gantt view never mounts `scenario-gantt-view`. The data
endpoint fails:

```
GET /api/scenario/:id/gantt-data
→ 502 { "message": "Failed to build gantt data: engine-server /optimize/result 401" }
```

This happens for **every** DONE scenario tried (ids 8, 6, 14, 229), so it is an
environment/integration problem, not data-specific: live-server's call to
engine-server `/optimize/result` is rejected with **401 Unauthorized**.

A force-marked DONE scenario (no real optimization result) instead returns:

```
409 { "message": "Scenario has no optimized result" }
```

## Two distinct issues to fix

1. **Integration (backend):** live-server → engine-server `/optimize/result`
   returns 401. Check the auth/token (or shared secret) live-server sends to
   engine-server in this environment; the gantt-data builder can't fetch results
   without it.

2. **Test design (these two specs):** they fabricate a DONE state by POSTing
   `/api/scenario/:id/transition` to `DONE`, which can never render a Gantt
   (no real result → 409). Even after issue #1 is fixed, these specs need a
   **genuinely optimized scenario fixture** (a seeded DONE scenario with real
   roster results, or a deterministic short engine run) rather than a fabricated
   status flip. Until then they are honestly RED.

   Note: the `scenario-gantt-edit` spec also acquires a lock and mutates/saves a
   bar; point it at a dedicated throwaway fixture, not shared demo data.

## Why they are left RED (not quarantined)

Per the playground's purpose (identify breaks; leave fixes to the dev team), a
red test that pinpoints a real integration failure is the desired signal. They
will go green once (1) the engine-server 401 is resolved and (2) the specs use a
real optimized-scenario fixture.

## What WAS fixed in the test layer (same branch)

`scenario-run.spec.ts` and `scenario-detail-toolbar.spec.ts` were repaired and
are green — they no longer depend on the Gantt view: they cover rule-group
persistence, the Pre-run Check gate, the failing-run error toast, and the
toolbar's state-aware actions incl. the Remove-result confirm dialog. See also
`2026-06-06-scenario-store-draft-clobber.md`.
