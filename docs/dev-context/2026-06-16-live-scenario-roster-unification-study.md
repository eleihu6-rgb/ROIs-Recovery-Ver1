# Live ↔ Scenario Roster Pane Unification — Case Study

> Date: 2026-06-16 · Module: gantt · Branch (merged to `main`): `feat/gantt/unify-roster-toolbar`
> Companion docs: spec `docs/superpowers/specs/2026-06-16-unify-roster-pane-toolbar-design.md`,
> plan `docs/superpowers/plans/2026-06-16-unify-roster-pane-toolbar.md`,
> tracker memory `unify-live-scenario-gantt`.

A retrospective of how the Live and Scenario gantt **roster panes** were collapsed onto one
shared component, why two user-visible bugs turned out to be symptoms of the fork, and the
verification discipline that made a 700-line-×-2 refactor of production code safe.

---

## 1. Background — why unify

The gantt has two views that are *supposed to mirror each other*: **Live** (the real roster) and
**Scenario** (an optimizer output, opened read-only/edit-locked). Historically Scenario was a
**fork** under `gantt/src/components/scenario-gantt/*`. Forks drift: filter criteria, sorting, UI
position, styles, and — as this effort proved — **behavior** diverge silently because a fix made on
one side is never made on the other.

Two divergences were reported (Scenario vs Live, same data):

1. **No per-row violation bells in Scenario.** The Scenario roster's left gutter showed *no* per-crew
   alert icon, even though the bell counter read 351. Live showed them.
2. **Zoom `+/-` behaved differently.** The Scenario toolbar re-implemented the zoom buttons instead
   of reusing Live's shared control.

Both were fork-drift symptoms. A prior multi-phase effort (tracked in the `unify-live-scenario-gantt`
memory) had already unified the **Flight** (Phase 5A) and **Pairing** (Phase 5B) panes onto a shared
`gantt-source` abstraction; the **roster pane** (the hardest — locks, drafts, edit, violations) and
the **toolbar** were the last forks. This effort finished the roster pane.

---

## 2. Architecture — the `gantt-source` abstraction

The unification mechanism (established by the earlier flight/pairing work, extended here for roster):

```
            ┌──────────────────────────────────────────────┐
            │  SharedRosterPane  (components/panes/shared/)  │  ← one component, reads ONLY via the source
            └───────────────▲──────────────────────────────┘
                            │ useGanttSource()  (React context)
            ┌───────────────┴──────────────────────────────┐
            │  GanttPaneSource  (gantt-pane-source.ts)       │  ← the interface / seam
            │   .roster?: RosterPaneSource                   │
            │   .flight? .pairing?  .capabilities  …          │
            └───────▲──────────────────────────▲────────────┘
                    │ implemented by            │ implemented by
   ┌────────────────┴───────────┐   ┌──────────┴─────────────────────┐
   │ useLiveGanttSource()        │   │ useScenarioGanttSource(id)      │
   │  makeLiveRosterPaneSource() │   │  makeScenarioRosterPaneSource() │
   │  (live stores)              │   │  (per-scenario registry stores) │
   └─────────────────────────────┘   └─────────────────────────────────┘
        ▲ mounted by                       ▲ mounted by
   panes/roster-pane.tsx (thin)       scenario-gantt/scenario-roster-pane.tsx (thin)
```

**Key ideas:**

- **`RosterPaneSource`** (in `gantt-pane-source.ts`) is the single seam. `SharedRosterPane` reads
  *everything* through it (`useRows`, `usePanelRows`, `useViolationMap`, `useColumns`, selection,
  `getHitTest`, `useInteractionCallbacks`) and imports **no** live/scenario stores directly —
  enforced by the `no-store-imports.guard.test.ts`.
- **Live-only features are OPTIONAL source members** (`useLockMap?`, `useSessionTags?`,
  `showSessionTags?`). Scenario simply doesn't provide them, and the shared component renders without
  that decoration. This is the same optional-member pattern flight/pairing already use.
- **Each context mounts its own thin wrapper** that supplies `GanttSourceProvider` + the context
  toolbar/splitter as render-props. The 700-line forks collapsed to ~80-line (scenario) / ~280-line
  (live) wrappers.
- **Per-context state** lives in registry stores (`getScenarioGanttStore(id)`, etc.); Live uses its
  singletons (`gantt-view-store`, `roster-store`, `crew-store`, `pane-store`, `lock-store`).

### Live-specific complications the roster port had to absorb
- **`roster-main` vs `roster-sub`**: Live derives `legacyPaneType` from the layout grid row (row 0 =
  main, row 1 = sub); roster data comes from `roster-store.main` vs `.sub`. The Live adapter is
  parameterized by `legacyPaneType`.
- **Two violation sources**: Live merges real-time `rule-check-store` + persisted
  `session-violation-store` into one `taskId → maxSeverity` map; Scenario has a single
  `scenario-violation-store`.
