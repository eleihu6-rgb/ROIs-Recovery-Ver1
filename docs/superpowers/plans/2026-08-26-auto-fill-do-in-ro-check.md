# Plan — Auto-fill DO in `ro_check.py` (via the PBS solver's DO logic)

**Date:** 2026-08-26
**Target file:** `rule-engine-rs/ro-tests/ro_check.py`
**Status:** Design / plan (not yet implemented)

---

## 1. Goal

The PBS solver assigns a crew's **FLY** (flying pairings) and **RES** (reserve) duties,
then — as its **last step** — fills every remaining unoccupied day of the period with
**DO** (days-off) duties. We want `ro_check.py` (the F8 RO legality replay tool) to
optionally reproduce that final DO-fill so a crew's full line matches what the solver
actually emits.

behavioral change: `assignments.txt` gains a trailing parameter

```
auto-fill-do: Y
```

- `Y` → after the FLY/RES rounds settle, auto-fill the DO days for each checked crew.
- `N` (or absent) → current behavior, no DO auto-fill.

## 2. Hard constraints (must not be violated)

1. **Zero edits inside the PBS solver.** The only allowed interaction with
   `pbs-engine/` is read-only **import/call** of its public functions or the plain
   SQL-free data it returns. No code under `pbs-engine/ColumnModelSolver_python/**`
   may be modified.
2. Assignments file key is `auto-fill-do` (exact), value `Y`/`N` (case-insensitive).

## 3. What the investigation found (evidence)

### 3.1 Where the solver assigns DO

The solver core (`ColumnModelSolver.run`, `solver.py:184-191`) returns only FLY/RES
`Pairing`s. The **DO rows are invented after the solve**, by the exporter:

- `pbs-engine/ColumnModelSolver_python/io/result_converter.py`
  - `build_occupied_days(ctx) -> dict[str, set[date]]` — **line 375** (public). Marks
    occupied local days from `roster_ground_rows` (existing ground duties), `roster_input_rows`
    (fixed Roster pairings), and `result["assignment"]` (the solver FLY/RES choice).
  - `build_generated_dayoff_row(row_id, crew_id, day, ctx) -> list[str]` — **line 406** (public).
    Emits a full `REAL_ROSTER_FIELDS` row: `pairingId="0"`, `label="DO"`,
    `assignment="DO"`, `assignmentGroup="DO"`, `source="CR"`, whole local day
    `00:00:00–23:59:59`, `isLegal="true"`.
  - `append_generated_dayoff_rows(roster_rows, next_roster_id, ctx) -> int` — **line 474** (public).
    For every scenario day not in `occupied`, per crew, appends a generated DO row.
  - `build_context(ro_input_path, result) -> ExportContext` — **line 545** (public). Re-parses
    `ro_input.txt` (Scenario/Crew/CrewRank/CrewBase/Pairing/Roster/RosterGround/RuleParameter/
    Airport/…) and merges the `result` dict.
  - `local_day_range(start_text, end_text) -> list[date]` — **line 258** (public).

The entitlements/occ-day math lives in `core/proration.py`, `core/on_off_pattern.py`,
`core/do_start.py` and is used during **generation/legality**, not by the DO-row emitter.

### 3.2 Callability (the key result)

`result_converter.py` imports only `..core.do_start` and `..core.timezones` (`lines 15-16`).
It does **not** pull in the MIP model, `ColumnModelSolver`, `ColumnController`, pandas, or
the generator stack. So calling it is **lightweight** and free of solver-state coupling.

There is **no per-crew pure function** like `assign_days_off(crew, fly, res) -> [DO]`. The
public entry is whole-scenario: `build_context(ro_input, result)` then
`append_generated_dayoff_rows(rows, next_id, ctx)`. However, `append_generated_dayoff_rows`
iterates `ctx.result["crew_info"]` (`line 487`) → so **scoping to a subset of crews
is controlled entirely by which crew ids we put in `result["crew_info"]`.** Everything else
(crew rank/base, pairing times, ground, timezone, Rule-2015 do_start) is read from
`ro_input.txt` by `build_context`.

