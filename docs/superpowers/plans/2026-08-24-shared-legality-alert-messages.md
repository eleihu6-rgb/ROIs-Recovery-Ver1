# Shared Legality Alert Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce one `messages.json` as the English Alert / `ro_check` Warning Message body source, wire Live (8072/7506/7509 first) and `live_alert_messages.py` to render it, and add a CI coverage check against Live `RULES`.

**Architecture:** No-build package `packages/legality-messages` holds `messages.json` plus a tiny `{placeholder}` renderer (JS). Python duplicates the same fill logic and loads the same JSON by path. Live `legality-recheck-core.mjs` and `ro-tests/live_alert_messages.py` stop hard-coding those three bodies. `Row N:` stays outside templates via `withParamRowPrefix` / optional pipe `row=`.

**Tech Stack:** JSON templates, Node ESM (`.mjs`), Python 3.12, `node --test`, pytest, existing Live legality tests.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-24-shared-legality-alert-messages-design.md`
- UI English only; no `Row N:` inside JSON bodies
- Simple `{snake_case}` substitution only (no Mustache conditionals)
- Missing template / missing fields → `ro_check` falls back to `_fmt_viol_detail`; Live migrated rules must not ship blank messages
- Do not change Rust/PyO3 pipe semantics in this plan
- Incremental: migrate **8072, 7506, 7509** only in the cutover tasks; other Live rules stay inline until a follow-up
- §Minimal-First / §Surgical: no codegen, no i18n, no DB message reverse-engineering
- Do not commit unless the user asks (repo rule §No-Auto-Commit); plan steps that say “Checkpoint” mean stage a logical unit / ask the user to commit

---

## File map

| Path | Role |
|------|------|
| `packages/legality-messages/package.json` | `@rois/legality-messages`, ESM exports for JSON + render |
| `packages/legality-messages/messages.json` | Sole English `body` templates |
| `packages/legality-messages/src/render.mjs` | `fillTemplate`, `loadMessages`, `renderRuleBody` |
| `packages/legality-messages/src/render.test.mjs` | Golden string tests |
| `packages/legality-messages/README.md` | Placeholder + Row N conventions (short) |
| `live-server/package.json` | `file:../packages/legality-messages` dependency |
| `live-server/scripts/legality-recheck-core.mjs` | Use render for 8072 / 7506 / 7509 |
| `live-server/scripts/__tests__/…` | Assert rendered bodies where needed |
| `rule-engine-rs/ro-tests/live_alert_messages.py` | Load JSON + fill; keep `parse_pipe` / adapters |
| `rule-engine-rs/ro-tests/test_live_alert_messages.py` | Point at shared JSON path |
| `scripts/check-legality-message-coverage.mjs` | RULES ⊆ messages.json keys (warn mode; `--strict` later) |

---

### Task 1: Package scaffold + renderer (TDD)

**Files:**
- Create: `packages/legality-messages/package.json`
- Create: `packages/legality-messages/messages.json`
- Create: `packages/legality-messages/src/render.mjs`
- Create: `packages/legality-messages/src/render.test.mjs`
- Create: `packages/legality-messages/README.md`

**Interfaces:**
- Produces:
  - `fillTemplate(template: string, fields: Record<string, string>): string | null` — returns `null` if any `{name}` is missing from `fields` or value is null/empty; never leave `{…}` in output
  - `loadMessages(jsonPath?: string): { version: number, rules: Record<string, { body: string }> }`
  - `renderRuleBody(messages, ruleCode: string, fields): string | null` — looks up `rules[ruleCode].body` then `fillTemplate`
- Consumes: nothing

- [ ] **Step 1: Write failing tests**

Create `packages/legality-messages/src/render.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fillTemplate, loadMessages, renderRuleBody } from './render.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