- Date-effective rank/base/fleet (`getAllEffective`), crew stats, locks, session tags, drag-to-roster,
  box-select delete, draft integration — all Live-only, ported into the Live adapter behind the same
  interface.

---

## 3. Implementation — phases (each an independently-verified commit)

| Phase | Commit | What landed |
|---|---|---|
| **0 — Issue 1** | `aec8efc2` | Scenario per-row violation bells (see root-cause §4.1) |
| **0 — Issue 2** | `89d1c63b` | Split `ZoomControl` → shared `ZoomControlView`; Scenario reuses it (bounds stay per-context: Live 7–50, Scenario 2–200) |
| **R1.1** | `7f5d0dee` | `RosterPaneSource` interface (additive, no consumer) |
| **R1.3 / R2** | `ace726a2` | `SharedRosterPane` + `makeScenarioRosterPaneSource`; **Scenario** roster switched to it |
| **stale-test** | `bcd42e61` | Fix stale `SEN`→`Sen` column assertion |
| **R3** | `c5f27bab` | `makeLiveRosterPaneSource` + **Live** roster switched; pre-existing pairing scroll-isolation fix |
| **/simplify** | `F270` | Dead-code/dup cleanup + scenario-adapter memoization |

**Sequencing rationale:** scenario-first (read-only, lower blast radius) before the production Live
switch. Each phase gated on `tsc 0` + `check:ui 0 hard` + `no-store-imports` guard + the relevant
Playwright suite **before** commit.

---

## 4. Root-cause discoveries (the interesting part)

### 4.1 Issue 1 was a data-loss bug, not cosmetics
The surface theory ("Scenario forgot to compute `maxViolationSeverity`") was *partly* true but not the
real cause. Instrumenting the boundary (un-silencing a `catch`, logging store writes) revealed the
ordering:

```
applyPersisted(status=READY, 82 violations) → keyed map populated (69 keys)
… then …
clear() called  ×2   → keyed map wiped to 0
```

The Scenario roster pane's pre-check effect called `violation-store.clear()` whenever
`pendingChanges.length === 0` (i.e. on every fresh open) — wiping the keyed `violations` map the
view had just loaded from persisted Rust legality. Crucially, `clear()` left `persistedRaw` intact,
and the **Alert Center counter reads `persistedRaw`** while the **gutter bells read the keyed map** —
so the counter showed 351 while every bell was empty. Exactly the screenshot.

**Fix:** a new `resetToPersisted()` store method (rebuild the keyed map from `persistedRaw` instead of
emptying it), called instead of `clear()`; *plus* aggregating per-crew `maxViolationSeverity` into the
panel rows (the gutter-bell data source). Lesson: **a counter and a badge driven by different fields
of the same store will disagree when one field is mutated and the other isn't.**

### 4.2 The legality fetch worked; a sibling wiped it
The first debugging instinct ("the fetch is failing") was wrong — network capture showed
`200 {"code":200,"data":{"status":"READY","violations":[…]}}`. The envelope unwrap was fine. The data
arrived and was *then* destroyed (§4.1). Lesson: **verify each layer; a green network call doesn't
mean the store stayed populated.**

### 4.3 Parallel e2e runs falsely fail on the remote demo DB
After the Live switch (R3), a 25-test parallel run showed **13 failures** — `flight-navi` "never
listed any flights", `live-full-load`, `locate-pairing`. Panic-worthy. But a console probe showed the
Live gantt **mounted cleanly, no errors**. Re-running `--workers=1` → **all green**. The remote demo
DB can't serve 3 Playwright workers at once; the failures were data-load contention, not regressions.
**Lesson: always verify Live serially (`--workers=1`); a parallel red is not a verdict.**

### 4.4 The "5 red Live roster baseline" decomposed cleanly
Before switching Live, the roster e2e baseline was red — but the 5 failures were *not* a blocker:
2 **stale** (`SEN`→`Sen` rename), 1 **flaky** (canvas right-click box-delete, passes on retry),
2 **pairing-side** (`pane-count-badges` pairing total badge — not roster). None were real roster
regressions. **Lesson: triage a red baseline by category (stale / flaky / out-of-scope / real)
before concluding you're blocked.**

### 4.5 A perf test caught a *real* pre-existing isolation gap
The `pane-header-performance` tests assert that scrolling the roster redraws **only** the roster pane
and never re-renders pane chrome. They failed after R3. Investigation found two things: (a) a genuine
pre-existing bug — `PairingPane` subscribed to the *whole* layout `panes` Map, so a sibling roster
pane's pane-scoped vertical scroll (which writes that Map) re-rendered the pairing pane and redrew its
header canvas; fixed with `memo()` + reading `panes` via `getState()` inside the grid-keyed memo. And
(b) a **test timing race** — the async violation/stats load lands *during* the scroll-measurement
window and legitimately bumps render counters; fixed (§Stale-Test) by replacing fixed `waitForTimeout`
baselines with a `settleRenders` quiet-window poll, leaving the strict post-wheel assertions unchanged.

