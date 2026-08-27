---
name: 105-compare-ruleset-params
description: Compare the 14 F8 legality rule parameters across the three stores — C++/MySQL (rule_parameter rows), Rust/PG (rule.param_json jsonb), and a baked ro_input_rule.txt — to verify the Rust ruleset can faithfully reproduce the C++ ro_input. Use when building/validating the Python→Rust rule-engine connector or when "send our rules to ro_input" parity is in question.
---

# Compare legality ruleset params across stores

Three representations of the same 14 F8 rules must agree for the Rust connector to reproduce
C++ legality. See memories [[mysql-rule-source-to-ro-input]], [[pg-rust-ruleset-103-vs-cpp-parity]].

| Store | Where | Param shape |
|---|---|---|
| C++ prod | MySQL `rois_f8_live_test` @ 47.253.173.207:33306 | `rule_parameter` rows: `param_names`=tableHeader/tableRowN, `param_values`=CSV |
| Rust dev | PG `rois` schema f8 @ 47.253.173.207:55432 | `rule.param_json` jsonb `{"tables":[{"header":[],"rows":[[]]}]}` |
| Baked input | `ro-engine/baseline/scenario-537/ro_input_rule.txt` | `params: KEY=VALUE, ...` lines (what the engine reads) |

## Gotchas (both bite)
- **PG `rule_set.rule_id` is the COMPOSITE code** (function‖instance, e.g. `8002006`), NOT `rule.id`.
  Join: `(r.function::text || lpad(r.instance,3,'0'))::bigint = rs.rule_id`. PG workset **103** =
  "PBS Solver Ruleset" = the 14 Rust rules (433 is the 14-rule default).
- **MySQL `function`/`class` are reserved words** → backtick them.
- Passwords are supplied per session — never store them in files/memory.

## Recipe
Drivers live in the solver venv: `pbs-engine/.venv`
(`uv pip install pymysql pg8000`). Normalize every row to a canonical `sorted(KEY.upper()=VALUE)`
tuple, then diff per ruleId:
- MySQL: zip `tableHeader` keys with each `tableRowN` values.
- PG: for each `param_json.tables[].rows[]`, `dict(zip(header,row))`.
- ro_input: parse each line's `params:` into a dict.

## Known parity result (2026-06-20, PG-103 vs C++-537)
- 8 identical: 2014014,7272001,7500002,7501004,7504003,8002006,8002009,8004004.
- 2 cosmetic key-label only: 7505002,7506002 (C++ `CREW TEAMS` vs PG `TEAMS`; values incl. 27-row
  MIN-DO bands identical). Normalize the teams key in the serializer.
- 4 real value diffs (change violations): 7502002 `ASSIGNMENT GROUPS` VAC|SBY↔LEA|SBY; 7503003
  `MAX CONSECUTIVE WOCLS` 3↔1; 8030004 `AGE DEFINE` 65↔35; 8056006 `SPACE` 13↔24 (the last three are
  deliberate migration-test tweaks). Reconcile to prod values for C++ parity.

## Serialization (param_json → ro_input Rule section) — PRODUCER EXISTS (2026-06-20)
Per rule, per table, zip header+row → UPPERCASE keys → ALPHA-SORT → one `params: KEY=VALUE, ...`
line per row. Prefix `ruleId:<composite> override-bility:.. source:.. func:000<function> severity:..
phase:.. class:.. description:.. params: ...`.

Implemented + validated in the snapshot (`PBS_column_based_algorithm/`):
- `ColumnModelSolver_python/io/ro_input_rule_writer.py` — `RuleMeta`/`RuleLine`,
  `rules_from_param_json(meta, tables)`, `serialize_lines`, and a reverse
  `parse_ro_input_rule` (diff oracle). **Byte-exact** template (real tabs after
  `{composite}` and `{func:08d}`; `   \t\t` before `params:`; trailing `, ` per line;
  file ends with `\n`).
- `ColumnModelSolver_python/io/pg_ruleset_to_ro_input.py` — loads PG workset
  (`rule` JOIN `rule_set` on composite=`rs.rule_id`, filter `rs.workset_id`),
  serializes, diffs vs a baseline. Run: `PG_PASSWORD=.. .venv/bin/python -m
  ColumnModelSolver_python.io.pg_ruleset_to_ro_input --workset 103 --baseline ..`.
- Tests: `tests/unit/test_ro_input_rule_writer.py` (4 passed) — round-trips the
  scenario-537 oracle byte-for-byte + reproduces it from `{header,rows}`.

**Schema notes** (PG f8): `rule` has `function,instance,class,description,source,
overridability,severity,param_json` — **no `phase` col** (baseline is uniformly
`phase:1`). `rule_set` membership col is **`workset_id`** (not `workset`).
`talbe` base index = 0 except **7500002 → 1** (carried in `_TABLE_INDEX_BASE`).

**Live diff result (PG-103 vs C++-537):** 51/51 lines. After the team-key fix
below, only **4 diffs remain** — the deliberate value tweaks (7502002 VAC↔LEA,
7503003 3↔1, 8030004 65↔35, 8056006 13↔24). Everything else byte-identical.

**param_json header keys are MIXED-CASE human labels** (`Crew Teams`, `Bases`,
`Min Do`…); the serializer `.upper()`s them. `rule.instance` is **varchar**
(`'002'`, not int 2). The team-key inconsistency was a real data bug: 7505002 &
7506002 (rule ids 28, 27) stored header `Teams` while 8056006 stored `Crew Teams`
→ uppercased to `TEAMS` vs `CREW TEAMS`. **FIXED in PG** (2026-06-20): patched
both headers `Teams`→`Crew Teams`, `updated_by='rust_serializer_teamkey'`. Fix
went in DATA, not the serializer (kept a faithful transform, no rule-id special-cases).
