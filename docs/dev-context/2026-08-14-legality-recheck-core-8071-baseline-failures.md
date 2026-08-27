# Resolved: legality-recheck-core 8071 baseline failures (2026-08-14)

Previously recorded as known failures while landing legality param Row Number.
Updated the two stale unit expectations to match current `rule8071` behavior:

1. **Message template** — assert `Roster Period […]: The number of matching rosters (12)…` (plus `Row 1:`), not the old `1CM window` wording.
2. **P lines** — assert epoch-second RP bounds (`P\t1780272000\t1782777600`), not day_ord (`P\t20605\t20634`). Note: `rule8002` still emits day_ord P lines.

## Verification

```bash
cd live-server
node --test --test-name-pattern='rule8071 maps F8|rule8071 forwards all' scripts/__tests__/legality-recheck-core.test.mjs
# expect: 2 pass
```
