# 8056 Crew Base Timezone Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep rule 8056 legality computation in UTC while formatting its warning-message timestamps in the crew base timezone effective at `gapStart`.

**Architecture:** Extend only the Scenario legality source so `flyByPairing()` can provide an optional timezone for each duty row, then teach `rule8056()` to use that optional timezone when formatting the human-readable message. Persisted UTC instants and all spacing arithmetic stay unchanged.

**Tech Stack:** Node.js `.mjs` scripts, PostgreSQL SQL in `pg` queries, `node:test`, Vitest

## Global Constraints

- Keep rule 8056 legality calculations in UTC.
- Keep persisted `start_dt` and `end_dt` as UTC instants.
- Use `crew_base` as the source of truth for crew base, not `roster_flight.base`.
- Fall back to `UTC` if the crew base timezone cannot be resolved.
- Do not add frontend parsing or new API / DB schema fields.

---

### Task 1: Lock The Regression With Tests

**Files:**
- Modify: `live-server/tests/unit/legality-recheck-core-param.spec.ts`
- Modify: `live-server/src/__tests__/services/scenario-seed-legality-source.test.ts`
- Test: `live-server/tests/unit/legality-recheck-core-param.spec.ts`
- Test: `live-server/src/__tests__/services/scenario-seed-legality-source.test.ts`

**Interfaces:**
- Consumes: `rule8056(source, ctx)`, `buildSeedSource(db, scenarioId, ctx)`
- Produces: failing coverage for `zone_id`-aware 8056 message formatting and seed-source timezone row shape

- [ ] **Step 1: Write the failing Vitest for timezone-aware 8056 message formatting**

```ts
it('formats 8056 warning timestamps in the duty row timezone while keeping UTC math', async () => {
  fakeBin('crew1\t9001\t1760914800\t1760922000\t120\tP1\tP2')
  const source = {
    flyByPairing: vi.fn().mockResolvedValue([
      {
        crew_id: 'crew1',
        pairing_id: 9001,
        start_secs: 900_000,
        end_secs: 1_000_000,
        label: 'P1',
        assignment_group: 'FLY',
        assignment: 'FLY',
        zone_id: 'America/Vancouver',
      },
    ]),
  }
  const ctx = {
    log: vi.fn(),
    instancesOf: (fn: number) => fn === 8056
      ? [{ instance: '001', header: ['Assignment Group A', 'Assignment Group B', 'Space', 'Unit'], rows: [['FLY', 'FLY', '24', 'RH']] }]
      : [],
  }

  const violations = await rule8056(source as never, ctx as never)

  expect(violations[0].message).toBe(
    'Rest between (P1 2025-10-19 16:00) and (P2 2025-10-19 18:00) is 2:00, which is below the required 24 RH.',
  )
})
```

- [ ] **Step 2: Write the failing fallback and source-shape tests**

```ts
it('falls back to UTC when the duty row has no timezone', async () => {
  fakeBin('crew1\t9001\t1760914800\t1760922000\t120\tP1\tP2')
  const source = {
    flyByPairing: vi.fn().mockResolvedValue([{ crew_id: 'crew1', pairing_id: 9001, start_secs: 1, end_secs: 2, label: 'P1', assignment_group: 'FLY', assignment: 'FLY' }]),
  }
  const ctx = { log: vi.fn(), instancesOf: (fn: number) => fn === 8056 ? [{ instance: '001', header: ['Assignment Group A', 'Assignment Group B', 'Space', 'Unit'], rows: [['FLY', 'FLY', '24', 'RH']] }] : [] }
  const violations = await rule8056(source as never, ctx as never)
  expect(violations[0].message).toContain('2025-10-19 23:00')
})

it('includes zone_id on 8056 seed legality rows', async () => {
  const rows = await source.flyByPairing(['FLY'], [])
  expect(rows[0]).toMatchObject({ zone_id: 'America/Vancouver' })
})
```

- [ ] **Step 3: Run tests to verify RED**

Run: `npm --prefix live-server test -- legality-recheck-core-param.spec.ts scenario-seed-legality-source.test.ts`

Expected: FAIL because `rule8056` still formats UTC and `buildSeedSource().flyByPairing()` does not return `zone_id`.

