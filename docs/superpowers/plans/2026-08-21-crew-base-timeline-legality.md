# Crew Base Timeline Legality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve crew base / UTC offset / IANA zone at the relevant instant (duty start or evaluation day) so calendar legality rules stay correct when `crew_base` changes mid-recheck window (UAT crew 755 / rule 7508).

**Architecture:** Keep `pickEffectiveCrewBase(rows, asOfDay)` as the single-day kernel. Add `buildCrewBaseTimeline` + `resolveOffsetAt` / `resolveZoneAt` helpers in `legality-recheck-core.mjs`. Live and scenario sources expose `crewBaseTimeline()` plus `resolveCrewOffset(crewId, utcSecs)`. Rule emitters prefer per-row `offset_min` when present, otherwise call `resolveCrewOffset` at duty start. Legacy `crewOffsets()` becomes window-midpoint fallback only.

**Tech Stack:** Node.js ESM (`live-server/scripts`), `node:test`, existing `check-7508` Rust bin (no bin contract change), PostgreSQL `crew_base` / `airport`.

**Spec:** `docs/superpowers/specs/2026-08-21-crew-base-timeline-legality-design.md`

## Global Constraints

- Do not change DO/RES stored timestamps.
- Do not change 7508 SDFD business definition.
- Keep static `BASE_OFFSET_MIN` / `DEFAULT_OFFSET_MIN` (no new DST tables).
- Prefer existing `r.offset_min` / `r.end_offset_min` on duty rows when finite.
- Live + scenario sources must stay aligned.
- TDD: failing test before implementation for each task that changes behavior.
- Touch only legality offset resolution paths (YAGNI).

## File map

| File | Responsibility |
|------|----------------|
| `live-server/scripts/legality-recheck-core.mjs` | Timeline helpers; rule emitters use resolve |
| `live-server/scripts/live-legality.mjs` | `crewBaseTimeline`, `resolveCrewOffset`, midpoint `crewOffsets` / `crewBaseTimezone` |
| `live-server/scripts/scenario-legality-source.mjs` | Same source contract |
| `live-server/scripts/scenario-legality.mjs` | Same if it still owns a duplicate source |
| `live-server/scripts/__tests__/crew-base-as-of.test.mjs` | Timeline + resolve unit tests; midpoint fallback |
| `live-server/scripts/__tests__/rule-7508-base-timeline.test.mjs` | New: 755-style 7508 offset wiring (mock source + capture bin input) |

---

### Task 1: Timeline helpers (pure)

**Files:**
- Modify: `live-server/scripts/legality-recheck-core.mjs` (near `pickEffectiveCrewBase` / `crewOffsetsFromBaseMap`)
- Test: `live-server/scripts/__tests__/crew-base-as-of.test.mjs`

**Interfaces:**
- Consumes: `pickEffectiveCrewBase`, `asOfDateOnly`, `BASE_OFFSET_MIN`, `DEFAULT_OFFSET_MIN`
- Produces:
  - `buildCrewBaseTimeline(rows) → Map<string, Array<{ effDay: string, expDay: string|null, base: string, isPrime: number }>>`
  - `resolveBaseAt(timeline, crewId, asOfDay) → string|undefined`
  - `resolveOffsetAt(timeline, crewId, asOfDay) → number`
  - `utcSecsToUtcDateOnly(utcSecs) → string` (`YYYY-MM-DD` from UTC calendar day of the instant — used as asOf probe day for segment lookup; document that duty-local day for SDFD remains the bin’s job using the resolved offset)
  - `midpointDateOnly(fromIso, toIso) → string|null`

- [ ] **Step 1: Write failing tests**

Append to `crew-base-as-of.test.mjs`:

