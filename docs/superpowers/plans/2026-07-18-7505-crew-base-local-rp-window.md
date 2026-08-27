# 7505 Crew Base Local RP Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make rule `7505` evaluate and persist rostering-period windows in each crew member's prime-base local time, and keep the verification script `check-7505-gdo.mjs` on the same semantics.

**Architecture:** Extract one small shared helper that computes a crew-local RP UTC window from `dateFrom`, `dateTo`, and a base offset. Use that helper in both the shared legality core and the `check-7505-gdo` script so the window math is defined in one place. Keep the Rust `7505` kernel unchanged; only change how JS groups crews, computes per-crew windows, and calls `check-7505`.

**Tech Stack:** Node.js ESM scripts, Vitest, existing `live-server` legality script infrastructure, Rust `check-7505` binary invoked via `spawnSync`

## Global Constraints

- Do not change the Rust `7505` counting kernel logic in `rule-engine-rs/src/lib.rs`.
- Do not redesign the broader timezone infrastructure used by other rules.
- Do not change frontend rendering, DTOs, DB schema, or Gantt UI components.
- Do not rewrite historical `rule_violation` rows in place.
- Do not convert this task into a generalized IANA-timezone rewrite for all legality rules.
- Reuse the existing offset-based pattern already used by other legality scripts.
- Live and Scenario must remain unified through the same shared legality core rule path.
- The warning message must still render `(${ctx.dateFrom}, ${ctx.dateTo})`.

---

## File Map

- Create: `live-server/scripts/legality-rp-window.mjs`
  - Pure helper for crew-local RP UTC window math and next-day label handling.
- Create: `live-server/scripts/__tests__/legality-rp-window.test.mjs`
  - Focused regression tests for Toronto/Vancouver June 2026 boundary math.
- Create: `live-server/scripts/__tests__/check-7505-gdo.test.mjs`
  - Focused tests for per-crew evaluation in the `check-7505-gdo` script path.
- Modify: `live-server/scripts/legality-recheck-core.mjs`
  - `rule7505()` switches from one UTC batch run to per-crew local-window runs.
- Modify: `live-server/tests/unit/legality-recheck-core-param.spec.ts`
  - Add failing regression for crew-specific `check-7505` spawn args and unchanged message text.
- Modify: `live-server/scripts/check-7505-gdo.mjs`
  - Reuse the shared helper and run per crew with crew-specific offsets and windows.

### Task 1: Shared Crew-Local RP Window Helper

**Files:**
- Create: `live-server/scripts/legality-rp-window.mjs`
- Test: `live-server/scripts/__tests__/legality-rp-window.test.mjs`

**Interfaces:**
- Produces:
  - `nextIsoDate(dateStr: string): string`
  - `crewLocalRpWindowUtc(dateFrom: string, dateTo: string, offsetMin: number): { startUtcSec: number; endUtcSec: number }`
- Consumed by later tasks:
  - `rule7505()` in `live-server/scripts/legality-recheck-core.mjs`
  - `evaluateCrewViolations()` in `live-server/scripts/check-7505-gdo.mjs`

- [ ] **Step 1: Write the failing helper test**

```js
import { describe, expect, it } from 'vitest'
import { crewLocalRpWindowUtc, nextIsoDate } from '../legality-rp-window.mjs'

describe('crewLocalRpWindowUtc', () => {
  it('computes the Toronto June 2026 local RP window in UTC', () => {
    expect(crewLocalRpWindowUtc('2026-06-01', '2026-06-30', -240)).toEqual({
      startUtcSec: 1_780_286_400, // 2026-06-01 04:00:00Z
      endUtcSec: 1_782_878_400,   // 2026-07-01 04:00:00Z
    })
  })

  it('computes the Vancouver June 2026 local RP window in UTC', () => {
    expect(crewLocalRpWindowUtc('2026-06-01', '2026-06-30', -420)).toEqual({
      startUtcSec: 1_780_297_200, // 2026-06-01 07:00:00Z
      endUtcSec: 1_782_889_200,   // 2026-07-01 07:00:00Z
    })
  })

  it('rolls an ISO day label forward without timezone drift', () => {
    expect(nextIsoDate('2026-06-30')).toBe('2026-07-01')
  })
})
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run: `npm --prefix live-server run test -- scripts/__tests__/legality-rp-window.test.mjs`

Expected: FAIL with module-not-found or missing export errors for `legality-rp-window.mjs`.

- [ ] **Step 3: Write the minimal helper implementation**

```js
const DAY_SEC = 86_400