test('fillTemplate replaces snake_case placeholders', () => {
  assert.equal(
    fillTemplate('Hello {crew_id} and {paired_crew_id}.', {
      crew_id: '1256',
      paired_crew_id: '1435',
    }),
    'Hello 1256 and 1435.',
  )
})

test('fillTemplate returns null when a placeholder is missing', () => {
  assert.equal(fillTemplate('X {a} {b}', { a: '1' }), null)
})

test('8072 / 7506 / 7509 golden bodies from messages.json', () => {
  const messages = loadMessages(path.join(root, 'messages.json'))
  assert.equal(
    renderRuleBody(messages, '8072', { qualified: '2', min: '0', max: '1' }),
    'Crew count out of range (Current: 2, Allowed: 0\u20131).',
  )
  assert.equal(
    renderRuleBody(messages, '7506', { day: '2024-06-15' }),
    'Multiple check-ins per day (2024-06-15).',
  )
  assert.equal(
    renderRuleBody(messages, '7509', {
      crew_id: '1256',
      paired_crew_id: '1435',
      flight_label: '822',
    }),
    'Crew 1256 and 1435 are co-paired on flight 822.',
  )
})

test('unknown rule returns null', () => {
  const messages = loadMessages(path.join(root, 'messages.json'))
  assert.equal(renderRuleBody(messages, '8002', { x: '1' }), null)
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd packages/legality-messages && node --test src/render.test.mjs
```

Expected: FAIL (module / JSON missing).

- [ ] **Step 3: Implement package**

`package.json`:

```json
{
  "name": "@rois/legality-messages",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/render.mjs",
    "./messages.json": "./messages.json"
  },
  "files": ["src", "messages.json", "README.md"]
}
```

`messages.json` (exact en-dash U+2013 in 8072):

```json
{
  "version": 1,
  "rules": {
    "8072": {
      "body": "Crew count out of range (Current: {qualified}, Allowed: {min}–{max})."
    },
    "7506": {
      "body": "Multiple check-ins per day ({day})."
    },
    "7509": {
      "body": "Crew {crew_id} and {paired_crew_id} are co-paired on flight {flight_label}."
    }
  }
}
```

`src/render.mjs`:

```js
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_JSON = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'messages.json',
)

export function fillTemplate(template, fields) {
  const text = String(template ?? '')
  const names = [...text.matchAll(/\{([a-z][a-z0-9_]*)\}/g)].map((m) => m[1])
  for (const name of names) {
    if (fields[name] == null || fields[name] === '') return null
  }
  return text.replace(/\{([a-z][a-z0-9_]*)\}/g, (_, name) => String(fields[name]))
}

export function loadMessages(jsonPath = DEFAULT_JSON) {
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
}

export function renderRuleBody(messages, ruleCode, fields) {
  const body = messages?.rules?.[String(ruleCode)]?.body
  if (!body) return null
  return fillTemplate(body, fields)
}
```

`README.md`: document `{snake_case}`, no `Row N:` in bodies, adapters own dates/labels, link the design spec.

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd packages/legality-messages && node --test src/render.test.mjs
```

Expected: all PASS.

- [ ] **Step 5: Checkpoint**

Ask the user to commit when ready:

```bash
git add packages/legality-messages
# git commit -m "feat(legality-messages): add shared alert body templates package"
```

---

### Task 2: Point `ro_check` mapper at shared JSON

**Files:**
- Modify: `rule-engine-rs/ro-tests/live_alert_messages.py`
- Modify: `rule-engine-rs/ro-tests/test_live_alert_messages.py`

**Interfaces:**
- Consumes: `messages.json` + same placeholder names as Task 1
- Produces: unchanged public API `format_live_style_message(v) -> str | None`, `parse_pipe`, `dedupe_violations_for_display`

- [ ] **Step 1: Add JSON presence test**

```python
from pathlib import Path
import json

def test_shared_messages_json_has_8072_7506_7509() -> None:
    root = Path(__file__).resolve().parents[2]  # rois-ai
    data = json.loads((root / "packages/legality-messages/messages.json").read_text())
    assert set(data["rules"]) >= {"8072", "7506", "7509"}
```