```js
import {
  pickEffectiveCrewBase,
  crewOffsetsFromBaseMap,
  asOfDateOnly,
  buildCrewBaseTimeline,
  resolveBaseAt,
  resolveOffsetAt,
  midpointDateOnly,
} from '../legality-recheck-core.mjs'

const crew755Rows = [
  {
    crew_id: '755',
    base: 'YYZ',
    is_prime_base: 1,
    eff_dt: '2025-11-01',
    exp_dt: '2026-06-30',
  },
  {
    crew_id: '755',
    base: 'YEG',
    is_prime_base: 1,
    eff_dt: '2026-07-01',
    exp_dt: '2043-04-04',
  },
]

test('resolveOffsetAt follows 755 YYZ→YEG switch', () => {
  const timeline = buildCrewBaseTimeline(crew755Rows)
  assert.equal(resolveBaseAt(timeline, '755', '2026-06-30'), 'YYZ')
  assert.equal(resolveOffsetAt(timeline, '755', '2026-06-30'), -240)
  assert.equal(resolveBaseAt(timeline, '755', '2026-07-01'), 'YEG')
  assert.equal(resolveOffsetAt(timeline, '755', '2026-08-15'), -360)
})

test('resolveOffsetAt keeps 2314 on YYC in August (future YYZ does not win)', () => {
  const rows = [
    {
      crew_id: '2314',
      base: 'YYZ',
      is_prime_base: 1,
      eff_dt: '2026-12-01',
      exp_dt: '2056-02-14',
    },
    {
      crew_id: '2314',
      base: 'YYC',
      is_prime_base: 1,
      eff_dt: '2024-02-12',
      exp_dt: '2026-11-30',
    },
  ]
  const timeline = buildCrewBaseTimeline(rows)
  assert.equal(resolveOffsetAt(timeline, '2314', '2026-08-01'), -360)
  assert.equal(resolveOffsetAt(timeline, '2314', '2026-12-15'), -240)
})

test('midpointDateOnly averages window dates', () => {
  assert.equal(midpointDateOnly('2026-06-01', '2026-10-31'), '2026-08-16')
})
```

- [ ] **Step 2: Run tests — expect FAIL (exports missing)**

```bash
cd live-server && node --test scripts/__tests__/crew-base-as-of.test.mjs
```

Expected: FAIL importing or calling `buildCrewBaseTimeline` / `resolveOffsetAt`.

- [ ] **Step 3: Implement helpers**

```js
export function buildCrewBaseTimeline(rows) {
  const byCrew = new Map()
  for (const row of rows ?? []) {
    const crew = String(row.crew_id ?? '').trim()
    const base = String(row.base ?? '').trim()
    if (!crew || !base) continue
    const list = byCrew.get(crew) ?? []
    list.push(row)
    byCrew.set(crew, list)
  }
  const out = new Map()
  for (const [crew, list] of byCrew) {
    // Collect unique asOf boundaries from eff/exp days, then pickEffective per day —
    // OR store raw segments and resolve via pickEffectiveCrewBase(list, asOfDay) each call.
    // Preferred (DRY): do NOT expand segments; resolveBaseAt calls pickEffectiveCrewBase(list, asOfDay).
    out.set(crew, list)
  }
  return out
}

export function resolveBaseAt(timeline, crewId, asOfDay) {
  const rows = timeline.get(String(crewId)) ?? []
  return pickEffectiveCrewBase(rows, asOfDay).get(String(crewId))
}

export function resolveOffsetAt(timeline, crewId, asOfDay) {
  const base = resolveBaseAt(timeline, crewId, asOfDay)
  if (!base) return DEFAULT_OFFSET_MIN
  return BASE_OFFSET_MIN[base] ?? DEFAULT_OFFSET_MIN
}

export function midpointDateOnly(fromIso, toIso) {
  const a = asOfDateOnly(fromIso)
  const b = asOfDateOnly(toIso)
  if (!a || !b) return a ?? b
  const am = Date.parse(`${a}T00:00:00Z`)
  const bm = Date.parse(`${b}T00:00:00Z`)
  if (!Number.isFinite(am) || !Number.isFinite(bm)) return a
  const mid = new Date(Math.floor((am + bm) / 2))
  return mid.toISOString().slice(0, 10)
}

export function utcSecsToUtcDateOnly(utcSecs) {
  const n = Number(utcSecs)
  if (!Number.isFinite(n)) return null
  return new Date(n * 1000).toISOString().slice(0, 10)
}
```

Note: storing raw `crew_base` rows per crew and calling `pickEffectiveCrewBase` inside `resolveBaseAt` is enough — no need to pre-slice non-overlapping segments unless tests demand it. Name remains `buildCrewBaseTimeline` for the source cache Map.

Also add:

```js
export function resolveOffsetAtUtc(timeline, crewId, utcSecs) {
  const day = utcSecsToUtcDateOnly(utcSecs)
  if (!day) return DEFAULT_OFFSET_MIN
  return resolveOffsetAt(timeline, crewId, day)
}
```

