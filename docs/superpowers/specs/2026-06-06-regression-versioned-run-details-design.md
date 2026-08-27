# Regression Versioned Run Details - Design Spec

> Date: 2026-06-06
> Status: Approved by user on 2026-06-06 - implementation in progress
> Scope: Gantt Regression tab + `ai-server` regression store/routes

## 1. Request

Enhance the Regression tab so each test case records detailed execution evidence, not only pass/fail/duration. The user example is:

- switch Gantt to date range X-Y
- click a pairing jump control (`<<` or `>>`)
- record pairing id and pairing date
- verify Gantt jumps to date range M-N

This is an overall requirement for every regression case. Each test-case edit must create a new case version, and each version can have multiple test rounds. The UI should show the latest status by default, while allowing users to inspect previous versions and every run round under each version.

Additional UI requirement from the same request: update tooltips and the tester manual on the Regression tab so testers understand version jumps, run rounds, evidence recording, and how to inspect older results.

## 2. Current Behavior

- `RegressionStore.record_run()` updates aggregate fields (`last_status`, `run_count`, `pass_count`, `fail_count`, duration, log).
- The same method appends a flat `versions[]` entry with `trigger='run'`.
- `update_test()` changes title/category/priority/description in place and does not create a new logical version for the edited definition.
- The row expansion UI (`VersionHistory`) renders a simple reverse chronological list and cannot show nested run rounds or structured test evidence.

Result: a tested case like `#1145` shows the latest pass row, but does not preserve what was tested in the first round, what inputs were used, what actual values were observed, or how later fixed rounds compare to earlier failed rounds.

## 3. Target Behavior

Each regression test stores:

1. **Case versions** - immutable snapshots of the test definition/script at edit/apply time.
2. **Run rounds** - multiple execution records attached to the active case version.
3. **Structured details** - human-readable and machine-readable evidence for what the run did and observed.

The list view remains optimized for latest status:

- row status, duration, last run, stable/fail badge use the latest run of the latest version
- expanded row opens a version selector/timeline
- latest version is selected by default
- each selected version shows its run rounds newest-first, with status, run time, duration, trace/log, and details

## 4. Data Model

Keep file storage in `ai-server/regression_tests.json`; no DB schema change.

Add/normalize these fields per test:

```jsonc
{
  "active_version": 3,
  "versions": [
    {
      "version": 1,
      "timestamp": "2026-06-06T10:00:00Z",
      "trigger": "created|edit|script|import",
      "title": "string",
      "category": "string",
      "priority": "High|Medium|Low",
      "description": "string",
      "spec_file": "gantt/pairing-pane.spec.ts",
      "test_name": "REG-...",
      "code": "optional generated test block",
      "rounds": [
        {
          "round": 1,
          "run_id": "run-12",
          "status": "pass|fail|flaky",
          "run_at": "2026-06-06T10:05:00Z",
          "duration_ms": 2800,
          "log": "short failure or stdout excerpt",
          "has_trace": true,
          "details": {
            "summary": "Switch to 2026-06-01..2026-06-15, click >> on pairing TG123 2026-06-08, expect 2026-06-16..2026-06-30.",
            "steps": [
              { "action": "set_date_range", "from": "2026-06-01", "to": "2026-06-15" },
              { "action": "click_pairing_jump", "pairing_id": "TG123", "pairing_date": "2026-06-08", "direction": ">>" },
              { "assertion": "gantt_date_range", "expected_from": "2026-06-16", "expected_to": "2026-06-30", "actual_from": "2026-06-16", "actual_to": "2026-06-30" }
            ],
            "artifacts": []
          }
        }
      ]
    }
  ]
}
```

Backward compatibility:

- Existing flat version entries without `rounds` remain readable.
- Existing `trigger='run'` entries can be displayed as legacy rounds under a synthetic legacy version, or normalized on load.
- Existing aggregate fields remain for fast list rendering.
- Cap each version to the latest 50 rounds and each test to the latest 50 versions unless user later asks for archive behavior.

## 5. Recording Run Details

### 5.1 Automated Playwright Runs

Extend Playwright result parsing to capture structured annotations/attachments when available:

- test status/duration/error remain from the JSON reporter
- trace remains linked through current artifact handling
- details are collected from one of these mechanisms:
  - preferred: test annotations with a stable key such as `regression:detail`
  - fallback: stdout lines prefixed with `REGRESSION_DETAIL: {json}`
  - fallback: failure/error message and trace only

This lets test authors add quantified evidence without changing every test immediately. Example Playwright helper can be added later:

```ts
recordRegressionDetail(testInfo, {
  summary: 'Pairing jump moved the Gantt date range',
  steps: [...]
})
```

### 5.2 Manual/User Round Recording

Add an endpoint for user-entered rounds:

`POST /ai/regression/tests/{test_id}/versions/{version}/rounds`

Body:

```json
{
  "status": "pass",
  "duration_ms": 0,
  "details": {
    "summary": "Manual retest after fix",
    "steps": [...]
  },
  "log": "optional notes"
}
```

This covers the workflow where a user validates a fix outside the automated runner and wants the same versioned audit trail.

## 6. Versioning Semantics

Create a new case version when:

- title/category/priority/description changes
- generated Playwright code is applied
- spec file/test name changes
- imported metadata changes materially

Do not create a new version when:

- a run round is recorded
- quarantine toggles
- aggregate counters update

Every run round attaches to `active_version` unless a specific version is supplied. This preserves “case v1 failed twice, case v2 passed after fix” without mixing results.

