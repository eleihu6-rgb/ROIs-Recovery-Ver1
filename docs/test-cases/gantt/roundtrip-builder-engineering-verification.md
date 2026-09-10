# Round-trip Builder Engineering Verification

Date: 2026-09-09. Feature branch: `feat/gantt/roundtrip-pairing-builder`.
Public UI: https://cr.rois.one/altair/live

## Executed Commands

All commands below PASS on the final implementation:

| Working directory | Command | Result |
|---|---|---|
| gantt | `npx vitest run src/utils/__tests__/pairing-build-focus.test.ts` | 4 tests PASS |
| gantt | `npx tsc --noEmit` | PASS |
| gantt | `npm run build` | PASS; existing chunk-size/mixed-import warnings |
| live-server | `npx vitest run src/__tests__/services/pairing/roundtrip-chooser.test.ts src/__tests__/services/pairing/roundtrip-build.test.ts src/__tests__/services/pairing/roundtrip-routes.test.ts src/__tests__/services/pairing/pairing-build-service.test.ts` | 30 tests PASS |
| live-server | `npm run build` | PASS |
| live-server | `node scripts/roundtrip-read-smoke.cjs` | PASS; remote read-only queries and HTTP |
| live-server | `node scripts/audit-pairing-build-rules.mjs` | All six MANUAL pairing rules PASS |
| repository root | `npm run check:ui` | PASS; zero hard violations, 124 existing warnings |
| repository root | `git diff --check` | PASS |
| e2e | `npx playwright test --config=config/roundtrip-builder.config.ts` | PASS; ten real UI commits, 22 screenshots |
| e2e | `npx playwright test --config=config/roundtrip-builder.config.ts --grep RT-read-only` | PASS; 1 test in 7.5s, zero writes, six Ver2 screenshots |

## Retained Public-UI Acceptance Data

ADD, fleet 7M8, outbound 20 September 2026, searched 20-24 September UTC.

- Four-segment single-duty: 151836, 151837, 151838.
- Two-segment single-duty: 151839, 151840.
- Layover rotations: 151841, 151842, 151843, 151844, 151845.

Every build asserted latest ID at rendered row 1 and previous ID at row 2.
These pairings remain for inspection. Do not rerun the ten-write acceptance blindly.
See `roundtrip-builder-acceptance.md` and its archived JSON receipt for checkpoint data.

## Scope and Residual Limitations

The builder uses skill 143 base-loop/duty/rest rules; it is not a full regulatory
legality certification or a globally optimal pairing solver. The bounded greedy
chooser reports unmatched flights. Batch builds commit one rotation at a time and
stop on the first failure; prior commits remain. Lost-response replay is prevented
by coverage checks but does not return the original receipt. Refresh/search before
retrying an uncertain commit. Actual ten-write acceptance covers selected builds;
bulk orchestration has not been exercised with a real multi-write batch in this run.
The final read-only public run verified exact Build-all count, select/clear behavior,
scope invalidation, fleet defaults, loading close/reopen and all ten retained details.

Public access uses the existing local backend on 3000 and Gantt origin on 5567.
No Cloudflare tunnel configuration or unrelated running server was changed.

Development context was saved under `docs/dev-context/2026-09-09-gantt-roundtrip-pairing-builder.md`.
MemPalace indexing was unavailable because its local executable is not installed.
