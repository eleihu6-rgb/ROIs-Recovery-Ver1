---
name: 131-assignment-group-mapping
description: How ROIS models crew assignments → assignment groups, and how to reconcile the master tables (assignment, assignment_group, assignment_group_map) against the codes actually used in roster_flight. KEY FACT — the map is MANY-TO-MANY: one assignment can belong to MULTIPLE groups (e.g. DHD→FLY+GRD; VAC sits under GRD operationally). Triggers when the user mentions: "assignment group", "assignment_group_map", "assignment mapping", "reconcile assignments", "missing assignment", "roster_flight assignment values", or asks to make roster_flight codes resolve to master rows.
---

# Assignment ↔ Assignment-Group mapping (ROIS, f8 schema)

## The three master tables + the fact table

| table | role | natural key | notes |
|---|---|---|---|
| `assignment` | master list of duty/leave/etc. codes (FLT, VAC, RES, SIM…) | `assignment` (varchar) | 93+ rows; PK is `id` only, **no unique index on `assignment`** → guard inserts with NOT EXISTS |
| `assignment_group` | the higher-level buckets (FLT, GND, LVE, SBY, TRN, ADM, DHD + FLY/GRD) | `assignment_group` (varchar) | PK `id` only |
| `assignment_group_map` | **MANY-TO-MANY** join `assignment_id ↔ assignment_group_id` | (`id` PK only) | **no FK, no unique** on the pair → guard with NOT EXISTS |
| `roster_flight` | the fact table;每行 = crew × segment | — | has its own `assignment` + `assignment_group` *value* columns (by-value, **no FK** to the masters) |

`roster_flight.assignment` / `.assignment_group` store **codes directly** — there is **no
normalization layer**. `assignment_group_map` maps master→master (assignment_id→group_id),
it does **NOT** translate `FLY→FLT`. So roster data can reference codes absent from either
master, and nothing stops it.

## KEY FACT — one assignment can belong to MULTIPLE groups

`assignment_group_map` is many-to-many. The clearest live example: **`DHD` (deadhead) →
both `FLY` (positioning flight) AND `GRD` (ground-side deadhead)**. Likewise an assignment
like `VAC` can be modeled in more than one group depending on what the map is meant to
express. So when reconciling, do NOT assume a single group per assignment — preserve/allow
multiple rows per `assignment_id`.

## Two competing meanings of the map (decide WHICH before editing)

The same table can express either idea — they give different rows:

- **Operational grouping** (what group the item sits in on the gantt/roster): mirror
  `roster_flight` pairs exactly → `VAC→GRD`, `SIM→GRD`, `DO→GRD`, `DHD→FLY`+`DHD→GRD`,
  `FLY→FLY`.
- **Semantic taxonomy** (what *kind* of thing it is): `VAC→LVE`, `SIM→TRN`, `DO→LVE`,
  `DHD→DHD`. This is how the original 21 `system`-tagged rows were curated.

⚠️ The two diverge. The user's call for ROIS (2026-06-24) was **operational / roster-faithful**:
*"reflect this roster_flight mapping to our table."* When in doubt, ask which meaning, or check
what consumes the table (optimizer? gantt grouping?). Don't silently pick semantic — that was
the mistake that left `VAC→GRD` missing.

## Reconciliation recipe (make every roster_flight value resolve)

DB = **remote shared** demo DB. Connect via `live-server/.env` `DATABASE_URL`
(`postgresql://f8:***@47.253.173.207:55432/rois?...search_path=f8`) using node `pg`
(`require("dotenv").config()`); local `f8` schema is empty — never psql against localhost.

1. **Find gaps** — distinct `roster_flight.assignment` / `.assignment_group` LEFT JOIN the
   masters; anything with a null match is missing.
2. **Add missing master rows** — `INSERT … SELECT` modeled on the closest existing row
   (e.g. FLY mirror FLT; SFT mirror GRD), overriding only the differing columns; omit the
   `id` (identity); set `created_at/updated_at = now()`; tag `created_by` with a provenance
   stamp (e.g. `recon_YYYY-MM-DD`) so the additions are auditable/reversible. Guard with
   NOT EXISTS (no unique index).
