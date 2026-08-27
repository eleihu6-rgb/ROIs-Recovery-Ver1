# Engine ro_input Scenario Ruleset Source

## Context

`engine-server` DB-source `LegacyRO` builds `ro_input.txt` through `engine-server/F8/ro_input_builder`.
The run path is:

1. live-server starts `LegacyRO` with `parameters.scenarioId` and `inputSource=db`.
2. `engine-server/src/tasks/task_manager.py` calls `F8.ro_input_builder.cli.build(...)`.
3. `ro_input_builder.sections.rules` emits `RuleSet`, `Rule`, and `RuleParameter` sections.

Current issue:

- The Rust connector environment already resolves `scenario.ruleset_id` through `cli.scenario_workset_id(...)` and exports it as `RUST_RULE_WORKSET`.
- The `ro_input` rule sections still resolve their scenario rule scope through the legacy workset fallback and default to `103`.
- That means a scenario whose `scenario.ruleset_id != 103` can run Rust legality against its own ruleset while `ro_input.txt` still carries RuleSet/Rule/RuleParameter data for workset `103`.

The repo guardrail requires a written spec before implementation. The `brainstorming` skill is not available in this Codex session, so this document is the approval checkpoint.

## Goal

When building DB-source `LegacyRO` material, ro_input must emit rule metadata for the scenario's own `scenario.ruleset_id`:

- `RuleSet`
- scenario `Rule`
- scenario `RuleParameter`

Rule configuration is now sourced from PostgreSQL only; the old MySQL rule source is removed.

## Non-Goals

- Do not change the ALL variants (`Rule(ALL)`, `RuleParameter(ALL)`) unless the existing contract already emits all rows from the selected source.
- Do not change scenario creation or `scenario.ruleset_id` ownership.
- Do not migrate rule tables or change schema.
- Do not change live/scenario legality recheck behavior; this only affects generated `ro_input`.

## Design

### Resolve Ruleset in Context

Extend `F8.ro_input_builder.context.get_scenario(...)` to select `s.ruleset_id` in addition to current scenario fields.

Add a helper:

```python
def scenario_ruleset_id(conn, ctx) -> int | None:
    return get_scenario(conn, ctx).get("ruleset_id")
```

The helper reads the scenario row, not an environment default. This keeps scenario metadata, Rust connector, and emitted ro_input sections aligned.

### Rule Workset Resolution

Add a context-aware resolver near the rule sections:

```python
def _ctx_workset_id(conn, ctx) -> int:
    return context.scenario_ruleset_id(conn, ctx) or 103
```

Use `_ctx_workset_id(conn, ctx)` for scenario-scoped rule sections:

- `_ruleset`
- `_rule_scen`
- `_rule_param_scen`

Do not use it for `Rule(ALL)` / `RuleParameter(ALL)`.

### PostgreSQL Source

PG scenario rule SQL should also scope by the resolved workset id:

- `_ruleset`: `WHERE workset_id = <scenario.ruleset_id>`
- `_rule_scen`: `rule_id IN (SELECT rule_id FROM rule_set WHERE workset_id = <scenario.ruleset_id>)`
- `_rule_param_scen`: `_pg_param_rows_from_json(..., where=f"workset_id = {resolved}")`

Current PG `_rule_scen` lacks the workset filter and should be narrowed so a scenario ruleset does not emit rules from every rule_set membership.

### Task Manager

`task_manager._build_subprocess_env(...)` should continue exporting `RUST_RULE_WORKSET`.

For in-process `ro_input_cli.build(...)`, avoid relying only on process-wide env mutation. The rule section should resolve through the build `ctx` from the scenario row. This prevents cross-task contamination if concurrent tasks build different scenarios.

The ro_input builder itself should not require process-wide rule-source or workset environment variables.

## Tests

Focused tests to update/add:

- `engine-server/tests/test_ro_input_rule_pg_source.py`
  - fake PG scenario cursor returns `ruleset_id=207`.
  - scenario `RuleSet`, `Rule`, and `RuleParameter` SQL scope to `workset_id = 207`.
  - fallback still uses default `103` when scenario ruleset is unavailable.

- `engine-server/tests/test_ro_input_rule_sections.py`
  - PG scenario `Rule` emits only members for `scenario.ruleset_id`.
  - update stale test that currently compares scenario rules against all `rule_set` memberships.

- `engine-server/tests/test_ro_input_manday_meta_sections.py`
  - update stale pinned-to-103 expectation; Scenario `ruleSetId` should match the scenario row.

- `engine-server/tests/test_legacy_ro_workdir_prep.py`
  - keep existing `RUST_RULE_WORKSET` test.
  - add/adjust test proving ro_input build resolves from `scenario.ruleset_id` rather than a process-wide workset env.

## Verification

Expected focused commands after implementation:

```bash
cd engine-server
python3 -m pytest \
  tests/test_ro_input_rule_mysql_source.py \
  tests/test_ro_input_rule_sections.py \
  tests/test_ro_input_manday_meta_sections.py \
  tests/test_legacy_ro_workdir_prep.py -q
```

If remote DB-backed tests are skipped due unavailable DB, report the skips and run the deterministic fake-cursor tests.

## Risks

- The ro_input builder can run concurrently. Avoid process-wide env mutation as the primary mechanism.
- Existing tests and comments assume workset `103`; those should be treated as stale where the product requirement is now scenario-specific rulesets.
- If `scenario.ruleset_id` is null, the builder should fall back to existing behavior rather than fail older fixtures.
