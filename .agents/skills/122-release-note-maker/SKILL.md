---
name: 122-release-note-maker
description: >
  Generate a new gantt Release tab release note (REL_N) covering only END-USER-FACING UI
  changes since the last release's commit cursor. Use when the user says "create a release
  note", "new release notes", "write up what changed for users", or wants the Release tab
  updated. Curates user-visible changes per nav-tab area (Live/Scenario/Rule/Data/System/
  Regression/Global), verifies wording against components, updates the §Stale-Test spec, and
  runs the proof in an iCloud-safe worktree.
---

# Release Note Maker (gantt Release tab)

> **Automation**: since 2026-08, a system cron runs this weekly (Fridays 03:00 UTC =
> 11:00 Beijing) via `scripts/weekly-help-release/weekly-help-release.sh` — a headless
> `claude -p` that invokes this skill + `online-help-writing`, runs tests, commits, pushes,
> and deploys UAT. On-demand runs still use this skill directly. The cron skips the commit
> when the window has no user-facing gantt UI changes.

The gantt **Release** tab (top-nav, after Help) holds hand-curated, **user-facing UI** release
notes. Generation is **manual / on-demand** (unlike Help, which syncs at commit time). This skill
produces the next `REL_N` and keeps the test green.

Source of truth: `gantt/src/components/release/release-data.ts`.
Renderers: `release-view.tsx` (defaults to `RELEASES[0]`), `release-detail.tsx`, `release-nav.tsx`.
Test: `e2e/tests/gantt/release-tab.spec.ts` (+ `release-fullwidth-layout.spec.ts`).

## 0. iCloud gotcha — work in a worktree OUTSIDE iCloud (MANDATORY)

This repo lives in iCloud Drive, which **silently reverts loose on-disk edits to tracked files**
mid-session (racy — they may reappear, then vanish). Editing `release-data.ts` directly in the
iCloud working copy is unreliable. Do ALL edits + the test run in a worktree under `/private/tmp`,
then land via git (the object store is durable even if the working tree reverts):

```bash
ICLOUD="/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS"
WT=/private/tmp/rois-relN-wt
git -C "$ICLOUD" worktree add -b feat/gantt/release-N-notes "$WT" main
for d in node_modules gantt/node_modules e2e/node_modules packages/ui/node_modules; do
  ln -sfn "$ICLOUD/$d" "$WT/$d"; done   # symlink node_modules (not committed)
```

