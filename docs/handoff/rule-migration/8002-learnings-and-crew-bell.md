# Rule 8002 migration — learnings + next feature (crew violation bell)

Date: 2026-06-14. Pilot rule = **8002 MAX_CUM_BLOCK** (40h/28d). Process (user's): unit-test from C++ → check entire month → DB violation count must equal what the UI shows → learn → next rule.

## Status of 8002
- ✅ Rust engine `rule-engine-rs`, cpp-gtest validated (6715 legal / 6725 violation @112h, 4/4). Perf: **0.058 ms** for the whole 673-crew roster (vs C++ "few sec", vs TS `violations-init` worker 13 min / wrote 0 rows).
- ✅ Gantt rule set to 40h (`max_ft_flair_f8_p` 28d=2400). Worksets: "F8 Full Ruleset"=workset 433 (all 14), 103=8002 only. Ryan granted admin (is_admin=1).
- ✅ Rust computed 158 violating crew; persisted to `rule_violation`.
- ⚠️ Getting them to SHOW on the gantt exposed two root causes (below).

## CRITICAL LEARNINGS (why the gantt showed zero warnings)
1. **Active group is `ccar121_gantt`, NOT `flair_gantt_rule`.** The gantt's violation fetch uses `useRuleConfigStore.selectedGroupCode ?? 'ccar121_gantt'` (`gantt/src/hooks/use-persisted-violations.ts`). Violations MUST be written to `rule_violation.rule_group_code='ccar121_gantt'` or the gantt's `GET /api/violations?...&groupCode=ccar121_gantt...` returns nothing. (Observed via Playwright intercept.)
2. **The gantt DROPS roster-level violations.** In `use-persisted-violations.ts`: `if (item.pairingId !== null) setPersistedViolations(...)` — violations with `pairing_id NULL` are skipped and never render. Cumulative rules (8002 28-day, 7/28/365) are inherently roster-level. Per the `rule_violation` schema comment, cumulative violations should attach to the **triggering pairing** (`"7/28/365 cumulative: triggering pairing start → end"`). Fix applied: 8002 violations re-inserted with `pairing_id` = the crew's last pairing in the worst window, `start_dt/end_dt` = that pairing's span.
3. **Display window filter:** `GET /api/violations` filters `start_dt>=start AND end_dt<=end`; the gantt's window = current view ± ~2 months (observed Apr–Sep for a June view). A violation only shows if its `[start_dt,end_dt]` ⊆ that window AND its crew is in `selectedCrewIds` AND its pairing is loaded.
4. **June 2026 is genuinely sparse:** only **1 crew (998, 54.5h)** exceeds 40h/28d with a window touching the Apr–Sep view. The "large number" (158 total; **top 3: 13187=105h, 869=102.8h, 784=96.3h**) is in **January** — outside the June view's window, so it won't show until the gantt date range is moved to January.
5. **No live-violations test hook existed.** Added `window.__ganttTest.liveViolations()` (reads `session-violation-store.displayViolations`) in `gantt/src/utils/gantt-test-hook.ts` so Playwright can assert the RENDERED count == DB. (A UI test `e2e/tests/gantt/legality-8002-ui.spec.ts` exists but flakes: `applyFilter` sometimes loads only a 40-crew subset that excludes 998 → no violation fetched. Make it select all crew / explicitly include the violating crew before asserting.)

## NEXT FEATURE — crew violation bell (user request 2026-06-14)
> "add a bell on crew header, right to MDO, color by rule severity, display for crew who has violation, including all roster or pairing rule msg. on hover, pop-up showing rule warning message."

This is the proper fix for learning #2 (surface roster-level + pairing-level violations per crew). Scope:
- **Data:** build a per-CREW violation map including roster-level. Currently roster-level is dropped (learning #2). Either keep roster-level in `session-violation-store` keyed by crew, or aggregate `displayViolations` (pairing→crew) + a new roster-level-by-crew map. Each crew → list of {ruleCode, severity, message}.
- **Render:** the crew-info panel is **canvas-rendered** (left frozen columns: CrewId/Rank/Base/Sen/MCred/MDO; `gantt/src/stores/column-store.ts`, drawn in `gantt/src/components/gantt/renderers/roster-renderer.ts`). Draw a bell glyph right of the MDO column for crew with ≥1 violation, colored by max severity (3=Hard/destructive, 2=Overridable/amber, 1=Soft/muted — use `SEVERITY_CHIP`/`severity-labels`).
- **Hover:** add hit-testing for the bell region (mirror existing `hoverRosterTask`/`rosterProbe` patterns) → show a popup/tooltip listing the crew's rule warning messages. May use a DOM tooltip layer positioned over the canvas (check roster-pane.tsx for an existing hover/tooltip overlay).
- **Test:** Playwright — load a view with a violating crew, assert the bell is present for that crew (via a `__ganttTest` getter exposing per-crew bell state), correct severity color, and the hover popup shows the message. Assert NO bell for a legal crew. Count of belled crew == DB violation crew count for the window.

## Also captured (no dev yet) — feature #6
Rule-template column ranking rules by **violation likelihood** (from historical checks) to prioritise rule-check order (check most-likely-to-violate first). Not started.

## Env/creds
- Remote DB via node+pg (live-server/.env). Gantt e2e: `GANTT_TEST_USER=Jen GANTT_TEST_PASS=Our2027 npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps <spec>`. Admin = Ryan/Our2027. Rust: `export PATH="/opt/homebrew/bin:$PATH"; cargo` (brew install broke node → `brew reinstall node`).
