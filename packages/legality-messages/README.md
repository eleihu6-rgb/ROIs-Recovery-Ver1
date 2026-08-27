# @rois/legality-messages

Shared English alert body templates for Live/Scenario Alert Center and `ro_check`.

Design spec: [`docs/superpowers/specs/2026-08-24-shared-legality-alert-messages-design.md`](../../docs/superpowers/specs/2026-08-24-shared-legality-alert-messages-design.md).

## Placeholder conventions

- Templates use `{snake_case}` placeholders only (e.g. `{crew_id}`, `{day}`).
- Adapters (JS and Python) compute display strings — dates, times, flight labels — **before** calling `fillTemplate` / `renderRuleBody`.
- Do **not** put `Row N:` in template bodies; callers add that prefix when a row index is available.

## API

- `fillTemplate(template, fields)` — substitute placeholders; returns `null` if any placeholder is missing or empty.
- `loadMessages(jsonPath?)` — load `messages.json` (defaults to package root).
- `renderRuleBody(messages, ruleCode, fields)` — look up `rules[ruleCode].body` and render.

## Tests

```bash
cd packages/legality-messages && node --test src/render.test.mjs
```
