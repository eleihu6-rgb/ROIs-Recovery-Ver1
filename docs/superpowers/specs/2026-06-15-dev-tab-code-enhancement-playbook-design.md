# Dev Tab + Code Enhancement Playbook — Design

> Date: 2026-06-15
> Status: Approved (pending spec review)

## Purpose

Two linked deliverables:

1. **A code-enhancement playbook** — a repeatable discipline every team member follows
   periodically to enhance code, derived from the review exercise on 2026-06-15.
2. **A gated "Dev" tab** in the gantt UI that surfaces the playbook steps and an
   **enhancement log** — a dated record of what was optimized, by area, with proof.
   Its second purpose is accountability: a visible, tamper-evident record of *whether
   the team actually optimizes its code from time to time*.

Focus areas, in priority order:
1. **User-side gantt performance** (§First-Paint is the top product priority).
2. **System overall efficiency** (N+1 queries, caching, query shape).
3. **Code quality** (dead code, duplication, design tokens, type safety).

## Part 1 — The Playbook (`docs/architecture/code-enhancement-playbook.md`)

A six-phase loop, run periodically (recommended monthly per dev/area):

1. **Scope** — pick one module + one focus area. Don't boil the ocean.
2. **Map** — explore for hotspots (large files, render loops, `await` in loops,
   `SELECT *`, missing memoization). Use search/subagents to find candidates.
3. **Verify against live code** — read the actual code for every candidate finding.
   **Reject findings that don't hold up.** A finding is not real until you've read the
   code that proves it. (In the source exercise, 4 of the flagged findings were false.)
4. **Fix safely** — smallest behavior-preserving change. Prefer collapsing work
   (e.g. N getComputedStyle → 1; N queries → 1 batched) over rewrites. No premature
   optimization that the code already mitigates.
5. **Prove with tests** (§No-Illusion) — write/Update a test that would FAIL on the old
   code, run it, paste the PASS receipt. Update stale tests rather than weakening them
   (§Stale-Test). Confirm pre-existing failures are unrelated (stash-and-compare).
6. **Record & bump** — append an entry to the Dev tab enhancement log
   (`dev-playbook-data.ts`), commit it, and bump the relevant version counter.

Anti-patterns the playbook explicitly forbids: claiming "fixed" without a test run;
trusting a tool/agent finding without reading the code; silent test weakening; touching
a working hot path with no evidence of a real cost (the redraw-guard lesson).

## Part 2 — The Dev Tab

### Navigation
- New top-nav module `dev`, inserted **after `regression`, before `help`** in
  `shell-top-nav.tsx` `MODULES`. Label "Dev", `Wrench` icon, `testid: 'nav-dev'`.
- `KnownModule` in `shell-store.ts` gains `'dev'`.
- `app-shell.tsx` `ModuleView` routes `module === 'dev'` → `<DevView />`.

### Access gate (separate from login)
- Entering the tab renders a code-entry card when locked. Correct code `5566` unlocks.
- The code is a named constant `DEV_ACCESS_CODE` in `dev-playbook-data.ts`. It is **not**
  the user login credential and is unrelated to the auth token.
- Unlock state persists for the **session** via `sessionStorage` key `rois.dev.unlocked`,
  so a reload within the tab/session does not re-prompt. Closing the tab clears it.
- This is a soft gate (frontend-only) to keep the tab out of casual view — not a security
  boundary. Stated as such in code comments.

### Content (after unlock)
- **Header band** — standard content-panel header (`flex h-10 items-center gap-2
  border-b px-4`, `Wrench` icon `h-4 w-4 text-muted-foreground`, title `text-sm
  font-semibold`), per the CSS/typography standard.
- **Playbook steps section** — the six steps + three focus areas, rendered from
  `dev-playbook-data.ts` (`PLAYBOOK_STEPS`, `FOCUS_AREAS`).
- **Enhancement log section** — a table of `EnhancementEntry` rows:
  `date · focusArea · module · summary · proof`. Sorted newest-first. Seeded with the
  2026-06-15 exercise entries (gantt getGanttColors 22→1 + 12 dead files; live-server
  createGroundTask & assignPairing N+1 batch fixes).

### Data model (`gantt/src/components/dev/dev-playbook-data.ts`)
```ts
export const DEV_ACCESS_CODE = '5566'

export interface PlaybookStep { n: number; title: string; detail: string }
export const PLAYBOOK_STEPS: PlaybookStep[]

export interface FocusArea { key: 'gantt-perf' | 'system-efficiency' | 'code-quality'
                             label: string; priority: number; detail: string }
export const FOCUS_AREAS: FocusArea[]

export type FocusKey = FocusArea['key']
export interface EnhancementEntry {
  date: string           // 'YYYY-MM-DD'
  focus: FocusKey
  module: string         // 'gantt' | 'live-server' | ...
  summary: string        // what changed
  proof: string          // test file / version bump / receipt
  author?: string
}
export const ENHANCEMENT_LOG: EnhancementEntry[]
```
Devs append an `EnhancementEntry` and commit it whenever they complete a Phase-6 record.
**The git history of this file is the audit trail.**

### Files
- `gantt/src/components/dev/dev-view.tsx` — gate + content (one focused component).
- `gantt/src/components/dev/dev-playbook-data.ts` — constants + seed data.
- Edits: `shell-store.ts`, `shell-top-nav.tsx`, `app-shell.tsx`.
- `docs/architecture/code-enhancement-playbook.md`.
- `gantt/src/version.ts` — `FRONTEND_VERSION` +1.

## Testing (§Playwright-Required)
`e2e/tests/gantt/dev-tab.spec.ts` (Playwright), content assertions not just visibility:
1. Click `nav-dev` → gate card visible, playbook content NOT present.
2. Enter a wrong code → still gated, error shown.
3. Enter `5566` → playbook steps visible (assert a specific step title) AND the
   enhancement log shows a specific seeded entry (assert text e.g. "getGanttColors").
4. Reload the page → still unlocked (sessionStorage), content visible without re-entry.

## Out of scope (YAGNI)
- No backend persistence, no in-UI add form, no edit/delete of log entries.
- Not a real security boundary; no role/permission integration.
- No i18n beyond English UI strings (per project UI-language rule).
