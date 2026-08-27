# PBS Portal Regression Test Inventory

> 2026-06-05-194757 · route family `/fpqe/pbs`

## Summary

For the PBS Crew Portal at `http://localhost:5173/fpqe/pbs`, the current repository has:

- 11 Playwright E2E regression test cases under `e2e/tests/pbs-portal/`
- 405 PBS Portal unit/integration test cases under `pbs-portal/src/`
- 40 manual PBS test-case documents under `docs/test-cases/pbs/`

## E2E Regression Cases

| file | case count |
|---|---:|
| `e2e/tests/pbs-portal/auth.spec.ts` | 4 |
| `e2e/tests/pbs-portal/portal-smoke.spec.ts` | 3 |
| `e2e/tests/pbs-portal/schedule.spec.ts` | 4 |
| total | 11 |

## Counting Method

Commands used:

```bash
rg -n "^\s*test\(" e2e/tests/pbs-portal/*.spec.ts | wc -l
rg -n "^\s*(test|it)\(" pbs-portal/src --glob '!**/node_modules/**' | wc -l
find docs/test-cases/pbs -type f -name '*.md' | wc -l
```

## Notes

- The Vite base for PBS Portal is `/fpqe/pbs/`.
- The 11 E2E cases are the closest match to browser regression tests for the deployed route family.
- The 405 unit/integration cases are broader PBS Portal tests and do not all directly navigate to `/fpqe/pbs`.

