---
name: 003-online-help-writing
description: Write or update the gantt in-app online Help (gantt/src/components/help/), or action test-team Help feedback docs. Triggers when the user mentions Help pages/topics/articles, Help screenshots, a "Help-XXX Feedback" doc, or asks to document a UI feature in Help. Enforces verify-against-code, match-UI-wording, screenshot, and test discipline so Help never drifts from the product.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Agent
---

# Online Help Writing (ROIS-AI gantt)

The in-app Help is a **user-facing operating manual**. Its only job is to be **accurate to the current UI and code**. Every recurring complaint from the test team has the same root cause: the manual drifted from what the app actually does. This skill is the playbook that prevents that.

> Hard rule: **never describe Help content from memory or an old build.** Open the component that implements the feature and read it before you write a word.

## System map — where Help lives

| File / dir | Role |
|---|---|
| `gantt/src/components/help/help-data.ts` | Topic registry: `slug`, `title`, `stepCount`, `overview`, grouped into categories. The left-nav + search read this. |
| `gantt/src/components/help/help-view.tsx` | `slug → lazy(() => import topic)` map. A new topic MUST be added here AND in help-data. |
| `gantt/src/components/help/topics/<area>/<slug>.tsx` | One file per topic. Uses `HelpStep`, `HelpNote`, `HelpTip`, `HelpWarning`, `HelpH2`, `HelpScreenshot`, `HelpControlsRef` from `../../help-article`. |
| `gantt/src/components/help/use-help-examples.ts` | Client-specific examples (`ex.base`, `ex.baseTz`, `ex.fleet`). Use these instead of hardcoding airport/fleet codes (a test enforces "no BKK/Bangkok"). |
| `gantt/public/help/screenshots/*.png` | Every `HelpScreenshot src`. Generated, not hand-made. |
| `e2e/scripts/capture-help-screenshots.ts` | The capture harness (Playwright). Run it to (re)generate screenshots. Needs gantt :5173 + live-server :3000 up. |
| `e2e/tests/gantt/help/*.spec.ts` | Help tests: `help-screenshots` (image-count + loaded + ≥200px), `help-navigation`, `help-client-examples`, `help-controls-icons`, plus per-feedback content specs. |

## Workflow (do these in order)

1. **Read the feedback / requirement fully.** If it's a `Help-XXX Feedback*.docx`, extract it:
   `unzip -o "<doc>.docx" -d /tmp/fb && python3 -c "import re,html;x=open('/tmp/fb/word/document.xml').read();[print(html.unescape(''.join(re.findall(r'<w:t[^>]*>(.*?)</w:t>',p,re.S)))) for p in re.split(r'</w:p>',x) if ''.join(re.findall(r'<w:t[^>]*>(.*?)</w:t>',p,re.S)).strip()]"`
2. **Map each item to the component that implements it.** Grep for the dialog/toolbar/field. Read it. The code is the source of truth.
3. **Apply the feedback-handling protocol** (below) per item.
4. **Edit the topic `.tsx`** to match reality. Keep `help-data.ts` `stepCount`/`overview`/`title` in sync.
5. **Fix the capture script crop/target if needed**, then regenerate screenshots and **Read each PNG to eyeball it**.
6. **Write/update a content regression spec** asserting the corrected text. Update any stale spec your rename/restructure touched.
7. **Bump `FRONTEND_VERSION`** in `gantt/src/version.ts` (+1 per commit that touches frontend code, incl. Help topics).
8. **Run tests, paste PASS receipts** (§No-Illusion). Only then is it done.

## Legality coverage check (run with every Help pass touching rules)

Rules are added to the template (`sql/seed/07-rule.sql` + `sql/migration/*rule*.sql`)
independently of Help, so a new rule can ship with no topic (rule **1001 Assignment Overlap**
was added 2026-07-08 and initially missed). Before/while refreshing the Legality category, run:

```bash
node scripts/check-legality-help-coverage.mjs
```

It compares template rule **functions** against the Help topics (seed instances `001` ≠ the
workset instances Help documents, so compare by function number) and reports:

- `GAP fn name` — a template rule with no Help topic. Verify it's a Flight-Deck rule in the
  F8 workset; if so, add it (a `_rule-doc.tsx` `RULE_DOCS` entry keyed `fn/inst` + a thin
  `legality-<fn>.tsx` wrapper + `help-data.ts`/`help-view.tsx` registration + a content
  regression test). Ignore PO/PBS/ground rules that legitimately have no topic.
  **Insert the new `help-data.ts` entry in rule-number order** — the Legality category is
  sorted ascending by rule number (1001, 2014, 7272, 7500–7507, 8002×2, 8004, 8030, 8056).
  A new rule goes between the rules it sorts between; never append it at the end.
- `DRIFT fn` — the documented rule name no longer matches the template; update the topic.
- `EXTRA fn` — a Help topic for a function no longer in the template; verify it's still current.

Non-zero exit means there are gaps/drifts to resolve.

## Sidebar menu coverage check (run with every Help pass)

