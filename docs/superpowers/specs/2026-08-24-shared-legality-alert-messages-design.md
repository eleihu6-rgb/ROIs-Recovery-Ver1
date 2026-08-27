# Shared Legality Alert Messages Design

## Status

Approved design (2026-08-24). Implementation plan:
`docs/superpowers/plans/2026-08-24-shared-legality-alert-messages.md`.

## Goal

Keep Live/Scenario Alert Center copy and `ro_check.py` Warning Message bodies aligned from a **single declarative source of truth**, so that:

1. Changing a warning sentence on the Live path updates `ro_check` without a second hand-edited string.
2. Adding a new legality rule requires a message template entry that both sides can render (enforced by CI over time).

## Confirmed decisions

| Decision | Choice |
|----------|--------|
| Alignment model | **A — single source of truth** (not CI-only mirroring) |
| Source form | **Declarative templates** (JSON), not Rust-emitted English, not JS→Python codegen |
| `Row N:` prefix | **Outside** the template: Live keeps `withParamRowPrefix`; `ro_check` adds the same prefix only when `row=` (or equivalent) is available |
| UI language | English bodies only (existing product default) |

## Non-goals

- Changing Rust / PyO3 violation **semantics** or pipe field sets except when a later task proves a field is required for rendering.
- Reading persisted `rule_violation.message` from the database as the template source.
- i18n / Chinese product strings.
- Multi-variant bodies per rule in phase 1 (one `body` per `rule_code`).
- Rewriting all Live rule functions in one PR — migration is incremental.

## Current state (problem)

- Live/Scenario sentences are embedded in `live-server/scripts/legality-recheck-core.mjs` (and related persist helpers).
- `ro_check` Warning Message prefers `rule-engine-rs/ro-tests/live_alert_messages.py`, which **duplicates** only **8072** and **7506**; other codes fall back to `_fmt_viol_detail` pipe dumps.
- The existing phase-1 plan (`docs/superpowers/plans/2026-08-16-ro-check-live-alert-messages.md`) already notes drift until a shared-source effort.

## Architecture

```text
packages/legality-messages/
  messages.json          ← sole English body templates
  README.md              ← placeholder conventions (short)

live-server (JS):
  load messages.json → normalize rule fields → render(body, fields)
  → withParamRowPrefix(rowIndex, body) → Alert / rule_violation.message

rule-engine-rs/ro-tests (Python):
  load same messages.json → normalize PyO3 pipe → render(body, fields)
  → optional Row N: prefix → Warning Message (SVG / console)
```

### Package location

Preferred path: **`packages/legality-messages/`** so both Live and `ro-tests` can depend on a neutral package (consistent with `@rois/ui` style layout).

Acceptable alternate (same semantics): `live-server/scripts/messages/` if packaging cost is deferred — then Python loads via a stable relative path from `ro-tests`. The implementation plan must pick one; default is `packages/legality-messages/`.

### Render contract

- Templates use simple `{snake_case}` substitution only (no Mustache conditionals).
- Adapters (JS and Python) compute display strings (dates, HH:MM, flight labels) **before** render.
- Missing template for a rule, or missing required placeholder values after adaptation:
  - **`ro_check`:** fall back to `_fmt_viol_detail` (today’s behavior).
  - **Live:** during migration, keep the previous inline string until that rule is switched; after switch, fail the rule unit test rather than silently empty (do not ship blank Alert bodies).

### `Row N:`

- Not stored in `messages.json`.
- Live: unchanged `withParamRowPrefix(rowIndex0, body)`.
- `ro_check`: if pipe carries `row=` (0-based or as emitted by Engine), prefix `Row {N}: ` with the same 1-based display convention as Live; otherwise omit.

## `messages.json` shape

```json
{
  "version": 1,
  "rules": {
    "7509": {
      "body": "Crew {crew_id} and {paired_crew_id} are co-paired on flight {flight_label}."
    },
    "8072": {
      "body": "Crew count out of range (Current: {qualified}, Allowed: {min}–{max})."
    }
  }
}
```

| Field | Meaning |
|-------|---------|
| `version` | Schema version for future migrations |
| `rules.<code>.body` | English sentence; placeholders `{name}` |

Conventions:

