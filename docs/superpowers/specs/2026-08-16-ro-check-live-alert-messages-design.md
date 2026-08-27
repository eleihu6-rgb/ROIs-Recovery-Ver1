# Design: ro_check Warning Message Live/Scenario alert copy

**Status:** Approved for implementation  
**Date:** 2026-08-16  
**Choice:** Option 1 — display-only Python mapper (no shared JS module, no engine/DB changes)

## Problem

`ro_check.py` Warning Message / console lines show PyO3 pipe strings via `_fmt_viol_detail` (e.g. `segment=… qualified=… min=…`). Live/Scenario Alert Center shows English sentences from `live-server/scripts/legality-recheck-core.mjs`. Planners comparing Engine vs Live need the same wording for mapped rules.

## Goal

For mapped rule codes, Warning Message detail text uses the **same English body** as Live/Scenario Alert Center. Unmapped rules keep today’s `_fmt_viol_detail` field dump.

## Phase 1 scope

| Rule | PyO3 pipe (today) | Live-style body (no `Row N:`) |
|------|-------------------|-------------------------------|
| **8072** | `8072\|segment=\|qualified=\|…\|min=\|max=\|…` | `Crew count out of range (Current: {qualified}, Allowed: {min}–{max}).` (en-dash U+2013) |
| **7506** | `7506\|local_day_start=\|groups=\|` | `Multiple check-ins per day ({YYYY-MM-DD}).` |

### Row N: omitted

Live prefixes via `withParamRowPrefix`. PyO3 strings for 8072/7506 do **not** carry `row_index`. Phase 1 omits `Row N:` rather than inventing it.

### 7506 date assumption

`local_day_start` is the Engine `local_day_start_utc` epoch (UTC instant of crew-base local midnight). Phase 1 formats that epoch as a **UTC** calendar date `YYYY-MM-DD`. This matches a zero-offset base exactly; non-zero base offsets may differ from Live’s timezone-aware `dayYmd` until the pipe carries offset or we thread crew base into the mapper. Documented deliberately — tests lock the UTC formatting contract.

## Out of scope

- Reading DB `rule_violation`
- Changing Rust / PyO3 pipe format
- Rewriting all rules
- PBS solver UX
- Deferred rules (8030, 7505, …) until pipe fields match Live templates 1:1 (e.g. 8030 pipe lacks `maxNumber`)

## Approach

```text
PyO3 pipe → format_live_style_message → English body (if mapped)
                         ↓ None
                   _fmt_viol_detail (fallback)
                         ↓
              Warning Message SVG / console
```

### Files

| File | Role |
|------|------|
| `rule-engine-rs/ro-tests/live_alert_messages.py` | `parse_pipe`, `format_live_style_message`, `_msg_8072`, `_msg_7506` |
| `rule-engine-rs/ro-tests/ro_check.py` | Prefer mapper where Warning Message / console builds detail |
| `rule-engine-rs/ro-tests/test_live_alert_messages.py` | Unit tests for 8072, 7506, unknown → None |

Live template references (copy can drift until a later shared-source effort):

- 8072: `legality-recheck-core.mjs` `rule8072` message body
- 7506: `legality-recheck-core.mjs` `rule7506` message body

## Behavior contract

1. Detection / pipe strings from Engine unchanged.
2. Only display text for mapped codes changes.
3. `Rule{code}` label prefix in `ro_check` stays as today.
4. Unknown / incomplete pipes → `None` → existing `_fmt_viol_detail`.

## Verification

```bash
cd rule-engine-rs/ro-tests && python -m pytest test_live_alert_messages.py -q
```

Optional: run an `ro_check` fixture that fires 8072/7506 and confirm Warning Message bodies.

## Risks

- English copy can drift from Live until a shared-source effort.
- 7506 UTC date vs Live local `dayYmd` for non-UTC bases (see assumption above).
