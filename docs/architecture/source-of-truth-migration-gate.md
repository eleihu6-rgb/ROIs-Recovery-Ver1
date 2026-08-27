# Source-of-Truth Migration Gate

When a business field changes source of truth, storage ownership, derivation rule, or write/read location, treat it as a cross-system contract migration. Do not stop after changing the UI, API payload, or one module's writer.

This gate applies to examples such as moving a field from JSON to a relational table, changing which table owns a value, replacing a request field with a derived value, changing a status computation, or moving workflow state between services.

## Required Audit

1. Search the old and new sources across the repository.
   Include field names, JSON paths, DTO keys, SQL columns, generated SQL snippets, comments, tests, fixtures, scripts, and docs.

2. Map every downstream consumer by layer.
   Check UI create/edit/detail, API routes, services, export/import builders, background jobs, engine-server builders, pbs-server packages, solver parameters, callbacks, result loaders, tests, and handoff docs.

3. Decide old-source behavior explicitly.
   The old source must be deleted, ignored, migrated, or retained as a documented compatibility fallback. It must not keep silently participating in business decisions unless that is the intended compatibility rule.

4. Add a conflict regression.
   Create or update at least one test where the old source and new source disagree, then assert the new source wins. This is the most important regression for preventing partial migrations.

5. Keep touched-area tests current.
   If an existing test depends on stale fixture data or a removed source-of-truth path, update it to cover current behavior or skip only when the external fixture is genuinely unavailable and another regression covers the new contract.

6. Record unchecked paths.
   Specs or implementation notes must list the downstream paths audited. Any path not checked must be called out as residual risk.

## Review Questions

- What is the old source, and what is the new source?
- Which consumers read the old source directly or indirectly?
- Which writers can still populate the old source?
- What happens when old and new values conflict?
- Which automated test would fail if a future change accidentally used the old source again?

## Example Shape

For a scenario field ownership change:

- Old source: `scenario.filter_params.<path>`
- New source: `scenario.workset_id -> workset.<field>`
- Consumers to audit: Gantt form/detail, live-server scenario service/export, engine-server `ro_input_builder`, solver environment parameters, pbs-server scenario package scope, result loading, and tests.
- Regression: construct a scenario where `filter_params` has one value and `workset` has another; assert optimizer/export scope uses the `workset` value.