export function nextIsoDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function crewLocalRpWindowUtc(dateFrom, dateTo, offsetMin) {
  return {
    startUtcSec: Math.floor(new Date(`${dateFrom}T00:00:00Z`).getTime() / 1000) - offsetMin * 60,
    endUtcSec: Math.floor(new Date(`${nextIsoDate(dateTo)}T00:00:00Z`).getTime() / 1000) - offsetMin * 60,
  }
}
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run: `npm --prefix live-server run test -- scripts/__tests__/legality-rp-window.test.mjs`

Expected: PASS with 3 passing assertions.

- [ ] **Step 5: Commit Task 1**

```bash
git add live-server/scripts/legality-rp-window.mjs live-server/scripts/__tests__/legality-rp-window.test.mjs
git commit -m "test: add 7505 crew-local RP window helper"
```

### Task 2: Convert Shared Legality Core `rule7505()` To Per-Crew Local Windows

**Files:**
- Modify: `live-server/scripts/legality-recheck-core.mjs`
- Modify: `live-server/tests/unit/legality-recheck-core-param.spec.ts`
- Consumes: `live-server/scripts/legality-rp-window.mjs`

**Interfaces:**
- Consumes:
  - `crewLocalRpWindowUtc(dateFrom: string, dateTo: string, offsetMin: number): { startUtcSec: number; endUtcSec: number }`
  - `source.crewOffsets(): Promise<Map<string, number>>`
  - `source.assignmentsAll(): Promise<Array<{ crew_id: string; code: string; s: number; e: number }>>`
- Produces:
  - `rule7505(source, ctx): Promise<Array<{ crew_id: string; pairing_id: number; start_dt: string; end_dt: string; message: string }>>`

- [ ] **Step 1: Add the failing `rule7505` regression test**

```ts
it('runs 7505 per crew with the crew-local RP UTC window while keeping dateFrom/dateTo in the message', async () => {
  fakeBin(`crew1\t1780286400\t1782878400\t3\t12\t1\tRP`)

  const source = {
    firstPairingByCrew: vi.fn().mockResolvedValue(new Map([['crew1', 9001]])),
    crewOffsets: vi.fn().mockResolvedValue(new Map([['crew1', -240]])),
    assignmentsAll: vi.fn().mockResolvedValue([
      { crew_id: 'crew1', code: 'DO', s: 1_780_286_460, e: 1_780_372_800 },
    ]),
  }

  const violations = await rule7505(source as never, ctx7505 as never)

  expect(violations).toHaveLength(1)
  expect(violations[0].start_dt).toBe('2026-06-01T04:00:00.000Z')
  expect(violations[0].end_dt).toBe('2026-07-01T03:59:59.000Z')
  expect(violations[0].message).toBe(
    'The number of days off(3) must be at least 12 in 1 RP (2026-06-01, 2026-06-30).',
  )
  expect(mockSpawn).toHaveBeenCalledWith(
    expect.stringContaining('check-7505'),
    ['--rp-start', '1780286400', '--rp-end', '1782878400', '--offset', '-240', '--emit-tsv'],
    expect.anything(),
  )
})
```

- [ ] **Step 2: Run the focused `rule7505` test to verify it fails**

Run: `npm --prefix live-server run test -- tests/unit/legality-recheck-core-param.spec.ts`

Expected: FAIL because `rule7505()` currently never calls `source.crewOffsets()` and still spawns `check-7505` with `--offset 0` and UTC-midnight RP bounds.

