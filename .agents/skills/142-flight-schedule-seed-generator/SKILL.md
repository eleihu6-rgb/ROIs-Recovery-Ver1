---
name: 142-flight-schedule-seed-generator
description: Generate a themed batch of synthetic `flight` schedule rows (airline/fleet/route network over a date range), DST-aware local-to-UTC conversion, no real tail number (frontend groups by fleet). Use when asked to "seed a flight schedule", "add EK/ET flights", or "populate flight data for a route/date range" with a given airline, fleet, base, and routes.
---

# 142 Flight Schedule Seed Generator

Idempotent generator for adding a themed batch of `flight` rows (new airline/fleet/route
network) to the data model described in `docs/architecture/data-model.md`. Built for the
2026-08-27 request: Emirates (`EK`) A380 flights out of DXB, and Ethiopian Airlines (`ET`)
B787 + 737 flights out of ADD, for the full calendar range 2026-08-01 to 2026-09-30.

## Why synthetic data, not live scraping

The original ask was to fetch real schedules from FR24 or airline official sites via
Firecrawl. Rejected after investigation:

- Firecrawl's core repo is AGPL-3.0 (client SDK is MIT, but core isn't) — conflicts with
  CLAUDE.md's §信息安全规范 (MIT/Apache-2.0/ISC/BSD only). Moot once the user declined
  Firecrawl hosting entirely ("no need to get a key").
- Emirates' and Ethiopian's official schedule pages are JS-driven, one-route-at-a-time
  booking-search widgets, not bulk timetables. Emirates' `robots.txt` returned HTTP 403
  (Akamai bot protection); Ethiopian's `robots.txt` blocks the `booking.` subdomain and
  booking-flow paths. Scraping either risks ToS violation for a fragile, low-value result.
- Real-world constraint that applies regardless of source: airlines don't assign a specific
  aircraft tail to a future schedule slot until 1-3 days before departure. For "current
  Aug-Sep 2026" data (as-of 2026-08-27), only already-flown dates could ever have a real
  tail from any source — everything from 2026-08-28 onward is schedule-only. No source
  (scraped or synthetic) can produce real tails for the bulk of this date range.

Given both blockers, this skill builds realistic data modeled on each airline's real,
well-known route network (EK's A380 long-haul routes from DXB; ET's B787 long-haul + 737
regional routes from ADD) rather than scraping. `register` is deliberately left `NULL` for
every row — see "No tail number" below.

## What it touches

Only the `flight` table. Reuses existing reference data (no new rows needed for this
seed): `airport` (all 14 route endpoints already exist with `zone_id` populated), `fleet`
(`A380`, `B787`, `737` already exist).

Each fixture route generates two rows per date (outbound + inbound leg). Idempotent — the
script checks `flight_key` (`{flt_num}-{date}-{dep_arp}`) first and skips rows that already
exist, safe to re-run.

## DST-aware local-to-UTC conversion (important — read before editing `localToUtc`)

Airline schedules are published in **airport local time**; `flight.sch_dep_dt_utc` /
`sch_arv_dt_utc` must be **UTC**. `airport.utc_standard_offset` is a **fixed, non-DST**
offset and is **not used** for this conversion — it would be wrong by 1 hour for any zone
observing DST during Aug-Sep (e.g. `Europe/London` is BST +60 in August, not standard GMT
0; `America/New_York` is EDT -240, not standard EST -300).

Instead, `tzOffsetMinutesForDate()` computes the real per-date offset from `airport.zone_id`
(IANA zone name) via `Intl.DateTimeFormat(..., { timeZoneName: 'longOffset' })`, reading the
`"GMT+01:00"`-style string directly out of `formatToParts()`. Do **not** "simplify" this to
`new Date(instant.toLocaleString('en-US', { timeZone: zoneId }))` diffed against a UTC
version of the same trick — that round-trip silently reinterprets the locale-formatted
string using the **script runtime's own local system timezone**, corrupting the result (hit
this exact bug once while building this skill; only caught it because a Node process running
under `America/Vancouver` produced obviously-wrong times for zones it shouldn't have
touched at all).

Verified against three different DST behaviors for 2026-08-15 (epoch-based, see Validate
below): `Europe/London` (BST +1), `America/New_York` (EDT -4, both IAD and JFK), and
`Australia/Sydney` (AEST +10, no DST active in Southern-hemisphere winter) — all converted
correctly.

## No tail number — fleet grouping is intentional, not a gap

