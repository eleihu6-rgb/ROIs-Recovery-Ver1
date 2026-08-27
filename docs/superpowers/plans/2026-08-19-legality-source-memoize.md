# Legality Per-Pass Source Memoization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each read-only `source` accessor execute its DB query once per recheck pass (shared Promise across all 15 rules) so duplicate reference loads collapse, with byte-identical `rule_violation` output.

**Architecture:** Add a `memoizeSource(source)` wrapper in `legality-recheck-core.mjs` that memoizes each accessor by `name + stableArgs`, caching the returned Promise (entry evicted on rejection so failures retry like today). Wrap the incoming `source` at the top of `computeViolations` so every caller (live CLI, live-server paths, scenario, preview-draft) benefits with one change.

**Tech Stack:** Node.js ESM, `node:test` + `node:assert/strict` (runner: `node --test` glob; 2 existing files use Vitest), remote PostgreSQL, Rust `check-*` binaries.

## Global Constraints

- No change to any rule's matching/continuity/PA logic, row ordering, or kernel semantics.
- No change to any SQL or to the `source` adapter implementations (live/scenario adapters stay untouched).
- Persisted `rule_violation` rows must stay byte-identical and the `id` identity sequence unchanged (memo only dedupes identical queries — results are identical values).
- Cache lifetime is exactly one `computeViolations` call; no cross-pass/cross-request staleness.
- Cache key must distinguish arguments: `mandayMetricsByDay(365)`, `flyDuties(false)`, `qualificationFlightSegments({...})`, `rosterProperties({...})`, `baseQuals(crewIds)` all carry args; `1` and `"1"` must never collide.
- Failed accessor must not be cached (a later call retries), preserving today's failure semantics.
- Non-function properties on `source` (e.g. `db`) pass through untouched.

---

### Task 1: `memoizeSource` helper + unit tests (TDD)

**Files:**
- Modify: `live-server/scripts/legality-recheck-core.mjs` (add `memoizeSource` + `stableArgs` exports)
- Create: `live-server/scripts/__tests__/memoize-source.test.mjs`

**Interfaces:**
- Produces: `export function memoizeSource(source): object` — returns an object with the same keys; function props become memoized wrappers returning the same Promise for identical args; non-function props passed through.

- [ ] **Step 1: Write the failing test**

Create `live-server/scripts/__tests__/memoize-source.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { memoizeSource } from '../legality-recheck-core.mjs'

const makeFake = () => {
  const calls = { crewTeams: 0, crewQuals: 0 }
  const src = {
    db: { name: 'fake-db' },
    async crewTeams(flag) { calls.crewTeams++; return [{ team: 'A', flag }] },
    async crewQuals() { calls.crewQuals++; return [{ q: 1 }] },
  }
  return { src, calls }
}

test('memoizeSource: same args call the underlying accessor once and share the Promise', async () => {
  const { src, calls } = makeFake()
  const memo = memoizeSource(src)
  const [p1, p2] = [memo.crewTeams(false), memo.crewTeams(false)]
  assert.equal(calls.crewTeams, 1)
  assert.equal(p1, p2, 'callers share the exact same Promise')
  const [r1, r2] = await Promise.all([p1, p2])
  assert.equal(r1, r2, 'callers receive the exact same resolved value')
  assert.deepEqual(r1, [{ team: 'A', flag: false }])
})

test('memoizeSource: different args call the underlying accessor once each', async () => {
  const { src, calls } = makeFake()
  const memo = memoizeSource(src)
  await memo.crewTeams(false)
  await memo.crewTeams(true)
  await memo.crewTeams(false)
  assert.equal(calls.crewTeams, 2)
  assert.equal(calls.crewQuals, 0)
  await memo.crewQuals()
  await memo.crewQuals()
  assert.equal(calls.crewQuals, 1)
})

test('memoizeSource: number vs string args do not collide', async () => {
  const { src, calls } = makeFake()
  const memo = memoizeSource(src)
  await memo.crewTeams(1)
  await memo.crewTeams('1')
  assert.equal(calls.crewTeams, 2)
})

test('memoizeSource: non-function props pass through untouched', async () => {
  const { src } = makeFake()
  const memo = memoizeSource(src)
  assert.equal(memo.db, src.db)
  assert.deepEqual(memo.db, { name: 'fake-db' })
})

test('memoizeSource: a rejected Promise is evicted so a later call retries', async () => {
  let calls = 0
  const src = {
    db: null,
    async flaky() {
      calls++
      if (calls === 1) throw new Error('boom')
      return 'ok'
    },
  }
  const memo = memoizeSource(src)
  await assert.rejects(() => memo.flaky(), /boom/)
  assert.equal(await memo.flaky(), 'ok')
  assert.equal(calls, 2)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd live-server && node --test scripts/__tests__/memoize-source.test.mjs`
Expected: FAIL — `import { memoizeSource } from '../legality-recheck-core.mjs'` throws `SyntaxError: The requested module does not provide an export named 'memoizeSource'`.

- [ ] **Step 3: Implement `memoizeSource` + `stableArgs` in the core**

Add to `live-server/scripts/legality-recheck-core.mjs` (place near `runBin`, after the existing helpers):

