# Plan — Make DO-fill's Rule-2015 read use the engine's RuleSet-scoped logic

**Date:** 2026-08-26
**Scope:** pbs-engine (constraint to *not* touch pbs-engine is **lifted** for this change)
**Status:** Design / plan (no code changed yet)

---

## 1. Goal

Make the DO-fill's Rule 2015 ("DO Start Time") reading use **the same logic the engine
uses to read rules**: *Scenario → RuleSet → selected rule instances → their parameter
rows*. Concretely, the exporter (`io/result_converter.build_context`) must compute
`do_start_min` from the **active rule plan** (`rules/common/resolver.resolve_active_rule_plan`),
exactly like the Rust engine builder does, instead of reading raw `RuleParameter` rows and
taking the first 2015 `tableRow`.

## 2. Why (evidence of the current gap)

- **Scenario** selects `ruleSetId = 637`.
- **RuleSet 637** rows: `7506003, 8056003, 7504001, 2015002` → it activates the **CC**
  instance `2015002` (Start Time = **00:00**). It does **not** include `2015001` (FD = 01:00).
- **Engine side does it right**: `build_engine` (`rules/rust/engine_builder.py:89-99`) builds
  `rule_sections = _sections_for_active_plan(sections, active_rule_plan)` and
  `extract_rule_params(...)` reads only RuleSet-selected instances. `resolve_active_rule_plan`
  (`rules/common/resolver.py:21`) is the single source of that selection.
- **DO-fill does it wrong**: `build_context` (`io/result_converter.py:646-653`) calls
  `parse_do_start_min(...)` over **raw** `RuleParameter` rows. `parse_do_start_min`
  (`core/do_start.py:123`) filters `ruleId.startswith("2015")` and keeps only the **first**
  `tableRow` in file order → `2015001` = **01:00** → `do_start_min = 60`, ignoring RuleSet 637.
- **Consequence**: engine says 2015 = 00:00, DO-fill says 01:00 → mismatch. Under 01:00 a
  crew-440 duty releasing between 00:00–01:00 local is clamped to the previous day, so Aug 5
  looks free → wrongly filled DO. Verified: `do_start_min=60` → Aug-5 free (DO);
  `do_start_min=0` → Aug-5 occupied (no DO).
- Same unscoped read also exists in `rules/internal/params._apply_do_start`
  (`rules/internal/params.py:534-561`), the legacy internal checker.

## 3. Design — reuse `resolve_active_rule_plan` for the 2015 read

Introduce one shared helper in pbs-engine that resolves the **selected** 2015 instance(s)
and returns the DO Start Time minutes, then use it in every consumer.

### 3.1 New helper (in `core/do_start.py` or `rules/common/resolver.py`)

```python
def active_do_start_min(sections) -> int:
    """Rule 2015 'DO Start Time' minutes, scoped to the active RuleSet (engine logic).

    Resolution: Scenario.ruleSetId -> RuleSet rows -> Rule instances -> parameter rows.
    Falls back to the legacy raw first-tableRow read only when no RuleSet is exported
    (keeps pre-2015 files unchanged). Returns 0 when 2015 is absent/unparsable.
    """
    plan = resolve_active_rule_plan(sections)          # engine's selection
    rows: list[tuple[str, str, str]] = []
    found = False
    for inst in plan.instances:
        if inst.function != "2015":
            continue
        found = True
        for pr in inst.parameter_rows:                 # RuleParameterRow(rule_id, name, values)
            rows.append((pr.rule_id, pr.name, pr.values))
    if not found:                                      # rule set selects no 2015 instance
        return 0
    return parse_do_start_min(rows)                    # existing Start-Time parser, now scoped
```

