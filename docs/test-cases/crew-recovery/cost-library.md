# Cost Library Test Report

Date: 2026-09-10

Scope: live-server calculator unit tests, cost-library route permission/validation tests, and PostgreSQL integration tests against the configured `live-server/.env` database/search_path.

## Commands

```bash
npm run build --prefix live-server
npm test --prefix live-server -- src/services/cost/cost-calculator.test.ts src/services/cost/cost-library-service.test.ts src/routes/cost/cost-library.test.ts
```

## Current Result

- `npm run build --prefix live-server`: PASS.
- `cost-calculator.test.ts`: PASS, 15 tests.
- `cost-library-service.test.ts`: PASS, 8 tests. PostgreSQL scratch rows are cleaned up and the test asserts zero marker leaks.
- `cost-library.test.ts`: PASS, 8 tests.
- Focused total: PASS, 31 tests.

## Coverage Notes

- Calculator coverage includes quantity, fixed, minimum, guarantee, standby, bands, booking, unpriced, disabled, saved-unit-price vs hourly-rate override, zero minimum quantity, strict revision validation, GH tier validation, and standby credit factors above 1.
- PostgreSQL coverage includes saved-revision calculation for all calculator families, missing-input `CostLibraryError(400)`, stale revision conflict, concurrent instance copies, protected instance deletion through set membership, protected template `001` deletion, stale set membership version conflict, duplicate/missing member revision rejection, shared set-copy pinned revisions, independent set-copy pinned revisions, internal standby GH remapping, and cleanup leak detection.
- Route coverage includes unauthenticated rejection, authenticated catalog read, non-admin mutation control rejection, `BTN_EDIT_META` requirement for instance metadata, admin mutation dispatch, request validation before persistence, typed calculate domain-error status 400, and unexpected calculate error sanitization as 500.