- Rule keys are four-digit (or product-standard) `rule_code` strings.
- En-dash and other Unicode characters are stored literally in JSON (e.g. 8072 Allowed range).
- Placeholder names are the **normalized** field names shared by both adapters (document per rule in README or adjacent `fields.md` only if needed; prefer comments in golden tests).

### Field normalization examples

| Rule | Normalized fields (illustrative) | Live source | PyO3 pipe (illustrative) |
|------|----------------------------------|-------------|---------------------------|
| 8072 | `qualified`, `min`, `max` | TSV / complement counts | `qualified=`, `min=`, `max=` |
| 7506 | `day` (`YYYY-MM-DD`) | local day formatting | `local_day_start` → UTC/local date as today |
| 7509 | `crew_id`, `paired_crew_id`, `flight_label` | crew ids + `format7509FlightLabel` | `crew=`, `paired_crew=`, `flight=` (+ label resolution if available) |

Adapters must not invent business meaning; if the pipe cannot supply a Live-equivalent field, that rule stays on fallback until the pipe/engine is extended (separate task).

## Migration plan

1. Create `packages/legality-messages` with `messages.json`, shared render helper (JS + Python, or one language + thin port — prefer **tiny duplicated render** of `{key}` replace to avoid cross-runtime deps).
2. Seed JSON from current Live strings for rules already mapped in `live_alert_messages.py` (**8072**, **7506**), then **7509**, then remaining Live rules in priority order used by RO / Alert Center.
3. Point `live_alert_messages.py` at JSON; delete hard-coded handlers.
4. Change Live `ruleNNNN` message construction to `render` + `withParamRowPrefix` rule-by-rule with test updates.
5. Leave unmigrated Live rules on inline strings until their JSON entry lands.

## Testing

- Package / shared: `render(template, fields) === expected` golden strings (including en-dash).
- Live: existing rule tests assert equality with rendered template bodies (plus `Row N:` where applicable).
- `ro-tests`: extend `test_live_alert_messages.py` to load the same JSON file path.
- Optional smoke: `ro_check` fixture that fires 7509 / 8072 shows Warning Message bodies matching Live.

## New-rule gate (goal 2)

- CI check: every `rule_code` registered in Live `RULES` (`legality-recheck-core.mjs`) has a key under `messages.json` → `rules`.
  - Phase A: **warn** on missing keys.
  - Phase B: **fail** CI (after migration coverage is acceptable).
- Contributor checklist when adding a legality rule: kernel + Live rule function + **`messages.json` entry** + at least one fields→body test on each consumer (or shared golden).

## Error handling

| Case | Behavior |
|------|----------|
| Unknown `rule_code` in consumer | Live: migration-era inline or skip template; `ro_check`: `_fmt_viol_detail` |
| Template present, adapter missing field | Do not partial-fill with empty braces; treat as render failure → same fallbacks |
| Invalid JSON / load failure | Hard fail in tests; runtime Live should log and avoid blank messages (prefer last-known inline only during migration — post-migration fail closed in tests) |

## Risks

- **Pipe vs Live field parity:** some rules’ PyO3 strings lack fields Live uses (already noted for 8030 in the 2026-08-16 plan). Shared templates do not magically fix that; adapters return “cannot render” until fields exist.
- **Drift during migration:** dual path (inline + JSON) until each rule is cut over; CI key coverage reduces forgetting new rules.
- **Flight labels / timezones:** must stay in adapters, not templates, or JSON becomes a second business layer.

## Success criteria

- Editing `messages.json` for a migrated rule changes both Live Alert text (after deploy) and `ro_check` Warning Message without editing `live_alert_messages.py` handlers or Live template literals.
- Adding a new rule without a `messages.json` entry fails (or warns, then fails) CI once Phase B is on.
- `Row N:` behavior remains Live-compatible and is not duplicated inside JSON bodies.

## Related docs

- `docs/superpowers/plans/2026-08-16-ro-check-live-alert-messages.md` — phase-1 dual mapper (superseded for long-term by this design; short-term already shipped 8072/7506 handlers).
- Live message examples: `live-server/scripts/legality-recheck-core.mjs` (`rule7509`, `rule8072`, `rule7506`, …).
