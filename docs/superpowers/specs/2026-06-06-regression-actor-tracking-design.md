# Regression Tab — Actor Tracking (creator / modifier / tester)

> Date: 2026-06-06
> Branch: feat/ai/date-range-tool
> Status: Approved

## Goal

The Regression tab versions tests and records run rounds, but nothing records *who* acted. Add three actor dimensions:

1. **Baseline creator** (`created_by`, test level) — all 158 existing imported tests are attributed to `AI`.
2. **Version modifier** (`modified_by` + optional `applied_by`, version level) — recorded whenever a change produces a new version.
3. **Tester** (`tester`, round level) — whoever kicked off the run that produced each round, async runs and manual rounds alike.

## Identity flow (chosen approach)

`X-User-Code` request header, trust-based (internal QA tooling; no auth verification):

- The dedicated regression axios client (`gantt/src/services/regression-api.ts`) gains a request interceptor that attaches `X-User-Code: <userCode>` from `useAuthStore` on every call. Omitted when not logged in.
- FastAPI regression routes read the header via `Header(default='User')` and pass it to the store as the acting identity.
- ai-server remains auth-free.

Rejected alternatives: per-request body fields (schema churn on every endpoint), real token validation against live-server (out of scope for an internal tool).

## Data model (ai-server JSON store)

### Test level

- New field `created_by: str`.
- Migration in `_load` normalization: any test missing `created_by` defaults to `'AI'` — this covers the 158 existing tests.
- New manual tests: `created_by = <X-User-Code>`.
- Importer-created tests: `created_by = 'AI'` (imported specs are AI-authored baseline).
- Existing `source` field is untouched.

### Version level

`_version_snapshot` gains `modified_by: str` and optional `applied_by: str`:

| Trigger | modified_by | applied_by |
|---|---|---|
| `created` (v1) | the test's `created_by` | — |
| `edit` (metadata PUT) | `X-User-Code` | — |
| `script` (apply-generated) | `'AI'` | `X-User-Code` |
| `import` (re-link) | `'AI'` | — |

Legacy versions without the field display as `—` in the UI; history is **not** backfilled.

### Round level

Each round gains `tester: str`:

- Async runs: `POST /regression/runs` captures the header; the runner stamps that tester on **every** round the run records (including retry/flaky rounds).
- Manual rounds (`POST /tests/{id}/versions/{v}/rounds`): tester from the same header.
- Legacy rounds without the field display as `—`.

## Frontend (gantt)

- `regression-api.ts`: request interceptor sets `X-User-Code` from `useAuthStore.getState()`.
- `types/regression.ts`: `created_by` on `RegressionTest`; `modified_by` / `applied_by?` on `RegressionVersion`; `tester?` on `RegressionRound`.
- Display — **detail panels only** (no main-table columns):
  - Version history rows: modifier chip next to the existing trigger chip (`AI` / `P10001`), plus `applied by <code>` when present.
  - Round rows: tester chip.
  - Info popover: `Created by: AI`.

## Testing

- **pytest (ai-server)**: migration defaults missing `created_by` to `'AI'`; per-trigger `modified_by` matrix; `applied_by` recorded on apply-generated; tester stamped by runner rounds and manual rounds; header absent → actor `'User'`.
- **Playwright (`e2e/tests/gantt/regression-page.spec.ts`)**: mocked detail payload asserts modifier chip text per version, `applied by` text, tester text per round, and creator line in the info popover — specific-value assertions per §Playwright-Required.

## Out of scope

- Auth verification of the header.
- Main-table "Modified by" / "Last tester" columns.
- Backfilling per-version modifier history for legacy data.
