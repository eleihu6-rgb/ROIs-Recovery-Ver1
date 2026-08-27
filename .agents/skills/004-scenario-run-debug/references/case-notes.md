# Scenario Run Case Notes

These notes accumulate verified facts from prior investigations. Do not treat an open case as a solved root cause.

## Case Template

```markdown
## Scenario <id> - <short symptom>

Status: Open | Solved
Date recorded: YYYY-MM-DD

Verified facts:
- ...

Evidence:
- ...

Known non-causes:
- ...

Open questions:
- ...

Next evidence to collect:
- ...

Root cause:
- Unknown, or concise solved cause with evidence.
```

## Scenario 577 - `return fetch failed`

Status: Solved
Date recorded: 2026-06-25

Verified facts:
- User reported: `scen 577 return fetch failed`.
- Engine-server received `POST /api/optimize/start` for scenario 577 on 2026-06-23 08:32:26.
- Engine-server created task `0fec98e2-fb54-4af9-9be1-acf4443d762b`.
- The task started `LegacyRO(db)` ro_input generation and engine-server returned HTTP 502 four seconds later.
- The task workdir `engine-server/workspace/F8/LegacyRO_577_20260623_083226_0fec98e2` exists but is empty: no `ro_input.txt`, `input.gz`, PBS package files, solver logs, `ro_output.txt`, or `result.json`.
- Reproducing the ro_input build against engine-server's configured local default DB raised `ValueError: scenario 577 not found`.
- The local F8 DB had zero `scenario` rows; the remote F8 DB contained scenario 577 (`YVR-FC-Ver2`, status `FAILED`, no `task_id`) and its scope resolved to 72 crew for `2026-06-01` through `2026-06-30`.

Evidence:
- User report in current debug conversation.
- `engine-server/logs/app.log.2026-06-23` lines 20-26: start request, JWT auth, task creation, `LegacyRO(db): generating ro_input from Postgres, scenario=577`, then `POST /api/optimize/start -> 502`.
- `engine-server/F8/ro_input_builder/context.py` raises `ValueError(f"scenario {sid} not found")` when `SELECT ... FROM scenario WHERE id = %s` returns no row.
- Temp ro_input probe against the local configured DB reproduced `ValueError: scenario 577 not found`.
- Remote DB probe proved scenario 577 exists and has a valid crew/window scope.

Known non-causes:
- Not browser-to-live-server reachability: engine-server received the run kickoff.
- Not PBS package generation: execution failed before PBS package download.
- Not solver execution: execution failed before `ro_input.txt` / `input.gz` were generated.
- Not result callback/load: no solver output existed to callback or load.

Open questions:
- Was the local engine process started without `LEGACY_RO_DB_URL` pointing at the same remote DB used by live-server?
- After aligning `LEGACY_RO_DB_URL`, does the next boundary pass PBS package generation and solver execution?

Next evidence to collect:
- Confirm the actual engine-server process environment includes `LEGACY_RO_DB_URL` for the same remote F8 DB used by `live-server/.env`.
- Re-run only after preserving old task evidence; verify workdir now contains `ro_input.txt` and `input.gz`, then continue boundary tracing through PBS package, solver, and callback.

Root cause:
- First failing boundary was engine-server ro_input DB lookup. `LegacyRO.db_url` resolved to the empty local F8 DB, while live-server/PBS were using the remote DB where scenario 577 exists. This DB source mismatch made ro_input generation fail with `scenario 577 not found`, which engine-server surfaced as `/api/optimize/start` HTTP 502 and live/UI surfaced as the run failure.