---

## 5. Lessons for future unification work

1. **Verify behavior, not just `tsc`.** Every subagent-reported "tsc clean" was re-checked with the
   real e2e suite. tsc/check:ui are necessary, never sufficient (§No-Illusion).
2. **`git diff --stat` after every subagent, and read every touched file.** Subagents twice left
   **undisclosed changes**: a debug instrumentation block in `pane-condition-strip.tsx` (removed) and
   an unreported—but legitimate—pairing-pane fix (kept). Their prose reports were incomplete.
3. **Serial e2e for Live** (`--workers=1`) — the remote DB makes parallel runs flaky (§4.3).
4. **Triage red baselines** before declaring a blocker (§4.4).
5. **Zustand v5**: a selector returning a *fresh* array/Set/object each call makes
   `useSyncExternalStore` see a new snapshot every render → "Maximum update depth". Use `useShallow`
   or memoize on a stable key (`new Set(ids)` memoized on `ids.join(',')`).
6. **Scenario-first, Live-last**: switch the read-only/lower-risk context first; keep the production
   switch as a separate, separately-verified commit that can be reverted in isolation.
7. **A "best judgment" mandate includes the judgment to *not* over-build** — see §6 on the deferred
   toolbar.

---

## 6. Final outcome

**On `main`:** Both Live and Scenario roster panes render through one `SharedRosterPane` driven by the
`gantt-source` abstraction. The 700-line × 2 fork is gone. Both reported bugs are fixed structurally
(they're now unrepresentable — both contexts share the bell/zoom code). A pre-existing pairing
scroll-isolation bug was fixed as a bonus.

**Verification footprint:** ~46 Playwright tests green across the effort (24 scenario: bell, zoom,
edit/remove/pre-check, 4 filters, 2 sorts, context-menu lock-gated, cross-pane find/float, db-source;
Live: full-load, seniority+data, alert bells, locate-pairing, flight-navi cross-pane, box-delete,
month-quicknav, pane-header perf isolation; Live pairing non-regression). `tsc 0`, `check:ui 0 hard`,
store-import guard pass throughout.

**Code-sharing:** the roster fork (the largest remaining duplication) is eliminated; flight + pairing
were already shared. Re-measure with `scripts/measure-gantt-sharing.sh` and append to
`docs/architecture/live-scenario-code-sharing-tracker.md` (baseline 45.3%, 2026-06-15).

### Deferred (deliberate, documented)
- **Toolbar merge (R4)** — *not done, by best judgment.* The genuinely common controls are already
  shared (zoom = `ZoomControlView`, timezone = shared `TimezoneSwitcher`). The remaining merge is a
  composite wrapper over already-shared controls + porting the store-coupled `TimeAxis` to the source
  — flagged by the project's own Phase-4 analysis as over-engineering (§Minimal-First). Revisit only
  when a concrete shared toolbar *feature* appears.
- **Altitude refactor** — the Live quick-filter lives in the component and writes back via
  `setRenderedRows`, forcing an `isLive` branch and a ~20-field `liveChrome` grab-bag, where
  flight/pairing demonstrate the higher-altitude pattern (filter owned by the source, differences via
  capability members + `source.mode`). Real and worth doing; deferred from the `/simplify` pass
  because it rearchitects just-verified Live behavior and needs a full Live re-verification.
- **Phase 5D** — delete the now-thin `scenario-gantt/*` forks + re-measure sharing %.

### `/simplify` cleanups applied (F270)
Deleted dead `useZoomBounds`; consolidated 3 empty-overlay singletons + removed a shared→adapter
backwards import; extracted the triplicated scroll clamp (`clampRosterScrollY`); memoized the scenario
adapter's roster build (it had regressed to rebuilding the full pipeline every render).

---

## 7. Where to look in the code
- Interface / seam: `gantt/src/components/gantt/source/gantt-pane-source.ts`
- Adapters: `…/source/live-gantt-source.ts` (`makeLiveRosterPaneSource`),
  `…/source/scenario-gantt-source.ts` (`makeScenarioRosterPaneSource`)
- Shared component: `gantt/src/components/panes/shared/roster-pane.tsx`
- Thin wrappers: `gantt/src/components/panes/roster-pane.tsx` (live),
  `gantt/src/components/scenario-gantt/scenario-roster-pane.tsx` (scenario)
- The bug fix: `gantt/src/stores/scenario-violation-store.ts` (`resetToPersisted`)
- Test introspection: `gantt/src/utils/gantt-test-hook.ts`
  (`scenarioCrewViolationSeverities`, `scenarioZoom`)