- [ ] **Step 2: Run current tests (baseline)**

```bash
cd rule-engine-rs/ro-tests && python3 -m pytest test_live_alert_messages.py -q
```

Expected: PASS with old handlers (or after Task 1 JSON exists, still PASS once Step 3 lands).

- [ ] **Step 3: Implement JSON-backed formatters**

Replace hard-coded body strings in `_msg_8072` / `_msg_7506` with load-once JSON + fill (mirror JS rules). Keep epoch→`day` adapter for 7506. Add `_msg_7509` mapping:

- `crew` → `crew_id`
- `paired_crew` → `paired_crew_id`
- `flight` → `flight_label` (phase 1: raw flight id string)

Register `"7509"` in `_HANDLERS`. Update module docstring to point at `packages/legality-messages/messages.json`.

Path resolution:

```python
_MESSAGES_PATH = (
    Path(__file__).resolve().parents[2]
    / "packages"
    / "legality-messages"
    / "messages.json"
)
```

- [ ] **Step 4: Run pytest + add 7509 case**

```python
def test_7509_live_style_body() -> None:
    v = "7509|row=0|crew=1256|paired_crew=1435|pairing=186|flight=16010"
    assert format_live_style_message(v) == (
        "Crew 1256 and 1435 are co-paired on flight 16010."
    )
```

```bash
cd rule-engine-rs/ro-tests && python3 -m pytest test_live_alert_messages.py -q
```

Expected: PASS.

- [ ] **Step 5: Checkpoint** (ask user to commit)

---

### Task 3: Wire Live `rule8072` / `rule7506` / `rule7509` to shared templates

**Files:**
- Modify: `live-server/package.json` — add `"@rois/legality-messages": "file:../packages/legality-messages"`
- Modify: `live-server/scripts/legality-recheck-core.mjs` — import + three call sites (~8072 message, ~7506 message, ~7509 message)
- Modify tests under `live-server/scripts/__tests__/` only if assertions need path tweaks
- Run: `npm install` in `live-server`

**Interfaces:**
- Consumes: `loadMessages`, `renderRuleBody` from `@rois/legality-messages` (or relative `../../packages/legality-messages/src/render.mjs` if package resolution fails for plain `node scripts/…`)
- Produces: same violation `message` strings as today (including `Row N:` via `withParamRowPrefix`)

- [ ] **Step 1: Install file dependency**

```bash
cd live-server && npm install
```

- [ ] **Step 2: Implement Live render calls**

Near top of `legality-recheck-core.mjs`:

```js
import { loadMessages, renderRuleBody } from '@rois/legality-messages'

const LEGALITY_MESSAGES = loadMessages()
```

**8072** — replace the template-literal body only:

```js
const body = renderRuleBody(LEGALITY_MESSAGES, '8072', {
  qualified: String(qualified),
  min: String(minLimits),
  max: String(maxLimits),
})
if (!body) throw new Error('8072 message template render failed')
// message: withParamRowPrefix(matched.rowIndex, body),
```

**7506:**

```js
const body = renderRuleBody(LEGALITY_MESSAGES, '7506', { day: dayYmd })
if (!body) throw new Error('7506 message template render failed')
```

**7509:**

```js
const body = renderRuleBody(LEGALITY_MESSAGES, '7509', {
  crew_id: String(crewId),
  paired_crew_id: String(pairedCrewId),
  flight_label: format7509FlightLabel(member),
})
if (!body) throw new Error('7509 message template render failed')
```

Keep `format7509FlightLabel` as the adapter (not in JSON).

- [ ] **Step 3: Run Live tests**

```bash
cd live-server && node --test scripts/__tests__/rule-7509.test.mjs scripts/__tests__/legality-recheck-core.test.mjs 2>&1 | tail -50
```