The visible second-level menus under **Data**, **Legality**, **System**, and
**PBS** are a Help coverage contract. Run:

```bash
node scripts/check-help-menu-coverage.mjs
```

The checker compares the canonical `shell-sidebar.tsx` declarations to
`HELP_CATEGORIES`, using stable IDs rather than labels. Every new visible menu
item must declare `helpTopicSlug`; its Help topic must declare the same ID as
`sourceMenuId`. A non-zero result is a release blocker:

- `GAP` — a new menu is missing its Help mapping or topic. Add the topic,
  lazy import, code-verified content, and a content regression test.
- `DRIFT` — the ID, Help slug, or visible label no longer agrees. Update Help
  wording and metadata, or correct the menu mapping.
- `EXTRA` — Help claims a source menu no longer visible. Remove it or mark it
  as an intentionally non-sidebar Partial topic without `sourceMenuId`.

Do not make a topic merely to satisfy the check. Read the implemented page,
describe the current UI, and use `Partial` plus `HelpWarning` where the page is
not complete. Run the check again after the update; it must pass before commit.

## Feedback-handling protocol

- **Lines starting with `Ryan –`** (the PM) are authoritative — do exactly what they say, even over the tester's wording.
- **"enhanced" / "old snapshot" / "has been updated"** → the topic drifted from new code: **rewrite the whole topic from the current component**, don't patch one line.
- **Open questions ("is X missing?", "should this be Y?")** → answer from the code; if the code is wrong/inconsistent and a consistent product term exists, fix the code too and align Help (e.g. standardising "Rule"/"Rule Group" → "Rule Set").
- **"UI doesn't have this" / not wired** → mark the topic Partial in title + a leading `HelpWarning` ("Partial — waiting for backend service"); keep the intended-flow steps.
- **"wording differs from UI"** → make Help mirror the UI's own strings (e.g. the keyboard topic mirrors the in-app shortcuts dialog 1:1; field names match dialog labels).
- **"these two read differently but do the same thing"** → unify the wording across both topics.

## The eight quality rules

1. **Verify every claim against the component** — field labels, dropdown options & order, limits, icons, counts. Common offenders: a dialog's field names, status colours, per-type maximums, default-selected values.
2. **Match the UI's own words** as the single source of truth. If two surfaces disagree, fix the code so they agree, then document the agreed term.
3. **A screenshot crop must frame everything the prose references.** If the text calls out a button that sits in a sibling toolbar group, union the bounding boxes in the capture, don't crop it out.
4. **Capture must target the real element, then be eyeballed.** Plain-`div` overlays have no `role="menu"` — the harness silently falls back to a full-page shot. Add a `data-testid`, target it, then `Read` the PNG to confirm it's the right element and current UI.
5. **Help images must stay performance-safe.** More screenshots are preferred, but never ship oversized full-page PNGs. Prefer tight crops, keep ordinary crops under ~200 KB, keep complex dialog/table shots under ~500 KB, and keep the total screenshot-size increase for one Help update under ~1 MB unless the user approves the trade-off.
6. **Help content must be loaded on demand.** Keep `help-view.tsx` topic bodies behind `lazy(() => import(...))`. Do not import every topic or every screenshot from the Help shell, nav, home page, registry, or tests. A screenshot request should happen only after the user opens the topic that embeds it.
7. **Every topic gets a content regression test** asserting *specific text* (`toContainText('Rule Set')`, `not toContainText('Rule Group')`), never just "renders". Screenshot topics keep the loaded + `naturalWidth ≥ 200px` guard and the **exact image count** (`toHaveCount(n)`).
8. **Title must cover the topic's scope.** If steps outgrow the title, rename or split. Keep `stepCount` honest.
9. **When Help and code disagree and code is wrong, fix code too** and bump `FRONTEND_VERSION`. Don't write Help that contradicts shipped behaviour.
10. **Honour PM answers; rewrite stale sessions wholesale.**

## Screenshots — how to (re)generate

```bash
cd e2e && npx tsx scripts/capture-help-screenshots.ts   # gantt :5173 + live-server :3000 must be up
```
- Captures at `deviceScaleFactor: 2`; small crops stay ≥200px (the test guard).
- `tryShoot()` continues on failure (logs `✗ skipped`) — **a skipped capture means a missing/old PNG**, so don't reference it in a topic until it captures cleanly.
- For an interactive surface (a dialog), drive the UI in the script to open it, wait for its `data-testid`, then `shoot(dialog)`. Capture the *real* dialog — never a stand-in panel.
- Crop to the smallest region that contains what the prose references. Avoid whole-page screenshots unless the topic is about the whole page layout. If a crop is still too large, reduce the captured region before considering more compression.
- After capture, check dimensions and byte size with `file` / `stat` (or equivalent). Ordinary toolbar/dialog crops should be <200 KB; large table/page captures should be <500 KB. If a new PNG exceeds the budget, shrink the clip or optimize it before referencing it.
- If an optimizer is available, use lossless PNG optimization (`oxipng`, `optipng`) or a reviewed lossy PNG tool only when text remains crisp after visual inspection. Do not add new image-processing dependencies to the app bundle.
- After running, `Read` the new PNGs. If wrong (full page, wrong tab, stale), fix the target/crop and re-run before wiring it into a topic.