- [ ] **Step 4: Commit the failing-test checkpoint only if work is being split across sessions**

```bash
git add live-server/tests/unit/legality-recheck-core-param.spec.ts live-server/src/__tests__/services/scenario-seed-legality-source.test.ts
git commit -m "test: cover 8056 crew base timezone formatting"
```

### Task 2: Implement Scenario Timezone Resolution And Formatter

**Files:**
- Modify: `live-server/scripts/legality-recheck-core.mjs`
- Modify: `live-server/scripts/scenario-legality.mjs`
- Modify: `live-server/scripts/scenario-legality-source.mjs`
- Test: `live-server/tests/unit/legality-recheck-core-param.spec.ts`
- Test: `live-server/src/__tests__/services/scenario-seed-legality-source.test.ts`

**Interfaces:**
- Consumes: `source.flyByPairing(groups, codes)` returning rows with optional `zone_id`
- Produces: `rule8056()` message formatting that prefers `row.zone_id ?? 'UTC'`

- [ ] **Step 1: Add timezone-aware formatter helpers in `legality-recheck-core.mjs`**

```js
const formatDutyDateTime = (epochSeconds, zoneId = 'UTC') => {
  const d = new Date(Number(epochSeconds) * 1000)
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zoneId || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d)
    const get = (type) => parts.find((p) => p.type === type)?.value ?? ''
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
  } catch {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  }
}
```

- [ ] **Step 2: Thread `zone_id` from source rows into the 8056 message only**

```js
const rows = await source.flyByPairing(...)
const rowMetaByKey = new Map(rows.map((r) => [`${r.crew_id}\t${r.pairing_id}\t${r.start_secs}\t${r.end_secs}`, r]))

for (const [crewId, pairingId, gapStart, gapEnd, mins, curLabel, nextLabel] of runBin(...)) {
  const row = rowMetaByKey.get(`${crewId}\t${pairingId}\t${gapStartRowStart}\t${gapStartRowEnd}`) ?? null
  const zoneId = row?.zone_id || 'UTC'
  message: `Rest between (${curLabel} ${formatDutyDateTime(gapStart, zoneId)}) and (${nextLabel} ${formatDutyDateTime(gapEnd, zoneId)}) ...`
}
```

Implementation note: use the row iteration order already passed into the TSV to retain metadata alongside each emitted binary row; do not change the binary contract or UTC arithmetic.

- [ ] **Step 3: Resolve `zone_id` in Scenario `flyByPairing()` queries**

```sql
left join lateral (
  select coalesce(a.zone_id, 'UTC') as zone_id
    from f8.crew_base cb
    left join f8.airport a on a.airport = cb.base
   where cb.crew_id = rf.crew_id
     and cb.eff_dt <= max(rf.sch_end_dt_utc)
     and (cb.exp_dt >= max(rf.sch_end_dt_utc) or cb.exp_dt is null)
   order by cb.is_prime_base desc, cb.eff_dt desc
   limit 1
) tz on true
```

Implementation note: apply the same row shape in both `scenario-legality.mjs` and `scenario-legality-source.mjs` so normal Scenario runs and seed-scenario legality stay aligned.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `npm --prefix live-server test -- legality-recheck-core-param.spec.ts scenario-seed-legality-source.test.ts`

Expected: PASS

- [ ] **Step 5: Run the broader touched-area backend tests**

Run: `npm --prefix live-server test -- legality-recheck.spec.ts legality-recheck-core-param.spec.ts`

Expected: PASS

- [ ] **Step 6: Commit the implementation**

```bash
git add live-server/scripts/legality-recheck-core.mjs live-server/scripts/scenario-legality.mjs live-server/scripts/scenario-legality-source.mjs live-server/tests/unit/legality-recheck-core-param.spec.ts live-server/src/__tests__/services/scenario-seed-legality-source.test.ts
git commit -m "fix: format 8056 warning times in crew base timezone" -m "Rule 8056 still computes spacing in UTC, but Scenario warning messages now render timestamps in the crew base timezone effective at gap start, falling back to UTC when unresolved." -m "Co-Authored-By: Codex Opus 4.6 (1M context) <noreply@anthropic.com>"
```