⇒ **Option A (call) is viable and clean** — no porting required — as long as we hand
`build_context` a minimal synthetic `result` dict.

### 3.3 ro_check.py integration points

- `parse_assignments(path)` at **`ro_check.py:1352-1393`** reads `assignments.txt`. It is
  **strict**: every block must open with `crew:` and the next line (if present) with
  `pairing:`. An `auto-fill-do:` line therefore **aborts** with `ValueError`. Insert an
  optional-key peeler **after the comment/blank filtering (`line 1359`) and before the
  strict `while` loop (`line 1362`)**.
- `run_check(...)` (defined **`ro_check.py:2969`**), called by `main()` (`3734`):
  - `bind_f8_rust_checker(ro_path, application)` → `checker`/`engine` built **once**
    (**`line 3272`**).
  - per-crew acceptance loop `for round_no, (cid, crew_pairing_ids) in enumerate(...)`
    (**`line 3383`**), inside it `engine.check_line(...)` (**`line 3445`**),
    `checker.can_add_complement`/`commit_complement` (`3487/3510`),
    `accepted[cid].append(cpid)` (`3513`).
  - final per-crew check loop `for cid in active_crew_ids:` (**`line 3540`**), builds
    `all_final_pids` = `crew_fixed_pids[cid] + accepted[cid]` (**`lines 3547-3561`**),
    then `engine.check_line(crew_idx, cand_idxs)` (**`line 3644`**).
- Ground duties are plain dicts built by `_parse_crew_ground` (**`lines 494-526`**):
  `start`/`end` (UTC ISO), `assignment`, `group`, `label`, `is_rest`. There is **no** crew
  roster dataclass and **no** MonthGrid. Day math uses `epoch()`/`date_ord()` and
  `rp_start`/`rp_end` (from `Scenario.strDtLoc/endDtLoc`, `lines 3088-3089`).

### 3.4 The one architectural fork

The Rust `Engine` is built **once** (`line 3272`) and its per-crew ground arrays
(`crew_ground_start/end/assignment/group/type/is_rest`) are **immutable after
construction**; `rois_rule_engine_rs` exposes **no** runtime add-ground API (only
`check_line`, `can_add_pairing_*`, `commit_pairing_*`).

The DO days are only known **after** the FLY/RES acceptance settles (they are the
complement of the accepted+fixed+existing-ground days). Therefore the auto-filled DO:

- **either** is a **rendering/output artifact** (add DO bars to the crew's line in the SVG
  / `final_data["ground"]`, matching what the solver exports) and does **not** feed the
  Rust legality model — **simple, no second engine build**;
- **or** must be present in the ground arrays at **engine construction** to affect
  legality (rules 7505 / 7507 / 1001 / DO-start) — which means **rebuilding the engine**
  (or building a second engine) with the computed DO rows injected into `RosterGround`
  **before** `bind_f8_rust_checker`, then running the **final** legality pass on it.

This is the decision that determines Option A vs. the amount of work; see §5.1 / §7.

---

## 4. Recommended approach — Option A: CALL the PBS function

Because the caller requirement is "make future solver changes automatically flow through",
and calling is verified clean & lightweight, **this is the preferred path.** No pbs-engine
edit; `ro_check.py` only imports two public functions.

### 4.1 Import (same `sys.path` mechanism already used for `ro_input_parser`)

`ro_check.py:53-67` already prepends `pbs-engine/ColumnModelSolver_python/io` to
`sys.path`. Add:

```python
from ColumnModelSolver_python.io.result_converter import (
    build_context,
    append_generated_dayoff_rows,
)
```

(Fallback to `import ColumnModelSolver_python.io.result_converter as _rc` then call
`_rc.build_context(...)` — whichever imports cleanly given the existing absolute-path
mechanism. `f8_official_engine.py:44-46` already imports `ColumnModelSolver_python.*` by
dotted name, proving the package path resolves.)

### 4.2 `assignments.txt` format + parser change

New format (the key trailing parameter is deliberately unobtrusive):

```
crew: 1256
pairing: 16183
auto-fill-do: Y
```

Change `parse_assignments` (`1352-1393`):