Using **UTC date of the duty start** as asOf day is the agreed probe (bin still applies that offset to local midnights). Document in a one-line comment above `resolveOffsetAtUtc`.

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd live-server && node --test scripts/__tests__/crew-base-as-of.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add live-server/scripts/legality-recheck-core.mjs live-server/scripts/__tests__/crew-base-as-of.test.mjs
git commit -m "feat(legality): add crew_base timeline resolve helpers"
```

---

### Task 2: Live + scenario source wiring

**Files:**
- Modify: `live-server/scripts/live-legality.mjs` (`crewOffsets`, `crewBaseTimezone`, add timeline + resolve)
- Modify: `live-server/scripts/scenario-legality-source.mjs` (same)
- Modify: `live-server/scripts/scenario-legality.mjs` if it still defines its own `crewOffsets` / `crewBaseTimezone` (mirror live)

**Interfaces:**
- Consumes: `buildCrewBaseTimeline`, `resolveOffsetAtUtc`, `resolveBaseAt`, `midpointDateOnly`, `crewOffsetsFromBaseMap`, `pickEffectiveCrewBase`
- Produces on source object:
  - `async crewBaseTimeline() → Map`
  - `async resolveCrewOffset(crewId, utcSecs) → number`
  - `async resolveCrewTimezone(crewId, utcSecs) → string` (optional if zone map built)
  - `crewOffsets()` / `crewBaseTimezone()` → midpoint fallback

- [ ] **Step 1: Write failing test for source midpoint vs resolve**

Add to `crew-base-as-of.test.mjs` (pure test of intended source policy — no DB):

```js
test('midpoint fallback would be YEG for Jun–Oct window while June 15 resolve stays YYZ', () => {
  const timeline = buildCrewBaseTimeline(crew755Rows)
  const mid = midpointDateOnly('2026-06-01', '2026-10-31')
  assert.equal(resolveOffsetAt(timeline, '755', mid), -360) // Aug midpoint → YEG
  assert.equal(resolveOffsetAt(timeline, '755', '2026-06-15'), -240)
})
```

(This locks the policy before wiring.)

- [ ] **Step 2: Run test — PASS once Task 1 exists; if midpoint math wrong, fix helper first**

- [ ] **Step 3: Implement live source**

In `liveSource` (or equivalent factory) inside `live-legality.mjs`:

```js
let timelineCache = null
async function loadTimeline() {
  if (timelineCache) return timelineCache
  const rows = (await db.query(
    `select cb.crew_id, cb.base, cb.is_prime_base, cb.eff_dt, cb.exp_dt,
            coalesce(a.zone_id, 'UTC') as zone_id
       from f8.crew_base cb
       left join f8.airport a on a.airport = cb.base`,
  )).rows
  timelineCache = {
    timeline: buildCrewBaseTimeline(rows),
    zoneByBase: /* Map base → zone_id from rows */,
  }
  return timelineCache
}

async crewBaseTimeline() {
  return (await loadTimeline()).timeline
},

async resolveCrewOffset(crewId, utcSecs) {
  const { timeline } = await loadTimeline()
  return resolveOffsetAtUtc(timeline, crewId, utcSecs)
},

async crewOffsets() {
  const asOf = midpointDateOnly(fromIso, toExclusiveIso)
    ?? asOfDateOnly(fromIso) ?? asOfDateOnly(toExclusiveIso)
  const { timeline } = await loadTimeline()
  const out = new Map()
  for (const crew of timeline.keys()) {
    out.set(crew, resolveOffsetAt(timeline, crew, asOf))
  }
  return out
},