`register` is `NULL` for every seeded row (see the real-world constraint above — no source
could give a real tail for most of this range anyway). This is not a placeholder to fill in
later: `live-server`'s `flightService.listGrouped` (`src/services/flight/flight-service.ts`,
`groupFlights`/`packIntoRows`) already bin-packs flights lacking `register` by `fleet` into
the **fewest non-overlapping pseudo-tail rows**, chain-aware (prefers connecting
arrival-airport -> next departure-airport, like a real rotation), and names each sub-row
`{fleet}-{n}` (e.g. `A380-1`, `A380-2`, ...). This is server-side grouping the Gantt Flight
pane consumes directly — it is **not** the client-side `flight-store.ts` `upsertFlight`
fallback (that path only applies to incremental/websocket upserts, not the initial
`listGrouped` fetch).

Expect **more than one row per fleet** for a busy schedule: same-day legs across multiple
routes genuinely overlap in time, and a single pseudo-tail row can't hold two overlapping
flights, so the bin-packer opens additional `-2`, `-3`, ... rows as needed. Leaving
`register` null still satisfies "group as many flights as possible into one row" — just
bounded by that no-time-overlap constraint, not collapsed to a single flat row per fleet.

## Usage

```bash
cd live-server
set -a; source .env >/dev/null 2>&1; set +a   # loads DATABASE_URL for the target schema

# Dry run first — prints what would be created, touches nothing
node ../.agents/skills/142-flight-schedule-seed-generator/scripts/seed-flights.mjs \
  ../.agents/skills/142-flight-schedule-seed-generator/fixtures/ek-dxb-a380.json --dry-run

# Real run
node ../.agents/skills/142-flight-schedule-seed-generator/scripts/seed-flights.mjs \
  ../.agents/skills/142-flight-schedule-seed-generator/fixtures/ek-dxb-a380.json

node ../.agents/skills/142-flight-schedule-seed-generator/scripts/seed-flights.mjs \
  ../.agents/skills/142-flight-schedule-seed-generator/fixtures/et-add-b787-737.json
```

`--as-of=YYYY-MM-DD` (defaults to today) controls the `flight_flag` cutoff: dates on or
before it get `'A'` (already flown), dates after get `'S'` (scheduled).

## Adding a new airline/fleet/route network (reuse for future onboarding)

Copy a fixture in `fixtures/` and change `airline`, `base`, `dateRange`, and
`routes`/`fleets`. Two shapes are supported: a single `fleet` + `routes` (see
`ek-dxb-a380.json`) or multiple `fleets`, each with its own `routes`, sharing one
`airline`/`base` (see `et-add-b787-737.json`, B787 long-haul + 737 regional). Every airport
code referenced (`base` + every route's `otherAirport`) must already exist in the `airport`
table **with `zone_id` populated** — the script throws listing exactly which codes are
missing/incomplete rather than guessing an offset.

## Validate (run after seeding — don't just claim success)

Use `extract(epoch from ...)` for verification, not a raw `SELECT` read back into a JS
`Date` via node-postgres, and not `AT TIME ZONE`/`::text` casts. While building this skill,
ad-hoc verification queries against this local dev DB showed a raw node-postgres
`timestamptz` read and its own `AT TIME ZONE 'UTC'` cast disagreeing with each other on the
identical stored value, for both new and years-old pre-existing rows alike — a pre-existing
local-Postgres/driver display quirk unrelated to this skill's data (confirmed by checking
old F8 rows, seeded long before this work, which show the same disagreement). `epoch` is
the one extraction method that stayed internally consistent every time; it's what the query
below uses.

```bash
cd live-server && set -a; source .env >/dev/null 2>&1; set +a
node -e "
const pg = require('pg');
(async () => {
  const c = await new pg.Pool({connectionString: process.env.DATABASE_URL}).connect();
  const overall = await c.query(\`
    select airline, fleet, count(*)::int n, count(distinct flt_dt)::int days,
           min(flt_dt) first_dt, max(flt_dt) last_dt,
           count(*) filter (where register is not null)::int n_with_tail
    from flight where airline in ('EK','ET') group by 1,2 order by 1,2\`);
  console.table(overall.rows);
  const r = await c.query(\`
    select flt_num, flt_dt, dep_arp, arv_arp, extract(epoch from sch_dep_dt_utc) as epoch, blk_min
    from flight where flt_num in ('EK002','EK202','EK413','ET501','ET700') and flt_dt = '2026-08-15'
    order by flt_num\`);
  for (const row of r.rows) console.log(row.flt_num, row.dep_arp, '->', row.arv_arp, 'dep UTC =', new Date(Number(row.epoch)*1000).toISOString());
  process.exit(0);
})();
"
```

Expect: `EK/A380` = 732 (61 days x 6 routes x 2 legs), `ET/B787` = 366 (61 x 3 x 2), `ET/737`
= 488 (61 x 4 x 2); `n_with_tail` = 0 for every group. Spot-check example (2026-08-15): EK002
LHR->DXB dep 13:20 UTC (14:20 BST), EK202 JFK->DXB dep 02:45 UTC next day (22:45 EDT).