- [ ] **Step 3: Implement the minimal `rule7505()` change**

```js
import { crewLocalRpWindowUtc } from './legality-rp-window.mjs'

export async function rule7505(source, ctx) {
  const instances = ctx.instancesOf(7505)
  if (!instances.length) return []

  const pairingOf = await source.firstPairingByCrew()
  const offsets = await source.crewOffsets()
  const allAssignments = await source.assignmentsAll()
  const byCrew = new Map()
  for (const row of allAssignments) {
    const crew = String(row.crew_id)
    const list = byCrew.get(crew) ?? []
    list.push(row)
    byCrew.set(crew, list)
  }

  const out = []
  for (const inst of instances) {
    const ruleLines = build7505RuleLines(inst)
    for (const [crew, rows] of byCrew) {
      const pairingId = pairingOf.get(crew)
      if (!pairingId) continue
      const offsetMin = offsets.get(crew) ?? DEFAULT_OFFSET_MIN
      const { startUtcSec, endUtcSec } = crewLocalRpWindowUtc(ctx.dateFrom, ctx.dateTo, offsetMin)
      const activityLines = rows.map((r) => `A\t${r.crew_id}\t${r.code}\t${r.s}\t${r.e}\t${r.e}`)

      for (const [crewId, rpS, rpE, daysOff, minDo, period, unit] of runBin(
        'check-7505',
        ['--rp-start', String(startUtcSec), '--rp-end', String(endUtcSec), '--offset', String(offsetMin), '--emit-tsv'],
        [...ruleLines, ...activityLines].join('\n'),
      )) {
        out.push({
          crew_id: crewId,
          pairing_id: pairingId,
          start_dt: new Date(Number(rpS) * 1000).toISOString(),
          end_dt: new Date((Number(rpE) - 1) * 1000).toISOString(),
          message: `The number of days off(${daysOff}) must be at least ${minDo} in ${period} ${unit} (${ctx.dateFrom}, ${ctx.dateTo}).`,
        })
      }
    }
  }
  return out
}
```

- [ ] **Step 4: Run the focused legality-core tests to verify they pass**

Run: `npm --prefix live-server run test -- tests/unit/legality-recheck-core-param.spec.ts`

Expected: PASS, including the new `rule7505` spawn-argument regression.

- [ ] **Step 5: Commit Task 2**

```bash
git add live-server/scripts/legality-recheck-core.mjs live-server/tests/unit/legality-recheck-core-param.spec.ts
git commit -m "fix: evaluate 7505 in crew-local RP windows"
```

### Task 3: Align `check-7505-gdo.mjs` With Production `7505` Semantics

**Files:**
- Modify: `live-server/scripts/check-7505-gdo.mjs`
- Create: `live-server/scripts/__tests__/check-7505-gdo.test.mjs`
- Consumes: `live-server/scripts/legality-rp-window.mjs`

**Interfaces:**
- Consumes:
  - `crewLocalRpWindowUtc(dateFrom: string, dateTo: string, offsetMin: number): { startUtcSec: number; endUtcSec: number }`
- Produces:
  - `evaluateCrewViolations(args): Array<{ crewId: string; rpStart: number; rpEnd: number; daysOff: number; minDo: number; period: string; unit: string }>`
  - existing CLI JSON summary shape remains unchanged

- [ ] **Step 1: Add the failing script-level regression test**