async crewBaseTimezone() {
  const asOf = midpointDateOnly(fromIso, toExclusiveIso)
    ?? asOfDateOnly(fromIso) ?? asOfDateOnly(toExclusiveIso)
  const { timeline, zoneByBase } = await loadTimeline()
  const out = new Map()
  for (const crew of timeline.keys()) {
    const base = resolveBaseAt(timeline, crew, asOf)
    out.set(crew, zoneByBase.get(base) ?? 'UTC')
  }
  return out
},
```

Match existing SQL column names (`is_prime_base` vs `is_prime` — use whatever live already queries).

Mirror the same pattern in `scenario-legality-source.mjs` (filter by scenario crew ids if the current query is scoped).

- [ ] **Step 4: Run existing as-of + a quick live unit if any**

```bash
cd live-server && node --test scripts/__tests__/crew-base-as-of.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add live-server/scripts/live-legality.mjs live-server/scripts/scenario-legality-source.mjs live-server/scripts/scenario-legality.mjs live-server/scripts/__tests__/crew-base-as-of.test.mjs
git commit -m "feat(legality): wire crewBaseTimeline resolve on live/scenario sources"
```

---

### Task 3: Shared duty-offset helper + rule 7508

**Files:**
- Modify: `live-server/scripts/legality-recheck-core.mjs` — add `async function offsetForDuty(source, crewId, startSecs, rowOffsetMin)` 
- Modify: `rule7508` D-line loop (~2081–2097)
- Create: `live-server/scripts/__tests__/rule-7508-base-timeline.test.mjs`

**Interfaces:**
- Consumes: `source.resolveCrewOffset`, fallback `source.crewOffsets`
- Produces: D-line `baseOffset` correct for 755-style mock

```js
async function offsetForDuty(source, crewId, startSecs, rowOffsetMin) {
  if (Number.isFinite(Number(rowOffsetMin))) return Number(rowOffsetMin)
  if (typeof source.resolveCrewOffset === 'function') {
    return source.resolveCrewOffset(String(crewId), Number(startSecs))
  }
  const offsets = source.crewOffsets ? await source.crewOffsets() : new Map()
  return offsets.get(String(crewId)) ?? DEFAULT_OFFSET_MIN
}
```

Cache: if a rule calls this in a tight loop, optionally pass a preloaded `resolve` closure from `await source.crewBaseTimeline()` once per rule invocation to avoid N loads (sources already cache).

- [ ] **Step 1: Failing test — capture check-7508 stdin offsets for crew 755**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { rule7508, buildCrewBaseTimeline, resolveOffsetAtUtc } from '../legality-recheck-core.mjs'

test('rule7508 D-line uses YEG offset for August duty when window from is June', async () => {
  const timeline = buildCrewBaseTimeline([
    { crew_id: '755', base: 'YYZ', is_prime_base: 1, eff_dt: '2025-11-01', exp_dt: '2026-06-30' },
    { crew_id: '755', base: 'YEG', is_prime_base: 1, eff_dt: '2026-07-01', exp_dt: '2043-04-04' },
  ])
  let captured = ''
  const source = {
    async crewOffsets() {
      // wrong legacy: window-start YYZ
      return new Map([['755', -240]])
    },
    async resolveCrewOffset(crewId, utcSecs) {
      return resolveOffsetAtUtc(timeline, crewId, utcSecs)
    },
    async crewBaseTimezone() { return new Map([['755', 'America/Edmonton']]) },
    async flyDuties() {
      return [{
        crew_id: '755',
        pairing_id: 0,
        start_secs: Date.parse('2026-08-17T06:01:00Z') / 1000,
        end_secs: Date.parse('2026-08-18T06:00:00Z') / 1000,
        is_rest: true,
        is_pre_assigned: true,
      }]
    },
    async groundWork() { return [] },
    // instancesOf / night defs: stub minimal so rule7508 builds params — copy pattern from existing 7508 tests if any
  }
  // If rule7508 needs full ctx.instancesOf(7508)+2014 night, either:
  // (a) export a small test hook that only builds D lines, or
  // (b) stub instancesOf + localNight the same way other rule tests do.
  // Prefer asserting via ctx.runBin capture:

  const ctx = {
    dateFrom: '2026-06-01',
    dateTo: '2026-10-31',
    instancesOf: (fn) => fn === 7508 ? [{
      instance: '001',
      header: ['Bases','Ranks','Fleets','Teams','Period','Unit','Duty Report','Duty Release','Duty End Buffer','Min Limits'],
      rows: [['*','*','*','*','672','RH','Y','Y','00:30','4']],
    }] : fn === 2014 ? [{ header: ['Local Night Start','Local Night End','Min Interval Hours'], rows: [['22:30','09:30','09:00']] }] : [],
    runBin: async (bin, args, input) => {
      captured = input
      return []
    },
    log() {},
  }

  await rule7508(source, ctx)
  const dLine = captured.split('\n').find((l) => l.startsWith('D\t755\t'))
  assert.ok(dLine, 'expected D line')
  const cols = dLine.split('\t')
  // D crew pairing start end first last baseOffset startRef endRef ...
  assert.equal(Number(cols[7]), -360, `expected YEG offset, got line=${dLine}`)
})
```

Adjust column index to match actual D-line layout in `rule7508`.

- [ ] **Step 2: Run — FAIL (still uses crewOffsets −240)**

```bash
cd live-server && node --test scripts/__tests__/rule-7508-base-timeline.test.mjs
```

- [ ] **Step 3: Switch rule7508 to `offsetForDuty`**

Replace:

```js
const baseOffset = Number.isFinite(Number(r.offset_min))
  ? Number(r.offset_min)
  : offsets.get(crew) ?? DEFAULT_OFFSET_MIN
```

