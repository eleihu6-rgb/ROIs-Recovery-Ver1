# ROIS Rule Studio — design review package

Open [index.html](index.html) directly in a browser. No server, installation, login or network connection is needed. Keep `styles.css` and `app.js` alongside the HTML files. Browser refresh resets the scripted session; changes are not persisted.

- [A: Guided Workbench](workbench.html) — recommended product shell; starts at the rule definition.
- [B: Evidence Dossier](dossier.html) — source and evidence-led review; starts at the test register. Approve the definition before approving its test plan.
- [C: Visual Rule Lab](lab.html) — clickable rule map and seven-day roster examples.
- [Requirements](requirements.md) — research references, semantics, lifecycle, test strategy, versioning, permissions, scope, risks and open decisions.
- [Source inventory](source-inventory.md) — inspected Rust candidates and known evidence limitations.

## Walkthrough

1. In step 3, change separate days to consecutive days. Save as a new revision.
2. Approve steps 3 and 4. Build a simulated candidate in step 5.
3. In step 6, simulate the individual suite, then the optimizer benchmark. Inspect expected versus actual results by selecting a case.
4. In step 7, prepare a review packet. No real release approval or activation occurs.
5. Return to step 3 and change a parameter. The new revision invalidates dependent approvals and evidence; step 7 locks again.
6. To explore failure: step 4 → Load missing-context failure example → approve steps 3 and 4 → build → individual suite. DO-05 fails and the optimizer remains blocked. Follow “Discuss and revise definition,” enable complete context, save, approve, rebuild and rerun.
7. Leave a chat note, visit another step, then return: the note remains attached to its original stage/revision. Open Version history and create a new draft from an earlier version.
8. In the Rule Lab, click calendar dates to cycle FLY / DO / BLANK. This changes the illustrative roster only, not the approved test specification or evidence.

The mock groups individual execution into one scripted action. The production design requires separate unit/property/adapter and real Gantt evidence before optimizer execution. The case previews pin X=7/Y=2 and eligibility values; they are not a generated exhaustive suite for arbitrary edited parameters. Historical run comparison, upload/OCR, real AI clarification, full revision manifests, Rust diffs, signatures and release are specified product behavior, not functioning integrations in these mocks.

## Verification receipt

Run from repository root on 2026-09-14:

```sh
node --check docs/superpowers/specs/2026-09-14-rule-studio-Ver1/app.js
node docs/superpowers/specs/2026-09-14-rule-studio-Ver1/verify.cjs
npm run check:ui
python3 docs/superpowers/specs/2026-09-14-rule-studio-Ver1/check-docs.py
```

- JavaScript syntax: PASS.
- Playwright Chromium: PASS for all three concepts. Browser opened local HTML via `file:`; no product service was started. Verified revision changes, stage-local chat, blocked forward actions, successful flow, failed assertion, correction/rerun, stale-release lock, revision restore, invalid input and 760px document-width overflow; no browser JavaScript errors.
- UI standard gate: PASS, zero hard violations and 124 existing warnings outside this design package. The repository scanner covers application source; HTML mock layout was reviewed separately.
- Local document paths, assets, source references and whitespace: PASS, see `check-docs.py`.
- Latest Playwright screenshots listed in [verification.json](verification.json) were all opened and visually inspected by the primary agent. Checked layouts, readable text, state labels, disabled gates, complete forms and correct example counts. Earlier captures are preserved with version suffixes.

Screenshots from the latest successful run:

- [Workbench definition](../../../assets/screenshots/rule-studio/workbench-definition-Ver2.png)
- [Dossier evidence register](../../../assets/screenshots/rule-studio/dossier-evidence-Ver1.png)
- [Visual Rule Lab](../../../assets/screenshots/rule-studio/lab-definition-Ver2.png)
- [Failed assertion and blocked optimizer](../../../assets/screenshots/rule-studio/workbench-failure-Ver2.png)
- [Workbench review](../../../assets/screenshots/rule-studio/workbench-review-Ver2.png)
- [Dossier review](../../../assets/screenshots/rule-studio/dossier-review-Ver2.png)
- [Lab review](../../../assets/screenshots/rule-studio/lab-review-Ver2.png)
- [Overview](../../../assets/screenshots/rule-studio/design-overview-Ver2.png)

No product/engine runtime checks were required for this documentation-only task. Rust tests, real Gantt UI tests and optimizer benchmarks were not run; the design does not claim they pass. `pbs-engine/` is absent in this checkout. Production semantics and performance thresholds remain review decisions. No application source or database was changed, and no commit/push was made.

A bounded supporting agent researched Rust candidates; the primary agent reviewed the relevant actual counting, rolling-window, group-match and optimizer-dispatch source before using its findings. Design and mockups were completed by the primary agent.
