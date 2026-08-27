---
name: 141-crew-seed-generator
description: Generate a batch of synthetic F8 crew (pilots: CA/FO) for a new base/fleet/nationality — auto-creates the airport/fleet/rank reference rows if absent, inserts crew + crew_base + crew_fleet + crew_rank, and validates by query. Use when asked to "add crew for a new country/base", "seed test crew", or "create N crew members" with a given id prefix, base, fleet, and nationality.
---

# 141 Crew Seed Generator

Idempotent generator for adding a themed batch of crew (new base + fleet + nationality) to
the `crew` data model described in `docs/architecture/data-model.md`. Built for the
2026-08-27 request: 40 UAE crew (`K1001`-`K1040`, DXB, A380) + 40 Ethiopian crew
(`T2001`-`T2040`, ADD, B787), on top of the existing Canadian (`YYZ`/`YVR`/... , 737) crew.

## What it touches

Per group, in order:

1. `airport` — inserts the base airport if the code doesn't exist yet (IATA code, ICAO,
   city, `dir` D/I, IANA `zone_id`, `utc_standard_offset` minutes, ISO-2 `country`).
2. `base` — inserts the crew-home-base reference row if absent (`filiale`, `base`, `name`
   = the 3-letter code per existing convention, `display_order` auto-appended). This is a
   **separate table from `airport`** — it's what the Gantt filter dialog's "Base" dropdown
   actually reads (`GET /api/base`, Redis-cached 24h). Skipping this step leaves the new
   base invisible in the UI dropdown even though the crew data is otherwise correct.
3. `fleet` — inserts the fleet code if absent (`display_order` auto-appended).
4. `rank` + `rank_position` — inserts CA/FO if absent (already present for F8 normally;
   the script is generic so a future country reusing this skill for a new division/rank
   still works).
5. `crew` — one row per crew member: `crew_id`, `first_name`, `last_name`, `gender`,
   `division='P'`, `empl_dt`, `nationality`, `filiale`, `status=0`.
6. `crew_base` (`is_prime_base=1`), `crew_fleet`, `crew_rank` (position looked up from
   `rank_position`, not hardcoded).

After seeding, flush the `base` cache so the new base shows up in the UI without waiting
out the 24h TTL:

```bash
redis-cli del dev:base:list dev:base:timezone-options dev:base:airport-timezones
```

(swap the `dev:` prefix for the target env's `REDIS_KEY_PREFIX` if not local dev).

Every crew insert is wrapped in its own transaction; the script checks `crew.crew_id`
first and **skips crew that already exist** — safe to re-run.

## Usage

```bash
cd live-server
set -a; source .env >/dev/null 2>&1; set +a   # loads DATABASE_URL for the target schema

# Dry run first — prints what would be created, touches nothing
node ../.agents/skills/141-crew-seed-generator/scripts/seed-crew.mjs \
  ../.agents/skills/141-crew-seed-generator/fixtures/uae-dxb-a380.json --dry-run

# Real run
node ../.agents/skills/141-crew-seed-generator/scripts/seed-crew.mjs \
  ../.agents/skills/141-crew-seed-generator/fixtures/uae-dxb-a380.json

node ../.agents/skills/141-crew-seed-generator/scripts/seed-crew.mjs \
  ../.agents/skills/141-crew-seed-generator/fixtures/ethiopia-add-b787.json
```

`DATABASE_URL`'s `search_path` decides which schema gets the rows (per
`docs/architecture/dev-db-schema-isolation.md` — never point this at anything but a local
dev schema; confirm `select current_schema()` first if unsure).

## Adding a new country/base (reuse for future onboarding)

Copy a fixture in `fixtures/` and change: `idPrefix`/`idStart` (must not collide with
existing `crew_id`s — check with the validation query below first), `base`, `fleet`,
`nationality`, `emplBaseDate`, and the `names.maleFirst` / `femaleFirst` / `last` pools
(keep names short/easy-to-read if the request asks for that). `caCount` splits the first
N crew as CA and the rest as FO — reorder `count`/`caCount` for a different split.

## Validate (run after seeding — don't just claim success)

```bash
cd live-server && set -a; source .env >/dev/null 2>&1; set +a
node -e "
import('pg').then(async ({default: pg}) => {
  const c = await new pg.Pool({connectionString: process.env.DATABASE_URL}).connect();
  const r = await c.query(\`
    select cb.base, cf.fleet_specific, cr.rank, c.nationality, count(*)::int n
    from crew c
    join crew_base cb on cb.crew_id = c.crew_id
    join crew_fleet cf on cf.crew_id = c.crew_id
    join crew_rank cr on cr.crew_id = c.crew_id
    where c.crew_id ~ '^[KT][0-9]+$'
    group by 1,2,3,4 order by 1,3\`);
  console.table(r.rows);
  process.exit(0);
});
"
```

Expect: `DXB / A380 / CA / AE` = 20, `DXB / A380 / FO / AE` = 20, `ADD / B787 / CA / ET` =
20, `ADD / B787 / FO / ET` = 20.

## Show on Gantt

Open the running Gantt frontend's Live roster, open the Filter dialog (Crew tab), and
either pick the new base from the "Base" multiselect or type the `crew_id`s (e.g. `K1001`)
into the "Crew ID" chip field (comma-separated — this brings matches to the top of the
roster panel rather than excluding everything else) and Apply. Confirm via
`window.__ganttTest.rosterPanel()` (Playwright: `readHook<{crewId,seniority}[]>(page,
'rosterPanel')`, polled with `expect.poll` since the fetch is async) that the new
`crew_id`s appear with the right rank/base, then screenshot per `115-gantt-playbook`.
Don't use the `roster()` hook for this — it returns a broader/unfiltered object set, not
the panel's current filtered rows.

## Gotchas

- `crew.nationality` is a free ISO-2 `varchar(2)`, not dictionary-driven — no `dictionary`
  row needed for a new country.
- `crew_fleet.fleet_specific` references `fleet.fleet` by value, no FK — a typo here won't
  raise a DB error, it'll just silently not match. Double-check the fixture's `fleet.code`
  matches what you queried for on Gantt.
- `airport.dir` is D (domestic) or I (international) **relative to the airline's home
  country** — F8's existing bases are all Canadian, so any new country's base is `I`.
- Existing crew_ids in this schema are plain numeric strings (`'999'`, `'96'`, ...) — an
  alphanumeric prefix (`K`/`T`) avoids collisions by construction, but always sanity-check
  with the validation query before picking a new prefix/range.
- `base.name` is `varchar(20)` — don't put the full airport name in it; existing rows just
  repeat the 3-letter code (`'YVR'` → `'YVR'`), the script follows that convention.
- If inserting into `base` throws `duplicate key value violates unique constraint
  "base_pkey"`, the table's identity sequence is behind `max(id)` (seen once in this dev
  schema, likely from an earlier seed that inserted explicit ids). Fix with:
  `select setval(pg_get_serial_sequence('base','id'), (select max(id) from base));`
  — this only touches sequence state, not data, and is safe to run.
