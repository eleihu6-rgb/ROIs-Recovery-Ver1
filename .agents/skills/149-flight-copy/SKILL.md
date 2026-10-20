---
name: 149-flight-copy
description: Replicate real `flight` rows from a source month into one or more future months — a whole-month calendar shift (time-of-day preserved; source days absent from a shorter target month are skipped, not clamped) with NO duplicate flights. Use when asked to "copy flights", "replicate flights into the future", "copy historical flight data to Oct–Dec", "flight month copy", or populate a carrier's (e.g. ET/EK) schedule across a future date range. FLIGHT TABLE ONLY — not pairings/rosters.
---

# 149 Flight Copy

Copies `flight` rows from one calendar month into one or more later months, shifting every
datetime column by the whole-month delta (time-of-day preserved; source days absent from a
shorter target month — e.g. the 29th/30th going into February — are skipped, not clamped onto
the last target day). Built for the 2026-10-01 request: replicate
`ET` + `EK` flights from **Sep 2026** into **Oct 2026 → Mar 2027** with no duplicate flights.

## Scope — flights only (what this is NOT)

This touches the **`flight` table only**. It does **not** copy or create `pairing`,
`pairing_segment`, `pairing_composition`, or `roster_flight`.

- Need pairings carried along too? Use `data-migration/f8/live_pairing_month_copy.py`
  (pairing-driven; it only reproduces the flights a copied pairing references — in Sep 2026
  that was just 3588/6712 ET and 352/359 EK flights, so it is the wrong tool for "copy all
  the carrier's flights").
- Need brand-new synthetic flights from a route network? Use skill
  `142-flight-schedule-seed-generator`. This skill replicates **existing real rows**, not
  synthetic ones.

## How the copy is defined

- **Source selection**: `flight.sch_dep_dt_utc` within the source month, `airline` in the
  requested carrier list. No pairing/roster involvement.
- **Month shift**: `col + make_interval(months => N)` for every datetime column, where
  `N = (targetMonth − sourceMonth)`. Date columns are cast back to `date`.
- **End-of-month: skip, never clamp.** A source day that does not exist in the target month
  (e.g. Sep-29/30/31 → Feb) is **dropped**, not clamped onto the last target day. Clamping
  would collapse several source days of a daily flight onto one date and create duplicate
  keys (hit exactly this on the first Sep→Feb run: 240 duplicate Feb-28 rows). So shorter
  target months legitimately receive fewer flights.
- **Shifted columns**: all `timestamp`/`date` columns **except** `created_at`/`updated_at`
  (those are set to `now()`). Columns are discovered from `information_schema` at runtime, so
  the tool stays correct if the `flight` schema changes.
- **Forced on every copied row**:
  - `flight_flag = 'S'` — future dates are scheduled, not flown. (Source Sep rows were mostly
    `'S'` already, plus 122 stale `'A'`; the copy normalizes them.)
  - `interface_flt_id = NULL` — marks copied rows as non-NOC test data (matches the pairing
    tool's convention). Downstream code that assumes an external flight id must tolerate NULL.
  - `created_by = updated_by = 'flight-copy'`, `created_at = updated_at = now()` — so a copy
    batch is identifiable and removable (`WHERE created_by='flight-copy'`).
- **Everything else preserved**: `airline`, `flt_num`, `dep_arp`/`arv_arp`, `blk_min`,
  `fleet`, `register` (SSIM/EK rows are tail-less by design — see skill 142; server-side
  `listGrouped` bin-packs them into `{fleet}-n` pseudo-tails), `flight_assignment`
  (already `'FLY'` in source — do not need to re-set it), `voyage_status`, etc.

## Duplicate avoidance (the hard requirement)

No duplicate flight is ever created. Each candidate is inserted only via `WHERE NOT EXISTS`
against the dedup key:

> `airline` + `flt_num` + `dep_arp` + `arv_arp` + **shifted** `sch_dep_dt_utc`

Nullable match columns use `IS NOT DISTINCT FROM`. This makes the tool **idempotent** —
re-running the same source→targets inserts nothing the second time. It also safely absorbs
the ~183 Sep-ET/EK flights that already spilled into Oct 2026 (they are matched and skipped,
not duplicated). The per-month report prints `candidates / inserted / skipped_duplicate`.

## Identity-sequence resync (gotcha inherited from skill 142)

`flight.id` is `GENERATED ALWAYS AS IDENTITY`, but imported (SSIM/pairing-copy) rows can
leave the sequence lagging `max(id)`, which would collide on INSERT. The script `setval`s the
sequence to `max(id)` before inserting. `setval` is non-transactional, so it is applied even
in dry-run — advancing a sequence forward is always harmless.

## Usage

```bash
cd live-server
set -a; source .env >/dev/null 2>&1; set +a   # loads DATABASE_URL (points at the target schema)

# 1) DRY-RUN first (INSERTs then ROLLBACKs; writes nothing; prints real per-month counts)
node ../.agents/skills/149-flight-copy/scripts/flight-copy.mjs \
  --source-month=2026-09 --target-range=2026-10:2027-03 --airline=ET,EK --schema=f8_sit_live

# 2) EXECUTE (commits)
node ../.agents/skills/149-flight-copy/scripts/flight-copy.mjs \
  --source-month=2026-09 --target-range=2026-10:2027-03 --airline=ET,EK --schema=f8_sit_live --execute
```

`--target-months=2026-10,2026-12` is an alternative to `--target-range` for non-contiguous
months. `--schema` defaults to `$SCHEMA` then `f8_sit_live`.

### After a real `--execute`, invalidate live-server caches so the Gantt shows the rows

```bash
redis-cli DEL dev:fleet:list
redis-cli --scan --pattern 'dev:flight:*' | xargs -r redis-cli DEL
```

## Shared-DB caution (read before `--execute`)

`f8_sit_live` is the shared SIT schema teammates use. A full Sep→Oct..Mar ET/EK run adds
~42k flight rows into Oct 2026–Mar 2027. It is purely additive (dedup-protected, near-empty
target months), but coordinate first and never run it against UAT without the same check.
It is reversible: `DELETE FROM <schema>.flight WHERE created_by='flight-copy' AND sch_dep_dt_utc >= '<first target>-01'`
(confirm no `pairing_segment.flt_id` / `roster_flight.flt_id` reference the copied rows first —
by design nothing should, since this copies flights only).

## Validate (run after `--execute` — don't just claim success)

```bash
cd live-server && set -a; source .env >/dev/null 2>&1; set +a
node -e "
const pg=require('pg');(async()=>{
  const c=await new pg.Pool({connectionString:process.env.DATABASE_URL}).connect();
  const r=await c.query(\`select to_char(sch_dep_dt_utc,'YYYY-MM') ym, airline, count(*)::int n
    from f8_sit_live.flight where airline in ('ET','EK') and created_by='flight-copy'
    group by 1,2 order by 2,1\`);
  console.table(r.rows);
  const dup=await c.query(\`select count(*)::int dups from (
    select airline,flt_num,dep_arp,arv_arp,sch_dep_dt_utc from f8_sit_live.flight
    where airline in ('ET','EK') group by 1,2,3,4,5 having count(*)>1) x\`);
  console.log('duplicate flight keys (must be 0):', dup.rows[0].dups);
  process.exit(0);
})();"
```

Then open the Live Flight pane (per `115-gantt-playbook`), filter to `ET`/`EK` and a target
month, confirm flights render, and capture a versioned screenshot (§PW-Snapshot). Per
§User-Operation-Playwright-Required, a DB change that users see in the Gantt needs a real-UI
Playwright check against the configured target before it is "done".

## Gotchas

- **Month-shift preserves UTC wall-time, not local wall-time.** A flight at 06:00 local that
  crosses a DST boundary between source and target month will land 1h off in local terms.
  Acceptable for demo/test schedules; do not treat copied minute-level times as authoritative.
- Copies **operational `act_*`/`voyage_status` as shifted/as-is**. In Sep 2026 source data
  the `act_*` columns merely mirror scheduled times (SSIM-loaded, nothing actually flew), so
  this is harmless; if a future source month has real actuals, copied "future" flights would
  carry fake actuals — reset them if that matters.
- `flight.airline` is not F8-exclusive (`ET`, `EK`, `VR`, `DL`, … already coexist), so
  copying `ET`/`EK` matches existing convention.