Expected: PASS. Bodies must remain byte-identical to today’s English (including en-dash).

- [ ] **Step 4: Checkpoint** (ask user to commit)

---

### Task 4: Coverage CI script (warn mode)

**Files:**
- Create: `scripts/check-legality-message-coverage.mjs`
- Modify: root `package.json` — add `"check:legality-messages"`

**Interfaces:**
- Consumes: `RULES` + `ruleCodeOf` from `legality-recheck-core.mjs`; `messages.json`
- Produces: exit 0 in default mode with WARN lines for missing keys; `--strict` → exit 1 if any missing

- [ ] **Step 1: Write script**

```js
#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMessages } from '../packages/legality-messages/src/render.mjs'
import { RULES, ruleCodeOf } from '../live-server/scripts/legality-recheck-core.mjs'

const strict = process.argv.includes('--strict')
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const messages = loadMessages(path.join(root, 'packages/legality-messages/messages.json'))
const required = RULES.map(ruleCodeOf)
const missing = required.filter((code) => !messages.rules?.[code]?.body)

for (const code of missing) {
  console.warn(`WARN: RULES has ${code} but messages.json has no body`)
}
if (missing.length && strict) {
  console.error(`FAIL: ${missing.length} rule(s) lack shared alert templates`)
  process.exit(1)
}
console.log(
  missing.length
    ? `legality-messages coverage: ${required.length - missing.length}/${required.length} (warn-only)`
    : `legality-messages coverage: ${required.length}/${required.length} OK`,
)
```

If importing `legality-recheck-core.mjs` fails due to side effects/deps, fall back to parsing `export const RULES = [ruleNNNN, …]` with a documented regex in the script header — prefer real import first.

- [ ] **Step 2: Run warn mode**

```bash
node scripts/check-legality-message-coverage.mjs
```

Expected: exit 0; WARNs for codes other than 8072/7506/7509.

- [ ] **Step 3: Add npm script**

Root `package.json`:

```json
"check:legality-messages": "node scripts/check-legality-message-coverage.mjs"
```

Do **not** enable `--strict` in CI until remaining rules are migrated (follow-up).

- [ ] **Step 4: Checkpoint** (ask user to commit)

---

### Task 5: Spec/plan cross-links + optional smoke

**Files:**
- Modify: `docs/superpowers/specs/2026-08-24-shared-legality-alert-messages-design.md`
- Modify: `docs/superpowers/plans/2026-08-16-ro-check-live-alert-messages.md`

- [ ] **Step 1: Update design spec Status** to link this plan path.
- [ ] **Step 2: Add one-line successor note** on the 2026-08-16 plan pointing here.
- [ ] **Step 3: Optional smoke** — run `ro_check` on a fixture that hits 7509; Warning Message body should match the template (not a raw pipe dump).
- [ ] **Step 4: Checkpoint** (ask user to commit / push)

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Single JSON SoT | Task 1 |
| `{snake_case}` render; no Row N in body | Task 1–3 |
| Python + JS consumers | Task 2–3 |
| Migrate 8072/7506/7509 | Task 2–3 |
| Fallback when cannot render (`ro_check`) | Task 2 (`None` → existing `_fmt_viol_detail`) |
| CI RULES ⊆ messages (warn then strict) | Task 4 |
| No Rust pipe change / no i18n / no DB | Global constraints |
| Docs cross-link | Task 5 |

## Out of scope (follow-up plan)

- Migrate remaining `RULES` bodies into `messages.json`
- Flip coverage script to `--strict` in CI/pre-push
- Enrich 7509 `flight_label` on the PyO3 path beyond raw `flight=` id
- Optional shared `Row N:` helper inside `ro_check` when `row=` is present

---

## Self-review notes

- No TBD placeholders in task steps.
- Render API names consistent: `fillTemplate` / `loadMessages` / `renderRuleBody`.
- Commits gated on user request per repo rules.