```js
import { describe, expect, it, vi } from 'vitest'
import { evaluateCrewViolations } from '../check-7505-gdo.mjs'

describe('evaluateCrewViolations', () => {
  it('runs 7505 once per crew with each crew-local RP window', () => {
    const runEngine = vi
      .fn()
      .mockReturnValueOnce([{ crewId: 'yyz', rpStart: 1780286400, rpEnd: 1782878400, daysOff: 3, minDo: 12, period: '1', unit: 'RP' }])
      .mockReturnValueOnce([{ crewId: 'yvr', rpStart: 1780297200, rpEnd: 1782889200, daysOff: 4, minDo: 12, period: '1', unit: 'RP' }])

    const result = evaluateCrewViolations({
      bandLines: ['R\t12\t30\t30\t0\t1\tDO\tVAC\t1\t1\t1\tRP'],
      crewActivities: new Map([
        ['yyz', ['A\tyyz\tDO\t1780286460\t1780372800\t1780372800']],
        ['yvr', ['A\tyvr\tDO\t1780297260\t1780383600\t1780383600']],
      ]),
      offsets: new Map([['yyz', -240], ['yvr', -420]]),
      from: '2026-06-01',
      to: '2026-06-30',
      runEngine,
    })

    expect(runEngine).toHaveBeenNthCalledWith(1, expect.any(String), 1780286400, 1782878400, -240)
    expect(runEngine).toHaveBeenNthCalledWith(2, expect.any(String), 1780297200, 1782889200, -420)
    expect(result).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run the script-level test to verify it fails**

Run: `npm --prefix live-server run test -- scripts/__tests__/check-7505-gdo.test.mjs`

Expected: FAIL because `check-7505-gdo.mjs` currently exports no helper and still evaluates one shared UTC window with `--offset 0`.

- [ ] **Step 3: Implement the minimal script refactor**

```js
import { crewLocalRpWindowUtc } from './legality-rp-window.mjs'

export function evaluateCrewViolations({ bandLines, crewActivities, offsets, from, to, runEngine }) {
  const violations = []
  for (const [crewId, activityLines] of crewActivities) {
    const offsetMin = offsets.get(crewId) ?? 0
    const { startUtcSec, endUtcSec } = crewLocalRpWindowUtc(from, to, offsetMin)
    const tsv = [...bandLines, ...activityLines].join('\n') + '\n'
    violations.push(...runEngine(tsv, startUtcSec, endUtcSec, offsetMin))
  }
  return violations
}

function runEngine(tsv, rpStart, rpEnd, offsetMin) {
  const res = spawnSync(BIN, [
    '--rp-start', String(rpStart),
    '--rp-end', String(rpEnd),
    '--offset', String(offsetMin),
    '--emit-tsv',
  ], { input: tsv, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  // existing parse stays the same
}
```

Also update `main()` to:

```js
const offsets = await crewOffsets(c)
const crewActivities = groupActivityLinesByCrew(await activityRows(c, from, nextIsoDate(to)))
const viols = evaluateCrewViolations({ bandLines: band.lines, crewActivities, offsets, from, to, runEngine })
```

- [ ] **Step 4: Run the full targeted verification set**

Run:

```bash
npm --prefix live-server run test -- scripts/__tests__/legality-rp-window.test.mjs
npm --prefix live-server run test -- scripts/__tests__/check-7505-gdo.test.mjs
npm --prefix live-server run test -- tests/unit/legality-recheck-core-param.spec.ts
npm --prefix live-server exec -- tsc -p tsconfig.json --noEmit
```

Expected:

- all three test commands PASS
- `tsc --noEmit` PASS

- [ ] **Step 5: Commit Task 3**

```bash
git add live-server/scripts/check-7505-gdo.mjs live-server/scripts/__tests__/check-7505-gdo.test.mjs
git commit -m "fix: align 7505 verification script with crew-local RP windows"
```

## Self-Review Checklist

- Spec coverage:
  - crew-local RP evaluation: Task 2, Task 3
  - message remains `dateFrom/dateTo`: Task 2
  - `check-7505-gdo.mjs` aligned with production: Task 3
  - no Rust/kernel change: enforced by Global Constraints
- Placeholder scan:
  - no `TODO` / `TBD`
  - every task has concrete file paths, commands, and code snippets
- Type consistency:
  - `crewLocalRpWindowUtc()` returns `{ startUtcSec, endUtcSec }` in every task
  - `evaluateCrewViolations()` uses `runEngine(tsv, rpStart, rpEnd, offsetMin)` consistently

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-18-7505-crew-base-local-rp-window.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