## Help Loading Performance

- The Help shell may import only lightweight registry/navigation data (`help-data.ts`) and the selected topic map. Each topic body must remain a dynamic `lazy(() => import('./topics/...'))` entry in `help-view.tsx`.
- Never replace topic lazy imports with static `import Topic from ...` imports, barrel exports that eagerly import topics, or a preloaded `allTopics` object containing JSX/content.
- Screenshots must stay as plain public URLs inside the topic component (`HelpScreenshot src="/help/screenshots/..."`). Do not import PNGs at module top level; bundlers may pull those assets into the initial Help chunk.
- Do not render hidden topics just to support search. Help search uses `title` + `overview` from `help-data.ts`; body text and images should not be loaded until topic selection.
- When touching Help architecture, add or update a Playwright/network regression that opens Help home and verifies unrelated topic screenshot URLs are not requested before selecting that topic.

## Running Help tests (paste receipts)

```bash
cd e2e && npx playwright test -c config/playwright.config.ts --project=gantt \
  tests/gantt/help/ --reporter=list --no-deps
```
- Use `--project=gantt` (sets `baseURL` for relative `page.goto('/altair/')`) and `--no-deps` (skips the pbs webServer).
- Auth is seeded via `seedGanttAuth`; the app lives at `/altair/`.
- Also run any behavioural spec your code change touched (e.g. `scenario-run.spec.ts`, `pane-limits.spec.ts`).

## New-topic checklist

- [ ] `topics/<area>/<slug>.tsx` written from the component code
- [ ] `help-view.tsx` lazy import added
- [ ] `help-data.ts` entry (title, stepCount, overview) added in the right category/order
- [ ] visible Data/Legality/System/PBS submenu has `helpTopicSlug`; its Help entry has the matching `sourceMenuId`
- [ ] `node scripts/check-help-menu-coverage.mjs` passes
- [ ] screenshots captured + eyeballed (if any), byte sizes checked, `HelpScreenshot` count matches the spec
- [ ] topic content remains lazy-loaded; no screenshots for unopened topics are requested
- [ ] content regression spec added; stale specs updated; image-count spec updated
- [ ] `FRONTEND_VERSION` bumped
- [ ] tests run, PASS receipts pasted

## Search discoverability rule

The Help search (`help-nav.tsx`) matches against **both `title` AND `overview`** (since 2026-06-27). When you write or update a topic, make sure its `overview` in `help-data.ts` contains the keywords a user would naturally type. For example, the `live-filter` topic's overview explicitly mentions "pairing label" so typing "label" in search surfaces it.

- If a topic is the canonical home for a feature name (e.g. "Pairing label"), put that name in both the `title` and `overview`.
- If a feature is *also* covered inside a broader topic (e.g. label filter inside the Filtering topic), add the keyword to *that* topic's `overview` too.
- Never rely on search finding a topic via its body text — only `title` + `overview` are searched.

## Screenshots — always prefer more

Ryan's rule: **more screenshots are always preferred**. When adding or updating a topic, capture a screenshot for every distinct UI surface the topic references — not just the main dialog. Specifically:

- Each named button/toolbar state gets its own `HelpScreenshot` (e.g. filter button active vs. inactive).
- Each step that points to a different dialog tab gets a screenshot of that tab.
- For information topics without an interactive dialog (e.g. "Pairing label"), capture the Pairing pane canvas showing a labelled puck, and the Pairing Info dialog title row showing "Label #id".

After generating, **Read each PNG** to confirm crop and content, then check byte size. A topic with 2–3 small, focused screenshots is better than one with 0; a topic with several full-page heavy PNGs is a performance bug.

## Known R'Bot Help drift (action items)

As of 2026-06-27 audit:
- `rbot-ask.tsx` claims there is an undo `×` chip on each R'Bot response — **this button does not exist** in `ai-chat-panel.tsx`. Either remove the claim or build the feature before re-publishing Help.
- `rbot-panel-open.png` and `rbot-response.png` screenshots are referenced but likely never captured (capture harness skipped them). Re-capture when servers are up and verify the PNGs before publishing.

## Notes specific to this repo

- UI strings are **English only** (CLAUDE.md). Comments/commit messages may be Chinese.
- Use semantic tokens / the typography scale (CLAUDE.md style rules) inside topic JSX; don't hardcode colours or `text-[Npx]`.
- Only sync Help right before committing, not per iteration.
- **iCloud reverts tracked edits.** This repo lives in iCloud Drive, which silently reverts on-disk
  edits to *tracked* files mid-session (new/untracked files survive). If your Help edits keep
  disappearing, that's why — do the work in a `git worktree` OUTSIDE iCloud (e.g. `/private/tmp/...`,
  symlink `node_modules`), verify there, commit, and push to `main` from the worktree.
