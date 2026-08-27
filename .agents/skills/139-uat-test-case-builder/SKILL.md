---
name: 139-uat-test-case-builder
description: Build a customer-ready UAT (User Acceptance Test) test-case workbook (.xlsx) for ROIS-AI product surfaces, sourced from the product's own online help. Use when the user asks to "create UAT test cases", "make a UAT test case Excel", "add a tab/module to the UAT workbook", "bump the UAT test cases to ver N", or wants per-feature acceptance tests for Admin UI (Altair Live/Scenario), Legality, Crew Portal (PBS), or Integration (connector/NOC/S3). Produces a multi-round (UAT 1/2/3) workbook with an auto-computed summary tab, modelled on the customer reference files in docs/UAT/. Triggers on "UAT test case", "acceptance test", "UAT workbook", "test case excel".
---

# UAT Test Case Builder

## Overview

Turns ROIS-AI product features into a **customer-facing UAT workbook**: one Summary tab
(T1) plus one tab per product surface, every feature rendered as a plain-English,
click-by-click test case with **multiple test rounds** (UAT 1 / 2 / 3) so a case that fails
round 1 is re-tested in round 2/3 and still rolls up correctly.

**Audience is the end user / customer tester** — keep it easy: plain English, no internal
jargon (no table names, LSY refs, code identifiers), focus on user-visible features.

**Source of truth = the product's own online help.** Do not invent features. Extract them
from the help topic source in-repo (far more reliable than the SIT URL):

| Surface (typical tab) | Audience | Help source in repo | Live URL |
|---|---|---|---|
| Admin UI — Live & Scenario | Admin | `gantt/src/components/help/topics/{live,scenario,settings,regression}/` + `help-data.ts` | `/altair` |
| Legality | Admin | `gantt/src/components/help/topics/legality/` + `help-data.ts` | `/altair/legality` |
| Crew Portal | Crew | `pbs-portal/src/features/help/topics/**` + `help-data.ts` | `/pbs/help` |
| Integration (inbound/outbound) | Admin/System | `.agents/skills/126-noc-integration/SKILL.md`, `connector-server/src/{routes,workers,transform}/`, gantt import dialogs | connector-server |
| Solver Quality | Admin | `gantt/src/components/help/topics/scenario/` (results tabs) + skills 113 / 114 / 125 / 133 | `/altair` (Scenario results) |

Solver Quality (T6) validates the **quality** of a finished scenario's roster (coverage,
seniority respect, bid satisfaction, credit-hour balance, KPI, distribution, versions,
algorithm params) — distinct from Admin-UI Scenario cases, which cover creating/kicking-off a
run. It also carries a **base × rank** scenario matrix (see F8 domain facts below).

## F8 domain facts (keep T3 Legality & T6 Solver-Quality content correct)

- **Ranks.** Pilots (division P) = **CA, FO**. Cabin (division C) = **IFD, FA** — F8 has **no
  PU rank** and no crew allocated to one; never emit PU in a base × rank matrix. Bases:
  YVR·YEG·YYZ·YYC·YXX·YWG·YHZ·YKF·YUL·YOW; some bases are pilots-only (no cabin crew) — make
  cabin rows conditional/N-A, confirm against live data (see memory `f8-db-account-read-locked`).
- **Legality rules carry their data inline.** Unlike the old system (rule logic and data
  separate), an F8 rule can hold its operands inside the rule itself — e.g. **7509 "Avoid
  Co-pairing" ("Crew not to fly together")** takes the restricted crew IDs typed directly into
  the rule's own table (columns **Crew A · Crew B · Eff Date · Exp Date**, one pair per row);
  shipped 2026-08-23 to the F8 solver ruleset + `rule-engine-rs` (match is on crew IDs only, so
  it spans different bases/divisions by design). Rule-number facts
  reflected in the workbook: **7508** (F8 calendar-day Single Day Free from Duty) **replaces the
  retired 7501**; **2015** is a definition-type rule (DO / Day-Off Start Time) that feeds
  downstream days-off rules (7505/7507), analogous to **2014** (Local Night Definition).
  Verify rule numbers/behaviour in `rule-engine-rs/` before writing a legality case.

## Reference format (customer files in `docs/UAT/`)