1. After `lines` is built (post `1359`), scan for the optional key **anywhere** (define:
   a line whose stripped text starts case-insensitively with `auto-fill-do:`):
   ```python
   auto_fill_do = False
   for j, ln in enumerate(list(lines)):
       if ln.lower().startswith("auto-fill-do:"):
           auto_fill_do = ln.split(":", 1)[1].strip().upper() == "Y"
           del lines[j]
           break
   ```
   (Remove it so the strict crew/pairing loop never sees it.)
2. Change the return type to `tuple[list[tuple[str, list[str]]], bool]` and return
   `(plan, auto_fill_do)`.
3. Update the caller `assignment_plan = parse_assignments(assignments_path)` (`line 3019`)
   to unpack `assignment_plan, auto_fill_do = ...`.
4. If the key is absent → `auto_fill_do = False` (identical to today).

### 4.3 Compute the DO rows by calling the solver

After the acceptance loop settles and we can build each crew's FLY/RES set, synthesise the
minimal `result` and call the solver once:

```python
# active_crew_ids = crews actually present in the engine (line ~3294)
crew_pids = {
    cid: list(crew_fixed_pids.get(cid, [])) + list(accepted.get(cid, []))
    for cid in active_crew_ids
}
solver_result = {
    "assignment": crew_pids,                                  # driver of build_occupied_days
    "crew_info":  {cid: {} for cid in active_crew_ids},       # scopes DO to the crews we check
}
ctx = build_context(ro_path, solver_result)
do_rows: list[list[str]] = []
append_generated_dayoff_rows(do_rows, 0, ctx)                 # fills complement days with DO
```

Parse `do_rows` (each is a `REAL_ROSTER_FIELDS` row) into a per-crew set of DO dates:

```python
crew_do: dict[str, set[date]] = defaultdict(set)
for row in do_rows:
    d = dict(zip(REAL_ROSTER_FIELDS, row, strict=False))
    if d.get("assignment", "").upper() == "DO" and d.get("crewId"):
        crew_do[d["crewId"]].add(date.fromisoformat(d["pairingDt"]))
```

Notes:
- `result["crew_info"]` scoping is what limits DO to just the checked crews.
- `pairing_info`/`preferences` may be **omitted**; `_merge_pairing_data`/`_merge_crew_data`
  tolerate missing keys (line 525-542 / 511-522 merge only if present).
- `next_roster_id` counts down; we only read the returned rows, so the negative ids are
  irrelevant.
- Rule 2015 DO Start is honoured automatically via `build_context` →
  `parse_do_start_min(...)` on `RuleParameter` (`line 646-654`) and
  `build_occupied_days` → `interval_overlaps_local_day` / `apply_do_start_occupy_end_tz`.

### 4.4 Where the DO gets applied

**Decision (confirmed 2026-08-26): this iteration does render-only; legality-aware is a
later follow-up.**