with:

```js
const baseOffset = await offsetForDuty(source, crew, start, r.offset_min)
```

Preload once before the loop if needed. For message timezone, prefer `source.resolveCrewTimezone?.(crew, ws)` else `tzMap`.

Remove unused `const offsets = await source.crewOffsets()` if no longer needed.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add live-server/scripts/legality-recheck-core.mjs live-server/scripts/__tests__/rule-7508-base-timeline.test.mjs
git commit -m "fix(7508): resolve crew base offset at duty start"
```

---

### Task 4: Migrate remaining calendar / offset rules

**Files:**
- Modify: `legality-recheck-core.mjs` — `rule7501`, `rule7503`, `rule7504`, `rule7505`, `rule7506`, `rule7507`, `rule7305`, and `rule1001` if it uses `crewOffsets` for day bounds; `rule8002` / `rule8056` timezone maps via resolve when cheap.

**Interfaces:**
- Consumes: `offsetForDuty` / `resolveCrewOffset`
- Produces: all D/C lines that previously used `offsets.get(crew)` now resolve at duty start (or evaluation day)

- [ ] **Step 1: Grep and list call sites**

```bash
rg -n "crewOffsets\\(|offsets\\.get\\(" live-server/scripts/legality-recheck-core.mjs
```

For each hit in rules listed above, replace fallback with `offsetForDuty` (or day-level `resolveOffsetAt` when the code iterates calendar days without a duty row).

- [ ] **Step 2: Add one focused regression test per high-risk rule if no existing stub**

Minimum: extend the 7508-style capture test pattern for **7501** OR assert `offsetForDuty` unit-level with mock source (lighter). Prefer one shared test:

```js
test('offsetForDuty prefers row offset then resolveCrewOffset then crewOffsets', async () => {
  // three asserts
})
```

Export `offsetForDuty` for testing **or** test via rule capture only (keep YAGNI — if not exported, test only via 7508 + grep migration).

- [ ] **Step 3: Implement migrations**

Same replacement pattern as 7508. For 7505/7507 day loops without duty rows, use:

```js
const off = typeof source.resolveCrewOffset === 'function'
  ? await source.resolveCrewOffset(crew, dayStartUtcSecs)
  : (await source.crewOffsets()).get(crew) ?? DEFAULT_OFFSET_MIN
```

- [ ] **Step 4: Run broader tests**

```bash
cd live-server && node --test scripts/__tests__/crew-base-as-of.test.mjs scripts/__tests__/rule-7508-base-timeline.test.mjs scripts/__tests__/legality-recheck-core.test.mjs
```

Fix any assertions that assumed window-start `crewOffsets()`.

- [ ] **Step 5: Commit**

```bash
git add live-server/scripts/legality-recheck-core.mjs live-server/scripts/__tests__
git commit -m "fix(legality): resolve base offset at duty/day for calendar rules"
```

---

### Task 5: Docs + UAT verification notes

**Files:**
- Modify: spec status line to `Implemented` when done (optional in this task)
- No product UI docs required

- [ ] **Step 1: After code merge locally, recheck UAT 7508 for crew 755** (ops; needs credentials)

```bash
# on coreserver with UAT live-server env, or local DATABASE_URL → f8_uat_live
node scripts/live-legality.mjs --group 103 --from 2026-06-01 --to 2026-10-31 --division P --rules 7508
```

SQL expect: no Row2 for crew 755 with `limit_value=4` and message window `2026-08-09`…`2026-09-06`.

- [ ] **Step 2: Commit any test fixes from UAT learnings**

```bash
git commit -m "test(legality): harden base timeline cases from UAT 755"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Timeline helpers + pickEffective kernel | Task 1 |
| Live/scenario `crewBaseTimeline` + resolve | Task 2 |
| Midpoint legacy `crewOffsets` | Task 2 |
| 7508 D-line + message zone | Task 3 |
| All calendar rules 7501/3/4/5/6/7, 7305, 1001 | Task 4 |
| 8002/8056 TZ | Task 4 (optional same PR) |
| Tests 755 + 2314 | Task 1 + 3 |
| UAT acceptance 755 Row2 gone | Task 5 |
| Supersede 2026-08-10 | Already committed with spec |

No TBD placeholders. `offsetForDuty` / `resolveOffsetAtUtc` names are consistent across tasks.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-21-crew-base-timeline-legality.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session with executing-plans and checkpoints  

Which approach?
