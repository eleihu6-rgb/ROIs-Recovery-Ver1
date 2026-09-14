# Guided Workbench Ver 2

[Open the interactive mock](index.html) · [Design specification](requirements.md) · [Source reference checks](source-reference.md)

This is a separate Ver 2 design package. Every existing file in `../2026-09-14-rule-studio-Ver1/` remains byte-for-byte unchanged, verified against SHA-256 hashes captured before work. Open `index.html` directly in a browser; no server or login is required. Keep the accompanying CSS, JavaScript and `replays/` directory together. Refresh resets the session.

## What changed

- Three lifecycle steps: **Define rule → Define test cases → Build and test**.
- Definition includes basic requirement intake, inspected candidate descriptions/usage/parameter tables, and Modify existing / Copy and enhance / Start new choices.
- Mandatory Bases / Ranks / Fleets / Crew Teams, typed rule parameters, effective dates and column explanations; Rule 8056 is the reference for applicability.
- Clarification table, visual A/B roster logic, Soft / Hard / Password override policy, and optimizer tolerance are inside the definition.
- “Discuss with AI” beside sections and reference arrows beside fields, clarification rows and cases attach the target, value and draft version directly to chat. The user only types the requested change.
- Optimizer tolerance keeps matching inherited findings visible, permits unchanged/improved inherited findings, and rejects new or worsened findings. Repairing an old finding cannot offset a new one even if the total count stays the same.
- 24 individually listed cases, including intended warnings and tolerance cases, plus explicit optimizer scope and additional-seconds / percentage / per-call latency budgets.
- Basic coding progress and plain-language logic by default; expandable illustrative candidate skeleton, Git concepts and version comparison. Builds automatically return to step 2 with results.
- Animated GIF previews with static alternatives, distinct run IDs, retained pass/fail/cancel attempts, archived case results, stale-evidence gates and separate release review.

## Suggested walkthrough

1. Submit the prefilled requirement with **Understand & find matches**. Expand 7505/7508 details and choose **Copy and enhance**.
2. Open **Applicability & parameters**. Use the arrow beside **Bases** to cite it to the chat, then type a requested change. The citation remains attached to the sent message and old draft version.
3. Change and save parameters. Open **Clarify & visual logic**, confirm the decisions, and compare A/B examples. Inspect the tolerance examples and try citing the tolerance section.
4. Open **Enforcement & approval**, choose/save the desired policy if needed, then approve the definition.
5. In step 2, inspect the individual cases and optimizer scope/budgets. Approve the test plan.
6. In step 3, inspect progress and optionally expand code/Git comparison. Click **Build & automatically test**; the mock returns to step 2 with case results and a benchmark.
7. Select a case, play/pause its GIF, and inspect the expected warning separately from the test PASS/FAIL result.
8. Rerun with a logic failure or performance failure, or cancel. Open **Run history** to inspect a prior attempt. Change a definition parameter and observe the new revision blocking stale build evidence.

The replay files are browser captures of the prototype's fixed example fixtures and initial Hard-policy behavior. They are not recaptured when draft parameters/enforcement change; real evidence must be captured for the actual build/run/parameter version. The visible current expected-response column can therefore differ from the fixed example recording after changing enforcement. Production must never attach a mismatched recording as current run evidence.

The prototype simulates all approval, matching, code and execution behavior. Candidate code is an illustrative skeleton, not a production Rust module. No actual AI interpretation, password check, Git commit, build, optimizer measurement, Gantt assignment or deployment occurs. Positive tolerance cases intentionally retain inherited violations; they are accepted under the stated policy, not called legally clean.

## Verification receipt

Executed from repository root on 2026-09-14:

```sh
node --check docs/superpowers/specs/2026-09-14-rule-studio-Ver2/app.js
node docs/superpowers/specs/2026-09-14-rule-studio-Ver2/capture-replays.cjs
python3 docs/superpowers/specs/2026-09-14-rule-studio-Ver2/make-gifs.py
node docs/superpowers/specs/2026-09-14-rule-studio-Ver2/verify.cjs
npm run check:ui
python3 docs/superpowers/specs/2026-09-14-rule-studio-Ver2/check-artifacts.py
```

- JavaScript syntax: PASS.
- Playwright Chromium on local `file:` HTML: PASS. Covers all three steps, matching/authoring choices, invalid Y>X, scope editing, field/case citations and chat focus, tolerance modes, enforcement, approval gates, collapsed code, automatic results, GIF/static toggle, performance deltas, logic/performance failures, cancel, retained historical runs, stale-revision lock, version diff and 800px document overflow. No browser JavaScript errors.
- GIF capture/encoding: PASS — 24 animated GIFs, three frames each, with matching static previews. Sample replay frames were visually inspected; frame structure/dimensions checked for all files. No external image-generation service used.
- UI standard gate: PASS — 0 hard violations, 124 existing warnings outside this design package. This scanner covers product source; prototype visuals were inspected separately.
- Documentation links, assets, whitespace and original Ver 1 preservation: PASS.
- All 10 screenshots from the final successful Playwright run were opened and visually inspected. [Machine-readable receipt](verification.json) lists exact paths. Earlier captures are retained.

Key screenshots:

- [Intake](../../../assets/screenshots/rule-studio-ver2/01-intake-Ver4.png)
- [Matches and authoring choice](../../../assets/screenshots/rule-studio-ver2/02-match-and-choice-Ver3.png)
- [Parameters and cited chat](../../../assets/screenshots/rule-studio-ver2/03-parameters-citation-Ver3.png)
- [Visual logic and tolerance](../../../assets/screenshots/rule-studio-ver2/04-logic-tolerance-Ver2.png)
- [Enforcement](../../../assets/screenshots/rule-studio-ver2/05-enforcement-Ver2.png)
- [Build progress](../../../assets/screenshots/rule-studio-ver2/06-build-default-Ver2.png)
- [Automatic case results](../../../assets/screenshots/rule-studio-ver2/07-auto-results-Ver2.png)
- [Optimizer benchmark](../../../assets/screenshots/rule-studio-ver2/08-benchmark-Ver2.png)
- [Failed case](../../../assets/screenshots/rule-studio-ver2/09-failure-Ver2.png)
- [Version comparison](../../../assets/screenshots/rule-studio-ver2/10-version-compare-Ver2.png)

[Example GIF: expected warning](replays/01B.gif) · [Example GIF: new violation despite equal count](replays/10B.gif)

No product runtime checks were required for this documentation/mockup task. Real Rust, Gantt, override authorization and optimizer tests remain future implementation gates. A supporting agent performed bounded read-only 8056/enforcement research; primary-agent source review and design decisions are recorded in `source-reference.md`. No application files or database rows were modified, and no commit/push occurred.