Hook = the **final per-crew loop** (`line 3540`), after `all_final_pids` is built
(`~3561`). For each checked crew, add the computed `crew_do[cid]` dates as DO ground
bars into `final_data["ground"]` — same dict shape as `_parse_crew_ground` output
(`assignment="DO"`, `group="DO"` (see §10 #3), `label="DO"`, full-day start/end).
Rust legality is **unchanged**.

Legality-aware upgrade (later): build a second engine by augmenting the `RosterGround`
rows with the DO rows **before** `bind_f8_rust_checker`, then run the final `check_line`
on that engine (see §7).

---

## 5. Fallback — Option B: port the DO logic into `ro_check.py`

If the call path proves unusable at runtime (e.g. `build_context` chokes on a shape we
can't synthesise, or the package path can't be imported in the pinned env), port it —
**still never editing pbs-engine.** The surface to copy is small and self-contained:

- `local_day_range(start_text, end_text)` (`result_converter.py:258`) — pure date range.
- `build_occupied_days` semantics (`375-403`) — reuse ro_check's already-parsed
  `crew_ground_tasks` (from `RosterGround`) + `crew_fixed_pids` + the accepted pairings;
  mark occupied local days via `epoch()`/`date_ord()` and the crew airport tz.
- `build_generated_dayoff_row` (`406-471`) — emit the DO row shape.
- For 2015 DO-start, port `apply_do_start_occupy_end_tz`/`parse_do_start_min`
  (`core/do_start.py:54/123`) if faithful occupied-day overlap is needed.

Porting means future pbs DO changes must be re-ported manually — the reason we prefer
Option A.

---

## 6. Verified unchanged: the pbs DO logic is public + callable

- `result_converter` imports only `core.do_start` + `core.timezones` (no solver stack).
- `append_generated_dayoff_rows` / `build_generated_dayoff_row` / `build_occupied_days` /
  `build_context` are all public (in `__all__`, `result_converter.py:68-91`).
- ro_check.py already proves the external-import mechanism (`ro_input_parser`, `line 67`),
  and `f8_official_engine.py` proves dotted `ColumnModelSolver_python.*` imports resolve.

---

## 7. The decision the user must confirm, and its risk

**Does the auto-filled DO need to influence the Rust legality check, or only appear**
**in the output/rendering?**

- **Render/output only** (low risk, fast): DO bars shown on the crew line; rules that read
  ground days (7505/7507/1001) are *not* re-evaluated against the DO. This is the smallest
  change and matches the fact that the solver itself treats DO as a final export-fill.
- **Legality-aware** (higher risk/effort): DO injected at engine construction (second engine
  build for the final pass) so days-off rules see the DO. Adds a second `bind_f8_rust_checker`
  call and a RosterGround augmentation, and changes the final-check semantics.

**Decision (confirmed 2026-08-26): start with render/output-only (Option A call).**

- **This iteration:** DO appears on the crew line; rules that read ground days
  (7505/7507/1001) are *not* re-evaluated against the DO. Smallest change, matches the
  solver treating DO as an export-fill.
- **Later (promoted when a downstream rule needs the DO days in the engine):** DO injected
  at engine construction (second engine build for the final pass). Adds a second
  `bind_f8_rust_checker` call + `RosterGround` augmentation; changes final-check semantics.

---

## 8. Verification plan

1. **Parser:** add the `auto-fill-do` key; unit-check `parse_assignments` returns
   `(plan, flag)` for `Y`/`N`/absent and that an unknown key still raises.
2. **Solver call:** run `ro_check.py` with `auto-fill-do: Y` on the existing
   `rule-engine-rs/ro-tests/ro_input.txt` + a small `assignments.txt`.
3. **Parity:** compare the emitted crew DO-day sets against the same crew's DO rows in a
   real solver `ro_output` (baseline from a captured solver run) — the occupied-days
   complement must match.
4. **No-regression:** run with `auto-fill-do: N`/absent → byte-identical behaviour to today.
5. **§4.4 vs N** branch: confirm legality path (if enabled) still reports the same
   FLY/RES violations as today, plus any newly-caught days-off violations on the DO line.

---

## 9. Files touched (implementation checklist)

| File | Change |
|------|--------|
| `rule-engine-rs/ro-tests/ro_check.py` | `parse_assignments` optional `auto-fill-do` + return signature; caller unpack; import `result_converter`; call `build_context`+`append_generated_dayoff_rows`; map DO→`crew_do`; feed final-loop rendering (and optionally a second engine). |
| `rule-engine-rs/ro-tests/assignments.txt` | add `auto-fill-do: Y` at the end (per run). |
| `pbs-engine/**` | **NO CHANGE** (read-only import/call). |

## 10. Decisions

1. **DO effect on legality:** **render/output-only for this iteration**; legality-aware is
   a documented follow-up (§7). (Confirmed 2026-08-26.)
2. **Scope of auto-fill-do:** only the crews present in `assignments.txt` (and which pass the
   engine-membership check, `active_crew_ids`). We pass exactly those ids in
   `result["crew_info"]` to scope the solver call. (Confirmed 2026-08-26.)
3. **Rendering label/group:** DO bars shown as `label="DO"`; decide whether `group="DO"`
   (solver's `assignmentGroup="DO"`) or `group="GRD"` (ro_check's existing `_RosterGround`
   semantics) — pick one to keep the SVG legend consistent.