```js
const stableArgs = (args) => args.map((a) => {
  if (a === null) return 'null:'
  if (a === undefined) return 'u:'
  const t = typeof a
  if (t === 'number') return `n:${a}`
  if (t === 'boolean') return `b:${a}`
  if (t === 'string') return `s:${a}`
  return `j:${JSON.stringify(a)}`
}).join('|')

export function memoizeSource(source) {
  const cache = new Map()
  const out = {}
  for (const key of Object.keys(source)) {
    const fn = source[key]
    if (typeof fn !== 'function') {
      out[key] = fn
      continue
    }
    out[key] = (...args) => {
      const ck = `${key}|${stableArgs(args)}`
      if (!cache.has(ck)) {
        const p = fn(...args)
        cache.set(ck, p)
        p.catch(() => { cache.delete(ck) })
      }
      return cache.get(ck)
    }
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd live-server && node --test scripts/__tests__/memoize-source.test.mjs`
Expected: `# pass 5` (all 5 tests PASS, 0 fail).

- [ ] **Step 5: Commit**

```bash
git add live-server/scripts/legality-recheck-core.mjs live-server/scripts/__tests__/memoize-source.test.mjs
git commit -m "feat(live-server): memoizeSource per-pass accessor caching + unit tests"
```

---

### Task 2: Wire memo into `computeViolations` + full regression + timing proof

**Files:**
- Modify: `live-server/scripts/legality-recheck-core.mjs` (`computeViolations`, currently ~L2285-2310)

**Interfaces:**
- Consumes: `memoizeSource` from Task 1.
- Produces: `computeViolations(source, ctx, onlyCodes)` still returns the same ordered array; each accessor on `source` now runs at most once per pass.

- [ ] **Step 1: Wrap the source at the top of `computeViolations`**

In `live-server/scripts/legality-recheck-core.mjs`, change the first two lines of `computeViolations` from:

```js
export async function computeViolations(source, ctx, onlyCodes) {
  const only = onlyCodes && onlyCodes.length ? new Set([...onlyCodes].map(String)) : null
```

to:

```js
export async function computeViolations(source, ctx, onlyCodes) {
  source = memoizeSource(source)
  const only = onlyCodes && onlyCodes.length ? new Set([...onlyCodes].map(String)) : null
```

- [ ] **Step 2: Run the unit suite to confirm no regression**

Run: `cd live-server && node --test scripts/__tests__/*.test.mjs`
Expected: all `node:test` files PASS (the 2 Vitest files are reported as failing under this runner — that is expected, see Step 3). Then run the 2 Vitest files:

Run: `cd live-server && npx vitest run scripts/__tests__/check-7505-gdo.test.mjs scripts/__tests__/legality-rp-window.test.mjs`
Expected: PASS (13/13).

- [ ] **Step 3: Run the real-data parity gate (byte-identical outputs)**

Run: `cd live-server && npm run verify:rule-batch-parity`
Expected: exit 0 — every batched rule's output deep-equals the legacy reference (rows identical, order identical).

- [ ] **Step 4: Timing proof — repeat queries collapse, median WALL drops**

Pre-req: rebuild Rust binaries so `assertFresh` does not abort (only needed if `rule-engine-rs/src` is newer than `target/release`):

```bash
cd rule-engine-rs && touch src/lib.rs && cargo build --release --bins
```

Re-measure the benchmark case (workset 103 / division P / June) 4 times with the query-timing preload:

```bash
cd live-server
for i in 1 2 3 4; do
  /usr/bin/time -f "WALL %e s" env RECHECK_PROFILE=1 \
    node --require /tmp/opencode/pg-timing-preload.cjs \
    scripts/live-legality.mjs --group 103 --from 2026-06-01 --to 2026-07-01 --division P \
    2>&1 | rg "recheck-profile\] rule7505|WALL|pg-sum"
done
```

Expected:
- `pg-sum` no longer lists the duplicate accessor queries (previously: `crewTeams` ×8, `crewQualEntries` ×7, `crewOffsets` ×7, `crewBaseTimezone` ×5, `flyDuties`/`assignmentsAll` ×2 each). They now appear once each.
- Median WALL below the pre-change median of **27.2s** (target ~23-24s). Report the 4 raw WALL values and the median in the commit message body.

- [ ] **Step 5: Confirm output rows are unchanged**

Run: `cd live-server && node scripts/live-legality.mjs --group 103 --from 2026-06-01 --to 2026-07-01 --division P`
Expected: same `rule_violation` rows as before the change (rule7505 count = 14 for this benchmark window on the remote DB; verify no NEW duplicate-insert `ON CONFLICT` rows appear and `updated_by` = `legality_recheck`).

- [ ] **Step 6: Commit**

```bash
git add live-server/scripts/legality-recheck-core.mjs
git commit -m "perf(live-server): memoize per-pass read-only source accessors in computeViolations"
```

---

## Self-Review

**Spec coverage:** 
- `memoizeSource` helper + stable args typing → Task 1 ✓
- Wire into `computeViolations` top → Task 2 Step 1 ✓
- Unit tests (same-arg once / diff-arg each / non-fn pass-through / failure retry) → Task 1 Step 1 ✓
- Real-data parity regression → Task 2 Step 3 ✓
- Timing proof with pg preload + 4× median → Task 2 Step 4 ✓

**Placeholder scan:** No TBD/TODO; every code step has full code; every run step has exact command + expected output. ✓

**Type consistency:** `memoizeSource` exported in Task 1 and imported/used in Task 2 with the same name and signature; `stableArgs` is module-private (not cross-task). ✓