## 7. API Changes

Keep existing endpoints and extend payloads:

- `GET /ai/regression/tests` returns latest aggregate fields as before, plus `active_version` and latest version summary if useful.
- `GET /ai/regression/tests/{id}/detail` returns full versions and rounds.
- `POST /ai/regression/runs` remains the runner entry point; internally records rounds under the active versions.
- Add `POST /ai/regression/tests/{id}/versions/{version}/rounds` for manual rounds.
- Optional later: `GET /ai/regression/tests/{id}/versions/{version}` for lighter detail loading if the JSON grows large.

## 8. UI Design

### List View

Keep the current compact operational list:

- latest status only
- latest duration and last run
- stable/fail badge uses all rounds or latest-version rounds; default should be all rounds for reliability, with version-specific status visible in detail
- row background reflects latest run of active version

### Expanded Detail

Replace the flat version list with a two-level panel:

- left/top segmented selector: `Latest v3`, `v2`, `v1`
- version header: title snapshot, trigger, timestamp, script/spec metadata
- rounds table: `Round`, `Status`, `Run time`, `Duration`, `Details`, `Trace/Log`
- newest round first, with a compact timeline count such as `v2: 1 fail -> 2 pass`
- details drawer inside each round shows structured steps:
  - inputs/preconditions
  - action details such as pairing id/date and direction
  - expected vs actual assertions
  - error/log excerpt and trace link

### Tooltips

Every compact/icon-only control in the Regression tab must have a precise tooltip and accessible label. Required tooltip content:

- Row chevron: `Show versions and run rounds`
- Row run: `Run the latest version of this test`
- Category run: `Run all runnable tests in this category`
- Run All: `Run all non-quarantined tests, failing cases first`
- Wand/generate: `Generate or regenerate Playwright for the active version`
- Shield: `Quarantine excludes this test from Run All until it is stable`
- Trace link: `Download Playwright trace for this run round`
- Version selector: `Show test definition and run rounds for version vN`
- Round detail toggle: `Show recorded test evidence, expected values, actual values, logs, and artifacts`
- Manual round button: `Record a manual test round for the selected version`
- Import specs: `Import Playwright specs from e2e/tests; safe to repeat`

Tooltips should explain the control outcome, not restate the icon name. They must not cover critical row content or overflow outside the viewport on the right edge.

### Tester Manual

Update the existing `RegressionInfo` popover manual so it covers the new workflow. It should remain non-modal and concise, but include:

1. **Catalog and case creation** - import existing Playwright specs or add a plain-English case.
2. **Version rule** - editing title/story/category/priority or applying generated code creates the next version.
3. **Run round rule** - every automated run or manual retest records a round under the selected/active version.
4. **Evidence rule** - testers should record concrete inputs, actions, expected values, and actual values. Example: `date range X-Y`, `pairing id`, `pairing date`, `<< / >>`, expected jump range `M-N`, actual jump range.
5. **Latest view rule** - the row always shows the latest active-version result, but older versions remain available from the expanded history.
6. **Failure/fix workflow** - if v1 fails, fix the product or test, save/apply as v2, run again, then compare v1 failed rounds to v2 passing rounds.
7. **Artifacts** - use trace/log links for debugging, and avoid storing credentials, tokens, or sensitive crew personal data in notes.

The manual should also include a compact badge/control glossary for status, flaky/stable, quarantined, version, round, trace, and manual round.

### Add/Edit Test

When saving edits to an existing test, show clear copy in the dialog footer:

`Saving changes creates vN+1. Existing run rounds remain under older versions.`

## 9. Testing Plan

Backend pytest:

- creating a test initializes `active_version=1` with empty `rounds`
- editing a test creates version 2 and leaves version 1 rounds intact
- applying generated code creates a new version with code snapshot
- `record_run()` appends a round under active version and updates latest aggregate fields
- manual round endpoint appends a round with structured details
- legacy store data without `active_version`/`rounds` loads safely

Frontend tests:

- expanded row defaults to latest version
- previous version can be selected and shows its own rounds
- a failed v1 and passed v2 display latest row as pass while preserving v1 fail details
- long step/detail text wraps and does not overlap action buttons
- all icon-only actions expose the required tooltip/accessible label text
- the Regression info popover manual documents version jumps, run rounds, evidence recording, and the failure/fix workflow

Playwright:

- Regression tab row expansion shows latest version and a round detail containing pairing id/date/date-range evidence from a stubbed API response.
- Regression tab info popover shows the tester manual sections for version rule, run round rule, and evidence rule.

## 10. Non-Goals

- Do not introduce a database table.
- Do not require all existing Playwright specs to emit structured detail immediately.
- Do not redesign the entire Regression page.
- Do not change Gantt test behavior in this task except optional helper support for structured evidence.
- Do not store sensitive credentials, tokens, or personal data in run details.

## 11. Risks

| Risk | Mitigation |
|---|---|
| JSON file grows quickly. | Cap versions and rounds; consider lazy detail endpoint later. |
| Existing legacy `versions[]` shape breaks UI. | Normalize on load and keep defensive rendering. |
| Details become vague prose. | Provide structured `steps[]` schema and render expected vs actual fields clearly. |
| Runtime parser misses Playwright evidence. | Support both annotations and prefixed stdout JSON, with trace/log fallback. |

## 12. Approval Needed

Please approve this design before implementation. After approval, implementation should proceed in small steps: backend model/tests first, then UI detail panel, then optional Playwright detail helper.