Land it durably at the end (loose edits won't survive; a commit + fast-forward will):

```bash
git -C "$WT" add gantt/src/components/release/release-data.ts gantt/src/version.ts \
  e2e/tests/gantt/release-tab.spec.ts
git -C "$WT" commit -m "docs(gantt): Release N notes …"
# If the iCloud working copy already has identical loose edits, discard them first so FF is clean:
git -C "$ICLOUD" checkout -- gantt/src/components/release/release-data.ts gantt/src/version.ts \
  e2e/tests/gantt/release-tab.spec.ts
git -C "$ICLOUD" merge --ff-only <commit>          # lands REL_N on main, durable
git -C "$WT" worktree ... ; git worktree remove "$WT" --force
```

Only do the commit/FF because loose edits cannot persist here — it is the delivery mechanism, not
an extra. Branch first (never commit straight to a dirty `main`); preserve the user's unrelated
working-tree changes (don't `git stash` them — checkout only YOUR 3 files).

## 1. Find the cursor + the new range

Each release records `fromCommit`/`toCommit`. The latest release's `toCommit` is where the next one
starts. `HEAD` may have moved (concurrent sessions) — set the new `toCommit` to the CURRENT `HEAD`.

```bash
LAST_TO=$(grep -hoE "toCommit: '[0-9a-f]+'" release-data.ts | tail -1)   # or read REL_(N-1)
git log --oneline <lastToCommit>..HEAD                                    # the window
git rev-parse --short HEAD                                                # the new toCommit
```

## 2. Scope to END-USER-FACING UI only

The Release tab is for the **gantt planner app**. INCLUDE only changes a planner SEES or DOES:
new buttons/dialogs/columns/menu items, changed labels, new filters, visible behavior changes,
visible reliability fixes. EXCLUDE: backend/engine/perf-internal, rule-engine porting, tests,
version bumps, pure "Phase X"/source-unification refactors with no visible change, and **pbs-portal**
(separate crew app — not this tab). Scope the log to frontend paths:

```bash
git log --date=short --pretty=format:'%ad %h %s' <from>..HEAD -- gantt/src \
  | grep -viE '\.spec\.|test\(|test:| (test|chore|docs)\('
```

Most commits in a week are backend/perf/infra — expect to keep only ~15–25 items.

## 3. Fan out per-area Explore agents to extract + VERIFY wording

For a large window, dispatch parallel `Explore` agents — one per area cluster (Live; Scenario;
Rule; Data+System+Global). Each agent: read the scoped log, identify user-visible changes, then
**OPEN the actual `.tsx` components and verify the exact UI wording** (labels, button text, column
names, dialog titles) — never trust commit subjects. Have each return a JSON array of items:

```json
{ "date": "2026-06-21", "type": "enhancement|fix", "area": "Live",
  "title": "<=8 words", "body": "1–2 plain user sentences, <b>real UI labels</b>" }
```

Merge sub-commits of one feature into ONE item. Dedupe shared Live+Scenario changes (e.g. a shared
pairing-pane column) into a single item that notes "(Live and Scenario)".

## 4. Author REL_N in release-data.ts

Prepend the const and update the array — `export const RELEASES = [REL_N, …, REL_1]` (latest first;
the view defaults to `RELEASES[0]`). Fill `n`, `date` ('Jun 22, 2026'), `version` (current
`Bx / Fy / Rz`), `summary`, `fromCommit`, `toCommit`, `rangeLabel`, optional `note`, `items`.
`shot` is OPTIONAL — **text-only (no galleries) is fine** when there's no single new headline screen;
capturing fresh release screenshots is heavy/flaky (scenario gantt won't open headless), so default
to text unless the user asks for images. Match the existing tone: concise, light `<b>` markup, plain
end-user language, areas ordered to mirror the nav tabs.

## 5. Update the test (§Stale-Test) — Rel N is now the default

Adding REL_N makes it the default render, so the spec's "latest = Rel N-1" assertions go stale.
UPDATE them (don't leave red, don't ask): point the "latest/default" tests (cursor, areas, wording,
sort, galleries-or-none, collapse) at REL_N, and PRESERVE older releases' coverage by selecting them
explicitly (`selectRelease(page, N-1)`, `selectRelease(page, 1)`). For a text-only REL_N, the gallery
test asserts `release-gallery-<area>` count 0 for every area and `release-detail img` count 0. Keep
exact per-area image counts for the older (galleried) releases.

## 6. Bump version + run the proof

- Bump `FRONTEND_VERSION +1` in `gantt/src/version.ts` (release-data.ts is gantt frontend code).
- Run UI gate: `node scripts/check-ui-standard.mjs` → must be 0 hard violations.
- Run the spec in the worktree against your own vite (use a UNIQUE port — 5273 may be taken by
  another session; testing the wrong port tests the wrong build):

```bash
( cd "$WT/gantt" && npx vite --port 5293 --strictPort >/tmp/vite.log 2>&1 & )
( cd "$WT/e2e" && GANTT_BASE_URL=http://localhost:5293 \
    npx playwright test tests/gantt/release-tab.spec.ts --reporter=list --no-deps )
```

Paste the PASS summary (§No-Illusion). Note: `release-tab.spec.ts` uses absolute `${BASE}` URLs and
seeds auth via `addInitScript`, so it runs standalone. `release-fullwidth-layout.spec.ts` uses a
relative `goto` + the `gantt-setup` auth dependency, so it can't run in this isolated `--no-deps`
harness — that's an env constraint, not your regression (it asserts sidebar-collapse, independent of
release content).

## Reference: a known-good run

REL_3 (Jun 15–22 2026, cursor `2a20546e … 83cdac9b`, text-only, B159/F305/R35) shipped to `main` at
`83c7d704`: 9/9 release-tab tests pass, UI gate PASS. REL_1 cursor `1a8f9b45…b434a374`, REL_2
`b434a374…2a20546e`.
