# Code Enhancement Playbook

> A repeatable discipline every team member follows **periodically** (recommended:
> monthly, per dev or per area) to enhance the codebase. Derived from the 2026-06-15
> review exercise.
>
> The live version of the steps and the **enhancement log** (who optimized what, when,
> with proof) lives in the gantt **Dev tab** (top nav, after Regression; access code
> required). Data source: `gantt/src/components/dev/dev-playbook-data.ts`. Appending an
> entry there and committing it is Phase 6 — and the git history of that file is the
> audit trail proving the team actually enhances code over time.

## Why

Code rots: hot paths accumulate per-frame cost, backends grow N+1 queries, dead code and
duplication pile up. Periodic, disciplined enhancement keeps the product fast and the code
clean — but only if it is **proven** (not claimed) and **recorded** (not invisible).

## Focus areas — in priority order

1. **User-side Gantt performance** — first-paint speed (§First-Paint is the top product
   priority), canvas render loop, React re-render storms, virtualization, and
   **client-side memory**: hidden keep-alive tabs that retain canvas DOM and full store
   data (especially Scenario Gantt tabs mounted by AppShell keep-alive). Getting the
   first batch of crew/pairings to the viewport in 1–2 s beats everything else, and a
   session with several open scenario tabs must not leak heavy canvases/data.
2. **System overall efficiency** — N+1 queries, batch inserts, caching, query shape,
   async hot paths across the backend services.
3. **Code quality** — dead code, duplication, design tokens, type safety, god-components.

Pick **one module + one focus area** per cycle. Depth over breadth.

## The loop (six phases)

### 1. Scope
Choose one module and one focus area. Write down the single question you're answering
(e.g. "is the gantt first-paint read path doing redundant work?"). Do not boil the ocean.

### 2. Map
Find candidate hotspots. Useful signals:
- Frontend: large files/god-components, work inside the canvas render loop, components
  subscribing to whole stores, inline object/array props, missing `useMemo`/`useCallback`,
  repeated `getComputedStyle`/`Intl` construction per frame.
- Backend: `await` inside a loop over rows (N+1), `SELECT *` over-fetch, queries without
  `LIMIT`, sorting/grouping large arrays in JS that SQL should do, missing caches.

Subagents/search are good for fan-out discovery — but everything they return is a
**candidate**, not a fact.

### 3. Verify against live code (the rule that prevents wasted work)
**Read the actual code for every candidate. Reject the ones that don't hold up.**
A finding is not real until the code in front of you proves it. In the source exercise,
**4 of the flagged findings were false** (a claimed render-loop `filter` was a click
handler; a "double-fetch" was a listener re-registration; an "unstable prop" was already
`useCallback`-wrapped; a "redraw storm" was already guarded). Verifying first saved those
from becoming buggy "fixes."

Also re-verify inherited "facts" against live data, and don't stop at the first blocker —
instrument every layer to find the real root cause.

### 4. Fix safely
Make the **smallest behavior-preserving change**. Prefer collapsing redundant work over
rewrites:
- N `getComputedStyle` calls → 1 (read all vars off one resolved declaration).
- N per-row queries → 1 batched `inArray`/`ANY` query.
- N per-segment inserts → 1 multi-row insert.

Do **not** add memoization/`React.memo` where the cost is already guarded — that's churn,
not a fix. Don't change pagination/correctness logic you can't fully trace.

### 5. Prove with tests (§No-Illusion, §Stale-Test)
- Write or update a test that would **FAIL on the old code** and **PASS on the new** —
  e.g. assert `getComputedStyle` is called once, or that `insert` is called once with an
  array. A test that passes regardless of the change proves nothing.
- Run it; **paste the PASS receipt** into your write-up. No status change ("fixed",
  "done") is accepted without a test run.
- If your refactor makes an existing test stale, **update it to assert the current
  implementation** — never weaken a test to make it green.
- Run the full suite. If there are failures, **prove they are pre-existing** (stash your
  change and re-run; compare counts) before claiming no regression.

### 6. Record & bump
- Append an `EnhancementEntry` to `dev-playbook-data.ts` (date, focus, module, summary,
  proof) and **commit it**. This is the audit record.
- Runtime version counters are managed in ignored `live-server/version.tmp` by module
  `dev` / `build` scripts and Vite HMR. Do not edit or recreate `gantt/src/version.ts`.

## Anti-patterns (forbidden)
- Claiming "fixed"/"done" from code inspection alone, with no test run.
- Trusting a tool/agent finding without reading the code it points at.
- Weakening or deleting a test to make a change pass.
- Optimizing a hot path with no evidence of a real, un-mitigated cost.
- Touching working correctness logic (pagination, violations pipeline) on a guess.

## Cadence & accountability
Run the loop periodically. The Dev tab enhancement log makes participation visible: an
empty stretch of dates is itself a signal. The git history of `dev-playbook-data.ts` is
the tamper-evident record of whether the team is actually doing this.