Learn structure/format from these — never copy their content (they are other airlines'):

- `Tab21,22,29_Bush_...TG UAT test cases...xlsx` — Thai Airways. The per-case **multi-round**
  format: each case carries UAT 1 / UAT 2 / UAT 3, each round with Status + Screenshot/Ref +
  Comments + Tester. That is the source of the 3-round layout.
- `TCAR_CrewSE_TEST_CASE_Status_Statistics...xlsx` — sheet "DP-A TCAR UAT Summary": the
  summary-page layout (Tab | Total | Passed | Failed | Not Tested | Ready for Re-test |
  Pass Rate % | Test Rate % | Owner | Last update).
- `Flair PBS UAT TEST CASES Sample.xlsx` — Flair (F8) column set for a single case.

## Workflow

1. **Confirm scope & tab→surface mapping.** Which surfaces become tabs, who the audience is,
   how many rounds (default 3). Note: `/pbs/help` = Crew Portal; Live/Scenario/Legality live
   in the Altair app (`/altair`), even if the user's URL says otherwise — confirm.
2. **Fan out readers (parallel subagents), one per tab.** Each reads that surface's help
   topic source and emits a JSON file of cases (schema below). This keeps step-level detail
   accurate and your context clean. Prompt them for: real UI names, concrete numbered steps,
   a specific assertable expected result, and correct severity.
3. **Honesty gate (§No-Illusion).** If a feature is **not yet built** (e.g. NOC outbound
   publish — see skill 126), still write the case but begin its Expected Result with
   "Feature not yet implemented … — expected behaviour once built:" and keep severity as-is.
   Never present a stubbed/unbuilt flow as working.
4. **Moving cases between tabs.** When a feature moves surface (e.g. "Import PBS material"
   from Scenario → Integration), drop it from the origin source JSON and renumber that tab's
   IDs sequentially; let the destination tab carry the (usually richer) replacement cases.
5. **Build** with `scripts/build_uat_workbook.py <manifest.json>` (see below).
6. **Verify (§No-Illusion).** Reload the .xlsx: confirm sheet list, per-tab case counts,
   a sample case's steps/expected, the Latest-Result formula, dropdowns on every round
   column, and that the Summary sums all tabs. Paste the receipt.
7. **Version files, don't overwrite.** New version → new file (`... - V<N>.0.xlsx`) in
   `docs/UAT/`; keep prior versions.

## Case JSON schema (what each reader subagent writes)

```json
{"section":"<surface>","cases":[
  {"id":"T2-LV-001","feature_area":"Live — Roster","help_ref":"Live › Setting date range",
   "title":"<short test title>","preconditions":"<state needed>",
   "steps":"1. ...\n2. ...\n3. ...","expected":"<specific observable result>",
   "severity":"High|Medium|Low"}
]}
```

- `id`: `T<tab>-<PREFIX>-<NNN>` sequential per tab (e.g. `T2-LV`, `T3-LG`, `T4-CP`, `T5-IN`).
  The builder's Summary counts IDs matching `T?-*`, so keep this prefix shape.
- `feature_area`: becomes a coloured band grouping cases inside the tab (input order preserved).
- Severity: core data / legality / save / integration sync = High; filters/navigation/browse
  = Medium; cosmetic/personalization = Low.

## Builder — `scripts/build_uat_workbook.py`

Manifest-driven, N-round. Needs `openpyxl` (use a venv; the OS python is PEP-668 managed).

```bash
python3 -m venv /tmp/uatvenv && /tmp/uatvenv/bin/pip install -q openpyxl
/tmp/uatvenv/bin/python scripts/build_uat_workbook.py manifest.json
```

Manifest (paths resolve relative to the manifest's own directory; `output` may be absolute):

```json
{
  "output": "docs/UAT/F8 PBS UAT Test Cases - V3.0.xlsx",
  "airline": "F8 (Flair)", "round_label": "UAT — 3 Test Rounds",
  "rounds": 3, "ref_date": "2026-08-25",
  "summary_title": "F8 (Flair) PBS — UAT Test Cases — Summary",
  "tabs": [
    {"name":"T2 Admin UI","title":"T2 — Admin UI  (Live & Scenario)  —  Admin user",
     "subtitle":"…reference line…","area":"Live & Scenario admin (Altair)",
     "sources":["t2_live.json","t2_scenario.json"]}
  ]
}
```

What it emits per test tab: banner + subtitle, a two-row header (round group over
Result/Tester/Notes sub-columns), feature-area bands, one row per case, a **Latest Result**
formula column (newest non-blank round, else "Not Tested"), and a Help Reference column.
Result cells are Pass/Fail/Blocked/Partial Pass/Not Tested dropdowns; Priority is a dropdown.
Panes freeze at Test ID + Feature. `rounds` controls how many UAT rounds render (1..N).

The **Summary (T1)** is auto-computed from each tab's Latest Result column: Total, Passed,
Failed, Blocked, Partial, Not Tested, **Ready for Re-test** (= Fail+Blocked+Partial),
Pass Rate %, Tested %, plus blank Owner / Last Update for leads to fill. A case that fails
round 1 then passes round 2 counts as Passed (Latest Result wins).

Below the Summary table the builder renders the **How to use** notes and then a **Change Log**
section, both data-driven — the Change Log comes from `manifest["changelog"]` (newest version
first). Keep it a running history: each version is `{version, date, items[], current?}`; add a
new top entry per release and set `"current": true` on only the latest. Update the changelog in
the **current** version's file first, then carry it forward (with a fresh top entry) when you
bump to the next version — never rewrite past entries.

```json
"changelog": [
  {"version":"V5.0","date":"2026-08-26","current":true,
   "items":["<what changed since the previous version>", "…"]},
  {"version":"V4.0","date":"2026-08-25",
   "items":["<what that version introduced>"]}
]
```

## Notes

- End-user language only; UI strings in English (project rule). No secrets in the workbook.
- Owner / Last Update on the Summary are intentionally blank — do not invent owner names.
- This is a documentation deliverable (no app UI change), so no Playwright test is required;
  the §No-Illusion proof here is the reload-and-verify of the generated .xlsx.