Notes:
- `plan.instances[i].function` is uppercased in `_rule_definitions` (`resolver.py:156`).
- `parse_do_start_min` keeps its Start-Time/`tableHeader`/`tableRow` parsing; we only change
  **which rows** it gets (the active instance's rows instead of every `2015*` row). Because
  rows now come from one instance (`2015002`), the "first tableRow" ambiguity disappears.
- The all-or-nothing ambiguity (multiple 2015 instances active) should warn, as `parse_do_start_min`
  only reads the first; if a RuleSet legitimately activates >1 2015 instance, add a `warn`
  policy like `extract_rule_params` uses.

### 3.2 Feed it engine-compatible sections (the only mechanical impedance)

`resolve_active_rule_plan(sections)` reads via `rules.common.resolver._rows(sections,name)`,
which needs each section object to expose `.rows` as **list[dict]** (or a `.to_dict()` DataFrame).
`build_context` currently builds `parse_sections(path)` → `{name: {"fields": [...], "rows": [[...list-of-lists...]]}}`,
whose `.rows` are **lists of lists** → incompatible with `_rows`.

So `build_context` must hand the resolver a compatible view. Two clean options:

- **A (adapter, minimal):** wrap the already-parsed sections into a resolver-compatible
  shape for exactly the sections the resolver needs (`Scenario`, `RuleSet`, `Rule`, `Rule(ALL)`,
  `RuleParameter`, `RuleParameter(ALL)`), converting `rows_as_dicts(...)` into
  `{name: SimpleNamespace(rows=[dicts])}`. Cheap, no double parse.
- **B (unify parser):** make `build_context` reuse the engine's `load_from_ro_input` for the
  rule-resolution sections. Cleaner long-term but touches the exporter's data flow more.

Recommended: **A**, then the exporter computes `do_start_min = active_do_start_min(rule_view)`
instead of `parse_do_start_min(raw_rows)`.

### 3.3 Also unify the internal checker (consistency, secondary)

`rules/internal/params._apply_do_start` (`:534-561`) should call the same
`active_do_start_min(sections)` so the legacy internal path stops diverging. (If the internal
checker is a dormant/legacy path, mark this as optional deferred.)

## 4. Edge cases / decisions

| Case | Behavior |
|------|----------|
| No `RuleSet` exported | fall back to current raw `parse_do_start_min` (pre-2015 inputs unchanged); or 0 |
| RuleSet selects no `2015` instance | return 0 (no DO-start grace) |
| RuleSet **does** select `2015002` | `00:00` → `0` → no grace (fixes Aug-5) |
| `2015` absent / unparsable | `0` (unchanged) |
| RuleSet activates >1 `2015` instance | warn; parse first (definition-class rule should have one) |
| `Scenario.ruleSetId` missing / not exported | `_select_rule_set_rows` already falls back to all RuleSet rows with a warning — keep |

## 5. Verification

1. **Unit:** call `active_do_start_min(sections)` for the current ro_input → expect `0`
   (00:00 from `2015002`, the RuleSet-637-selected instance); before the change it was `60`.
2. **Parity:** `build_context(...).do_start_min == 0`; `build_occupied_days` for crew 440 now
   marks **Aug 5, 23, 28** as occupied → Aug 5 **no longer** DO (matches engine-side view).
3. **Engine consistency:** confirm the Rust path already reports 2015 = 00:00 for this
   scenario (it uses `_sections_for_active_plan`). If any engine path still reads raw 2015,
   extend the same scoping there.
4. **Regression:** run `ro_check.py` with `auto-fill-do: Y`/`N`; `N`/absent unchanged;
   `Y` DO set now computed under the RuleSet 2015 value; `py_compile` + full run pass.
5. **Re-run 8Aug-5 case:** assert the DO-day set no longer contains Aug 5 (for crew 440).

## 6. Files touched (pbs-engine — constraint lifted)

| File | Change |
|------|--------|
| `ColumnModelSolver_python/core/do_start.py` | add `active_do_start_min(sections)` (resolve plan → 2015 instance rows → `parse_do_start_min`); keep `parse_do_start_min` |
| `ColumnModelSolver_python/io/result_converter.py` | `build_context` computes `do_start_min` via `active_do_start_min` on a resolver-compatible section view (adapter A) |
| `ColumnModelSolver_python/rules/internal/params.py` | `_apply_do_start` uses `active_do_start_min` (consistency; optional/deferred if path dormant) |
| *(no ro_check change needed)* | ro_check benefits automatically |

## 7. Risks

- `resolve_active_rule_plan` requires `RuleSet`/`Rule`/`RuleParameter` in the resolver's
  expected shape; the adapter (Option A) must be correct or resolution may raise. Guard with
  the existing `resolve_active_rule_plan` fallback + try/except → raw/0 fallback.
- The resolver raises if `RuleSet` resolves to no instances; treat as "no active plan" → fallback.
- Behavior parity with the Rust engine for 2015 must be confirmed (see §5.3); if the Rust
  side reads raw, scope it too so "engine" and "DO-fill" agree.

## 8. Why this is the right "same logic"

The engine picks rule instances via `resolve_active_rule_plan` (Scenario → RuleSet → Rule.id
→ `parameter_rows`). Routing the DO-fill's 2015 read through that same function guarantees the
DO-fill used **exactly** the instance the scenario's rule set selected (`2015002` → 00:00), so
it can no longer drift to a sibling instance (`2015001` → 01:00) merely because it sorts first
in the raw file. That is the whole point: one source of truth for which rule instances apply.