3. **Fill the map** — decide operational vs semantic (above). For operational, the target
   set = `select distinct assignment, assignment_group from roster_flight` (10 pairs in the
   F8 data). Do deletes+inserts **in a transaction**, snapshot what you delete first.
4. **Verify** — set-diff `roster_flight` distinct pairs vs current map pairs: assert
   "in roster_flight but not in map = none" AND "in map but not in roster_flight = none"
   (scoped to roster-used assignments). Also assert each distinct `roster_flight.assignment`
   and `.assignment_group` resolves to a master row.

## F8 ground truth (2026-06-24, after reconciliation)

- `roster_flight.assignment` distinct (9): `DHD, DO, FLY, GRD, ILL, RES, SFT, SIM, VAC`
- `roster_flight.assignment_group` distinct (2): `FLY, GRD`
- The masters originally used `FLT`/`GND` (not `FLY`/`GRD`) and lacked `FLY`,`SFT`
  assignments → added `FLY`(Flight), `SFT`(Shift) to `assignment`; `FLY`,`GRD` to
  `assignment_group`.
- Map made roster-faithful (10 pairs): `FLY→FLY, DHD→FLY, DHD→GRD, DO→GRD, GRD→GRD,
  ILL→GRD, RES→GRD, SFT→GRD, SIM→GRD, VAC→GRD`. 18 non-roster `system` rows (PAX, FLT,
  IOE, SBY, leave/training/admin types) were **kept** (roster_flight says nothing about
  them; deleting risks other consumers).

## Consumers — why the map matters (real bug it fixed, 2026-06-24)

`assignment_group_map` is not decorative — it's the canonical "code → group" source the
recheck pipeline relies on:

- **Scenario result loader** (`live-server/src/services/scenario/scenario-result-loader.ts`):
  ground duties from the solver gz carried `assignment_group` per-CODE (VAC→'VAC'), unlike
  live (`f8.roster_flight` VAC→'GRD'). The loader now resolves the ground group from
  `assignment_group_map` (`loadGroundGroupMap`, prefer GRD else first non-FLY) so
  `scenario.roster_flight` mirrors live. Same fix in the manual `scripts/load-scenario-roster.mjs`.
- **8056 spacing recheck**: the rule's `Assignment Group B` is expressed in the live group
  taxonomy (e.g. `FLY|SBY|SIM|GRD`). If scenario stores ground as per-code, a pre-assigned
  **VAC overlapping a flight produced NO 8056 warning**. Two fixes shipped together:
  (1) loader makes scenario groups == live (VAC→GRD); (2) the recheck data builder
  (`flyByPairing`) pulls the group set from the latest `param_json` (Group A ∪ B, pipe-split)
  instead of a hardcoded `('FLY','SBY','SIM')`. Proven by Playwright **Scen-2046** (UI recheck
  of scenario 595 → crew 529 fires 8056) + core unit tests.

**Trap**: `scenario.roster_flight.assignment_group` is per-CODE (VAC/DO/SIM…), `f8.roster_flight`
is bucketed (FLY/GRD). Any rule whose param names GROUP codes must resolve scenario data
through the map (or the scenario loader must already have done so). Backfill an existing
scenario with `update scenario.roster_flight … set assignment_group = <map(code)> where
pairing_id is null` then re-run `scenario-legality.mjs <id>`.

## Gotchas

- No FK / no unique on any of these tables → you must guard inserts and you can create
  duplicates. ON CONFLICT won't help (no unique constraint).
- `assignment.default_assignment_group` can be **null** (GRD, ILL, VAC) or point to a
  **non-existent** group (`RES`'s default is `'RES'`, but there's no RES group) — don't
  rely on it resolving.
- Writes here are **data on a shared remote DB**, not schema. They are NOT in
  `sql/seed/03-assignment.sql`; a reseed drops them. Offer to persist to the seed file.
- These are 写操作 to shared infra — confirm semantics (operational vs semantic) before
  churning, and keep a deletion snapshot.