## Show on Gantt

Open the running Gantt frontend's Live Flight pane, filter to `EK` or `ET` (or the date
range Aug-Sep 2026), and confirm flights render as `A380-n` / `B787-n` / `737-n`
fleet-grouped pseudo-tail rows (no real tail) with correct UTC times. Screenshot per
`115-gantt-playbook`.

## Real SSIM loading (`scripts/load-ssim-flights.mjs`) — supersedes the ET synthetic seed

2026-08-27: ET was reloaded from a REAL SSIM file (`fixtures/ET-SSIM-01-30SEP26.TXT`,
Sabre AirFlite export, 6240 type-3 records, period 31AUG26-01OCT26). The synthetic ET
fixture (`et-add-b787-737.json`) is retired for ET — do not re-run it. EK/A380 synthetic
data is unaffected.

```bash
cd live-server && set -a; source .env >/dev/null 2>&1; set +a
node ../.agents/skills/142-flight-schedule-seed-generator/scripts/load-ssim-flights.mjs \
  ../.agents/skills/142-flight-schedule-seed-generator/fixtures/ET-SSIM-01-30SEP26.TXT \
  --replace [--dry-run] [--fleets=788,789,738,73W,7M8] [--airline=ET]
# then invalidate live-server caches (fleet list TTL is 24h):
redis-cli DEL dev:fleet:list && redis-cli --scan --pattern 'dev:flight:*' | xargs -r redis-cli DEL
```

Key facts (verified against the file + wcagreen/rusty-ssim MIT parser as column-map
reference — nothing vendored):

- **The type-2 carrier record's column 2 is the TIME MODE flag** — `2U...` = every time
  in the file is **UTC**, `2L...` = local station times. THIS file is `2UET` = UTC, so
  `ADD03050305+0300` means 03:05 UTC (= 06:05 ADD local; the `+0300` offsets derive
  local, and the loader uses them only to compute the local `flt_dt`). First loaded
  with the wrong (local) assumption — Ryan caught it via ET100's published 06:05 ADD
  departure. The loader now reads the flag and supports both modes; never assume.
- Each type-3 record = date range + days-of-week pattern (Mon=1..Sun=7) that expands to
  dated flights; `date_variation` (cols 193-194) day-offsets dep/arr vs the operating date
  (`00`/`01`/`11` in this file). Time `2400` = midnight *ending* the operating day and is
  paired with dv already naming the next day — map to 00:00 of the flagged day, never +1 again.
- Fleet filter default keeps only 787/737-family equipment present in the file:
  `788/789` (787-8/-9) + `738/73W/7M8` (737-800 / -800W / MAX 8) = 3442 records → 6812
  dated flights (31AUG26-03OCT26 after date variations). Dropped: `DH8`, `359`, `351`,
  `77W`, `77L`. Variant codes were added to the `fleet` reference table (grp `B787`/`737`),
  so flights carry the variant (e.g. `738`) and the Gantt fleet dropdown lists each variant.
- `--replace` deletes ALL `airline='ET'` flight rows first (transactional; verified no
  roster_flight/pairing_segment references existed).
- Identity sequences on this DB lag imported rows — loader `setval`-resyncs
  airport/fleet/flight before inserting (was a real `airport_pkey` collision).
- 6 airports were missing and auto-added (AWA, DSS, FBM, FIH, GGR, NBJ — NBJ is the new
  Luanda Agostinho Neto Intl). 31 rows are `flt_type='FRT'` (service type F freighters).
- Sanity signal worth remembering: under the wrong local-time reading, OUA→NIM (ET936)
  produced `blk_min=0` (09:35+0000 → 10:35+0100). Under the correct UTC reading it's a
  normal 60-min block — a zero-block leg is a red flag for misread time mode.
- E2E: `e2e/tests/gantt/flight-schedule-et-ssim.spec.ts` (cr.rois.one real-login config)
  + updated `flight-pane-fleet-filter.spec.ts` and `flight-schedule-ek-et-seed.spec.ts`.

## Gotchas

- `airport.utc_standard_offset` looks like the obvious field to use for local->UTC — it
  isn't; see the DST section above. Always go through `zone_id` + `Intl`.
- Route timing choices are illustrative (based on each airline's real published block
  times/schedules as of when this skill was written) — not live data, don't treat exact
  minute-level times as authoritative for anything beyond demo/test purposes.
- `flight.airline` isn't F8-exclusive — the table already carries other real IATA codes
  (`VR`, `DL`, `AC`, `WS`, ...), so inserting `airline='EK'`/`'ET'` directly matches existing
  convention; no relabeling needed.
- If re-running after changing a fixture's times, the old rows won't be touched (idempotent
  skip is by `flight_key`, not by content) — delete the affected `flight_key`s first if you
  need to regenerate with corrected times.
