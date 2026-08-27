# Regression Round Evidence Snapshots - Design Spec

> Date: 2026-06-06
> Status: Brainstorming draft - awaiting user approval
> Scope: Gantt Regression tab + `ai-server` regression artifacts + Playwright evidence helpers

## 1. Request

When Playwright runs each Regression case, the run result details must also include a visual snapshot.

Requirements:

1. The snapshot must capture what was actually tested and be related to the test item. It must not be a generic or misleading screenshot.
2. Snapshot file names must contain test case id, case version, test round, and timestamp.
3. The Regression tab should show the snapshot by default with the test result details.
4. Users can delete a snapshot.

## 2. Current Behavior

The current Regression round model records:

- status, duration, run id, run time
- log and trace flag
- structured details through `REGRESSION_DETAIL: {json}`
- trace zip download when Playwright trace exists

It does not persist a normal image snapshot per round, and the UI has no image preview or delete action.

## 3. Target Behavior

Every run round can carry one or more evidence snapshots:

- visible by default in the expanded round detail
- linked to a structured detail step or evidence summary
- stored as local artifact files under the AI server artifact root
- deletable from the Regression tab

The snapshot is treated as test evidence, not decoration. For a case like “click pairing `>>` jumps date range,” the snapshot should be captured at or immediately after the asserted state and accompanied by structured details such as:

- date range before
- pairing id
- pairing date
- jump direction
- expected date range
- actual date range

## 4. Data Model

Extend each `RegressionRound.details.artifacts[]` item:

```jsonc
{
  "type": "snapshot",
  "id": "snap-1001-v2-r3-20260606T191522Z",
  "filename": "case-1001-v2-r3-20260606T191522Z-pairing-jump.png",
  "url": "/ai/regression/tests/1001/versions/2/rounds/3/snapshots/case-1001-v2-r3-20260606T191522Z-pairing-jump.png",
  "label": "After clicking >> on pairing TG123",
  "step_index": 2,
  "created_at": "2026-06-06T19:15:22Z",
  "deleted": false
}
```

Rules:

- File name format:
  `case-{test_id}-v{version}-r{round}-{timestamp}-{safe_label}.png`
- Timestamp format:
  UTC compact ISO, e.g. `20260606T191522Z`
- `safe_label` is slugified and bounded.
- Deleted snapshots are removed from disk and either removed from `artifacts[]` or retained as `{ deleted: true }` for audit. Preferred v1 behavior: remove from UI and mark deleted in JSON so the round still records that a snapshot existed.

## 5. Capturing Snapshots

### 5.1 Preferred: Explicit Evidence Snapshot Helper

Add an E2E helper, for example:

```ts
await recordRegressionSnapshot(page, testInfo, {
  label: 'pairing-jump-after-click',
  stepIndex: 2,
  details: {
    pairingId: 'TG123',
    pairingDate: '2026-06-08',
    direction: '>>',
    expectedRange: '2026-06-16..2026-06-30',
    actualRange: '2026-06-16..2026-06-30',
  },
})
```

The helper:

- captures `page.screenshot({ fullPage: false })`
- writes to Playwright `test-results` as an attachment
- emits a structured stdout line such as:

```text
REGRESSION_SNAPSHOT: {"label":"pairing-jump-after-click","step_index":2,"attachment":"...png","details":{...}}
```

This is the no-illusion path: the snapshot is taken at the business assertion point and includes exact evidence metadata.

### 5.2 AI-Generated Tests

Update the Playwright generation prompt so generated tests must:

- call the snapshot helper after the final quantified assertion or after a key intermediate assertion
- include the tested entity in metadata, such as pairing id/date or selected filter value
- not use a generic page-load screenshot as the only evidence

The validation gate should flag generated code that has no `recordRegressionSnapshot(...)` call once this feature is enabled.

### 5.3 Existing Imported Tests

Existing tests may not immediately use the helper. For v1:

- If a test emits `REGRESSION_SNAPSHOT`, the UI shows the related snapshot as verified evidence.
- If no snapshot exists, the round detail shows `No evidence snapshot recorded` and the tester manual tells users to add the helper.
- Do not silently create a generic final-page screenshot and present it as evidence, because that violates the no-illusion requirement.

Optional later phase: add helper calls to high-priority Gantt/PBS tests incrementally.

## 6. Artifact Storage

Store snapshots under the existing artifact root:

```text
ai-server/artifacts/{run_id}/snapshots/
```

For manual rounds, use:

```text
ai-server/artifacts/manual/{test_id}/v{version}/r{round}/
```

The AI server copies or moves Playwright attachment files into the canonical file name:

```text
case-1001-v2-r3-20260606T191522Z-pairing-jump-after-click.png
```

Security:

- Only serve files from `_ARTIFACT_ROOT`.
- Reject path traversal.
- Only allow `.png` for v1.
- Do not store credentials, tokens, or sensitive crew personal data in labels/metadata.

## 7. API Changes

Add endpoints:

| Method + path | Purpose |
|---|---|
| `GET /ai/regression/tests/{test_id}/versions/{version}/rounds/{round}/snapshots/{filename}` | Serve snapshot image |
| `DELETE /ai/regression/tests/{test_id}/versions/{version}/rounds/{round}/snapshots/{filename}` | Delete/mark snapshot deleted |

Existing `GET /tests/{id}/detail` returns round artifact metadata so the UI can render thumbnails without another metadata call.

## 8. UI Design

In `VersionHistory` round detail:

- Show snapshots by default above logs.
- Use a constrained thumbnail strip or single preview area:
  - image max height around 220px
  - preserve aspect ratio
  - no nested decorative cards
  - allow opening full image in a new browser tab
- Each snapshot shows:
  - label
  - timestamp
  - optional step index
  - delete icon button with tooltip `Delete this evidence snapshot`
- If no snapshot exists, show a compact empty line: `No evidence snapshot recorded for this round.`

Deletion UX:

- Delete button asks for lightweight confirmation.
- After delete succeeds, remove the thumbnail from the current round view.
- If the deleted snapshot was the only snapshot, show the empty snapshot line.

## 9. Tester Manual And Tooltips

Update the Regression tab manual:

- snapshots are required evidence for new/AI-generated tests
- take snapshots at assertion points, not at unrelated page states
- labels must name the tested entity/action
- example: `After clicking >> on pairing TG123, date range is 2026-06-16..2026-06-30`
- deleted snapshots disappear from UI but the run result still remains

Required tooltips:

- snapshot thumbnail: `Evidence snapshot captured during this run round`
- open snapshot: `Open evidence snapshot`
- delete snapshot: `Delete this evidence snapshot`
- no snapshot warning/help: `This round has result details but no related evidence snapshot`

## 10. Testing Plan

Backend pytest:

- parses `REGRESSION_SNAPSHOT` stdout into artifact metadata
- copies a Playwright snapshot attachment into canonical file name
- canonical file name includes test id, version, round, timestamp
- serves snapshot image and rejects traversal
- delete endpoint removes file and marks artifact deleted
- deleting one snapshot does not delete logs, trace, or the run round

Frontend / Playwright:

- expanded round detail shows snapshot by default
- snapshot label includes related tested item metadata
- delete snapshot removes it from the UI
- no-snapshot round shows the explicit empty/help text
- tester manual includes snapshot rules

## 11. Non-Goals

- Do not store screenshots in PostgreSQL.
- Do not require retroactive snapshots for historical runs.
- Do not auto-create generic screenshots and call them evidence.
- Do not implement bulk snapshot deletion in v1.
- Do not support video or non-PNG artifacts in v1.

## 12. Approval Needed

Please approve this design before implementation.
