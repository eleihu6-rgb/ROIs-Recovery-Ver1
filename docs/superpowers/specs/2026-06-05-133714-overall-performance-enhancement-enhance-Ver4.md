# Overall Performance Enhancement Suggestions

> 2026-06-05-133714 · enhance-Ver4 · read-only performance recommendations

## Version Rule Applied

This file follows the current documentation rule:

- filename includes timestamp: `2026-06-05-133714`
- filename includes enhancement version: `enhance-Ver4`
- findings are documented in `docs/`, not only in chat

## Scope

Overall project performance suggestions across:

- Gantt live scheduling UI and Canvas render loop
- Scenario Gantt UI
- Live Server scenario/Gantt data services
- AI regression tooling
- Engine Server file cleanup
- PBS performance guardrails

The highest-impact area remains Gantt large-data scrolling/rendering for the target scale:

- 5,000 crew roster rows
- 10,000 pairings
- 5,000 flights
- multiple panes open at the same time

No implementation is included in this document.

## Validation Status (2026-06-05)

Every finding below was verified against the current code on `feat/ai/date-range-tool`. Verdicts:

| id | verdict | correction applied |
|---|---|---|
| V4-P01 | confirmed | none — `setScrollX`/`scroll` write the store per event (`gantt-view-store.ts:158-172`); RAF coalescing exists only downstream in `PaneCanvas` |
| V4-P02 | confirmed | added in-repo precedent: roster already uses `buildRosterRenderBuckets` + `useMemo` (`roster-pane.tsx:141`) — copy that pattern |
| V4-P03 | confirmed, impact downgraded | parse is already cached via `parseIsoCached`; the actual win is replacing date-fns `differenceInMinutes` inside `timeToX` with `msToX` arithmetic |
| V4-P04 | confirmed, scope narrowed | `formatTime` is already cached and already used for labels; the only gap is the per-flight `new Intl.DateTimeFormat('en-CA')` cross-day formatter (`flight-renderer.ts:252`) |
| V4-P05 | confirmed | no `isScrolling`/`renderQuality` mechanism exists; color-variant cache exists but gradients/paths are rebuilt per puck per frame |
| V4-P06 | confirmed, evidence sharpened | header effect lacks `!rafRef.current` guard and its condition parses as `dirty \|\| (scrollY >= 0 && size...)` — effectively always true once scrolled |
| V4-P07 | confirmed | pairing segments are sorted within `groupSegmentsByDuty`; flight arrays are not explicitly sorted — pre-sort is a prerequisite for binary search |
| V4-P08 | confirmed, upgraded | scenario canvas renders via bare `useEffect(() => { drawFrame() })` — no RAF, no dirty flag at all (`scenario-gantt-canvas.tsx:350`) |
| V4-P09 | confirmed, corrected | flight-store uses `PAGE_SIZE = 20` (`flight-store.ts:8`), not 100; crew/pairing/bootstrap are 100 |
| V4-P10 | confirmed, severity raised | unguarded `console.log` at `crew-store.ts:314,327` emits filter payloads (ranks/bases/fleets/divisions) in production — violates the data-security rule, not just hygiene |
| V4-P11 | confirmed | export joins 23 tables of CSV then `gzipSync` (`scenario-export-service.ts:169`); patch service same pattern (`scenario-patch-service.ts:67`) |
| V4-P12 | confirmed | sync `def create_run` route calls `subprocess.run(timeout=600)` directly (`regression/routes.py:135-161`) — blocks a worker thread up to 10 min |
| V4-P13 | confirmed, corrected | cleanup already runs as a background asyncio task (`engine-server/main.py:35-62`); the fix is executor-wrapping the blocking `os.walk`, not "make it a background task" |
| V4-P14 | confirmed | script exists and is wired as `npm run perf:pbs`; no CI workflow gates it (no `.github/workflows` present) |

## Executive Summary

1. The next biggest Gantt win is to RAF-coalesce horizontal `scrollX` store writes so left/right scroll does not push a Zustand update for every raw wheel/drag event.
2. Pairing and flight renderers still have per-visible-item work that should be converted into prebuilt render models — and the roster pane already proves the pattern (`buildRosterRenderBuckets` + `useMemo`), so this is replication, not invention.
3. Canvas visual richness should become adaptive: full detail when idle, simplified fills/text while actively scrolling. No render-quality mechanism exists today.
4. Scenario Gantt is further behind than live Gantt: its canvas redraws synchronously on every React commit with no RAF or dirty flag at all.
5. Two quick S-effort fixes should land first: unguarded production `console.log` of filter payloads in `crew-store.ts` (a data-security violation, not just noise), and the anomalous `PAGE_SIZE = 20` in flight-store.
6. Non-Gantt backend hotspots remain around synchronous gzip/export, event-loop-blocking cleanup, and blocking AI regression subprocess execution.
7. Performance work should be verified by repeatable benchmark scripts, not only subjective smoothness.

## Findings

| id | priority | area | category | problem | evidence | proposed_change | impact | effort | risk / verification |
|---|---:|---|---|---|---|---|---|---|---|
| V4-P01 | 1 | Gantt left/right scroll | performance | Horizontal scroll writes to shared Gantt store for every raw scroll/pan event. | `gantt/src/stores/gantt-view-store.ts` exposes `setScrollX` and `scroll`; both immediately call `set(... dirty: true)`. `PaneCanvas` already renders through RAF, but React/Zustand subscribers still see each store update. | Add a scroll accumulator: event handlers enqueue `pendingDx`/`pendingScrollX`, one RAF flush writes final `scrollX` and `dirty`. Keep immediate path for programmatic jumps/zoom. | high - directly targets left/right smoothness across every visible pane. Needs measurement for exact FPS gain. | M | Scrollbar/thumb and TimeAxis must stay visually synchronized; verify horizontal wheel, drag-scroll, scrollbar drag, zoom-to-month, double-click reset, and Playwright render counters. |
| V4-P02 | 2 | Pairing renderer | performance | Pairing rows regroup/sort duty segments during render. | `pairing-renderer.ts:157` calls `groupSegmentsByDuty(segments)` inside `drawSegmentRow` per visible row per frame; `groupSegmentsByDuty` (lines 363-383) creates a `Map`, sorts segments by `segSeq`, sorts duty entries by `dutySeq`, and allocates arrays. | Build `PairingRenderModel[]` when pairing items change: sorted duty groups, first/last segment refs, layover/rest spans, pickup/brief/debrief/dropoff spans, and cached start/end ms. **The roster pane already implements this exact pattern** — copy `buildRosterRenderBuckets` + `useMemo` (`roster-renderer.ts:548`, `roster-pane.tsx:141`) and pass the model through the render context. | high - pairing pane targets 10k pairings; visible rows are limited, but grouping happens every frame during scroll. | M | Duty ordering or layover/rest rendering can change if the model builder is not equivalent; verify visual parity against current pairing rows and segment-mode tests. |
| V4-P03 | 3 | Flight renderer | performance | Flight renderer calls date-fns-backed `timeToX` per visible flight per frame. | `flight-renderer.ts:83-86` uses `parseIsoCached` (parse itself **is already cached**) but then calls `timeToX(...)`, whose UTC branch runs date-fns `differenceInMinutes` per call (`gantt-utils.ts:236`). Roster already uses `parseIsoMs` + `msToX` (pure arithmetic, `roster-renderer.ts:734-737`) for pixel-identical UTC geometry. | Switch flight geometry to `msToX(parseIsoMs(...), rangeStartMs, pxPerHour) - scrollX`, matching roster. Optionally precompute `startMs/endMs` in store/model mapping (no item type currently carries epoch-ms fields). | medium-high - eliminates per-flight date-fns calls in the draw loop; smaller than originally estimated because ISO parsing is already cached. | S | UTC geometry must remain pixel-equivalent (`msToX` replicates `differenceInMinutes` truncation per the comment at `gantt-utils.ts:32-34`); verify screenshots at multiple zoom levels and date ranges. |
| V4-P04 | 4 | Flight text labels | performance | Cross-day detection creates a fresh `Intl.DateTimeFormat` per full-width flight per frame. | `drawFullPuck` (`flight-renderer.ts:252-253`) creates `new Intl.DateTimeFormat('en-CA', ...)` and formats two `new Date(...)` values per full-width visible flight per frame. Time labels are **already cached**: `formatTime` (`timezone-store.ts:44-83`) caches both formatters by zone and formatted strings by `zone\|timestamp` (200k cap). | Cache the `en-CA` local-date formatter by timezone alongside the existing `formatterByZone` map, and cache the `isCrossDay` flag per flight+timezone (or carry it in a flight render model). No change needed for dep/arv labels. | medium - scope is narrower than first assessed (labels already cached); the cross-day formatter is still meaningful allocation churn at high zoom. | S | Cross-day `+1` marker can become stale after timezone switch; verify UTC, base timezone, and DST boundary dates. |
| V4-P05 | 5 | Canvas visual cost | performance | Every visible puck uses gradients, rounded paths, clipping, strokes, and text even during active scrolling. | `gradientFill` (`gantt-utils.ts:473-490`) creates a new `CanvasGradient` + rounded path per call; called per puck per frame from flight (`flight-renderer.ts:107,116`) and pairing (`pairing-renderer.ts:295,301`) renderers. No `isScrolling`/`renderQuality` mechanism exists anywhere in the render context (verified). A color-variant cache exists (`roster-renderer.ts:54-67`) but caches colors only, not gradients/paths. | Add `isScrollingFast`/`renderQuality` to render context. During active scroll, draw solid rects and minimal/no text; after 80-120ms idle, redraw full detail. | high for subjective smoothness - this reduces per-frame canvas cost when users care most about motion. Needs UX approval because it is a temporary visual-quality tradeoff. | M | Users may dislike detail popping after scroll idle; verify with side-by-side recording, FPS, and product review. |
| V4-P06 | 6 | Gantt up/down scroll | performance | Left header canvas scheduling is less strict than right canvas scheduling. | `PaneCanvas` (`pane-canvas.tsx:202-213`) tracks `lastRenderedScrollYRef` and guards with `!rafRef.current`; `PaneHeaderCanvas` (`pane-header-canvas.tsx:204-211`) has no such guard and its condition `dirty \|\| scrollY >= 0 && size.width > 0 && size.height > 0` parses as `dirty \|\| (scrollY >= 0 && ...)` due to operator precedence — effectively true on every effect run once scrolled, so it schedules a RAF per React commit. | Make `PaneHeaderCanvas` match `PaneCanvas`: track last rendered `scrollY`, schedule only on dirty/scrollY/size/data change, guard with `!rafRef.current`, and fix the precedence bug with explicit parentheses. | medium - reduces redundant header canvas renders during vertical scroll and unrelated React commits. | S | Header/canvas can desync if scheduling misses data/selection changes; verify pane-scoped scroll tests and selected/frozen row updates. |
| V4-P07 | 7 | Flight/pairing row culling | performance | Renderers clip horizontally after iterating row items. | Flight renderer (`flight-renderer.ts:50-91`) loops every flight in each visible registration row and culls with `x > canvasWidth \|\| endX < 0` only after computing geometry; pairing renderer (`pairing-renderer.ts:94-278`) iterates all segments in visible pairing rows with the same post-hoc cull. Flight arrays are not explicitly sorted by start time (API order assumed) — pre-sorting is a prerequisite for binary search. | Pre-sort row items by startMs and binary-search visible time window `[scrollX, scrollX + canvasWidth]`, with a buffer for minimum width and rest/layover spans. | medium-high for dense rows; low for sparse rows. Needs measurement with realistic F8/TG data. | M-L | Items with long spans crossing viewport edges can be missed; verify long-haul flights, layovers, rest blocks, and cross-day pairings. |
| V4-P08 | 8 | Scenario Gantt | performance | Scenario Gantt has a fully separate scroll/render path with **no RAF or dirty-flag mechanism at all**. | `scenario-gantt-store.ts:155` has its own `setScrollX`; `scenario-gantt-canvas.tsx:350` renders via a bare `useEffect(() => { drawFrame() })` — every React commit and every scroll callback triggers an immediate synchronous redraw, with none of the RAF + dirty batching that `PaneCanvas` has. | Align scenario Gantt with live Gantt performance primitives: RAF + dirty-flag rendering first (largest gap), then RAF-coalesced horizontal scroll, render models, cached labels, and fast-scroll render quality. | medium-high - the gap vs live Gantt is larger than originally assessed; important if scenario views need the same 5k/10k/5k scale. | M | Scenario-specific drag/edit behavior can regress; verify scenario horizontal scrollbar, pane scroll sync, assignment edits, and comparison with live Gantt. |
| V4-P09 | 9 | Gantt data loading | performance | Page sizes are small and inconsistent across stores, which may underutilize network for large initial loads and append workflows. | `crew-store.ts:6` and `pairing-store.ts:9` use `PAGE_SIZE = 100`; **`flight-store.ts:8` uses `PAGE_SIZE = 20`** (5x smaller, so a 5k-flight load needs 250 round-trips); Gantt bootstrap passes `CREW_PAGE_SIZE = 100` (`gantt-view-store.ts:16,358`). | First normalize the flight page size (20 is anomalously small), then introduce adaptive page size or range-first payloads: larger first/next pages for high-throughput local networks, smaller pages for slow connections. Measure payload and memory before changing defaults. | medium - can improve time-to-complete load for thousands of rows; may not affect scroll FPS. | S-M | Larger pages can increase main-thread merge work and memory spikes; verify first contentful data, total load time, heap, and backend latency. |
| V4-P10 | 10 | Gantt store/debug noise | security/quality | Unguarded production logging leaks filter payloads to the browser console. | `crew-store.ts:307,314,327,329` emit `console.log` in `loadMore` with no `import.meta.env.DEV` guard; **lines 314 and 327 log `sessionFilters` and the full request `params` (ranks/bases/fleets/divisions)** — sensitive selection criteria in production consoles, contrary to the project data-security rule. `pairing-pane.tsx:297` logs scroll metrics (low risk); `rule-check-store.ts:157,160` use unguarded `console.debug`. | Remove the payload-bearing logs outright; guard any remaining diagnostics with `import.meta.env.DEV`. Audit all gantt stores/panes for unguarded console calls in the same pass. | medium - this is a data-security fix first, perf hygiene second. | S | Debugging load-more becomes less convenient; verify load-more behavior and errors still surface through notifications/dev-only logs. |
| V4-P11 | 11 | Live Server scenario export/patch | performance | Scenario gzip/export paths assemble whole strings and gzip synchronously on the event loop. | `scenario-export-service.ts:169` joins CSV sections for **23 tables** (crew, roster_flight, pairing, flight, rules, …) into one string and calls `gzipSync`; `scenario-patch-service.ts:67` does the same for the ASSIGNMENTS payload. No async zlib or worker usage exists in either path. | Use async zlib/pipeline or move compression to a worker/job. Keep identical file format and section order. | medium - prevents event-loop stalls on large scenarios; exact impact needs scenario-size measurement. | M | Streaming can alter CSV ordering/escaping; verify byte-level fixture output and RO import compatibility. |
| V4-P12 | 12 | AI regression tooling | performance | AI regression runs Playwright via blocking subprocess in request flow. | `ai-server/src/regression/runner.py:22` uses `subprocess.run(... timeout=600)`, called directly from the **sync** `def create_run` route (`regression/routes.py:135-161`) — the request (and its worker thread) blocks up to 10 minutes; no `BackgroundTasks`/executor wrapping. | Run regression execution as a background job with pollable status, or move subprocess execution to a worker thread/process pool. | medium - prevents AI server workers from being held by long Playwright runs. | M | Response semantics change; verify create-run, status polling, cancellation, and failure reporting. |
| V4-P13 | 13 | Engine Server cleanup | performance | Periodic cleanup blocks the asyncio event loop with synchronous filesystem traversal. | `engine-server/src/files/file_manager.py:190,238` use `os.walk` in `cleanup_expired_files`/`get_directory_size`; these are invoked from the async `_periodic_cleanup` task (`engine-server/main.py:35-62`) **without** `run_in_executor`, so the traversal stalls the event loop while it runs. | Wrap the blocking `archive_files`/`cleanup_expired_files` calls in `loop.run_in_executor(...)` (it already runs as a background task — executor-wrapping is the missing piece), with one-at-a-time locking and duration metrics. | medium - protects API responsiveness when archive directories grow. | S | Cleanup can race with task file moves; verify concurrent task completion and cleanup tests. |
| V4-P14 | 14 | PBS performance governance | quality/performance | PBS has benchmark tooling but performance gates are not tied to CI thresholds. | `pbs-server/src/scripts/pbs-performance-baseline-core.ts` computes min/avg/p95/max per endpoint and is wired as `npm run perf:pbs` (`pbs-server/package.json:13`); no CI workflow exists in the repo to run or gate it. | Define baseline thresholds for key endpoints and run a representative subset in CI/nightly; track p95, error rate, and payload size. | medium - prevents regressions rather than speeding current hot paths. | S-M | Flaky environments can create noisy failures; start as reporting, then promote stable thresholds. |

## Recommended Execution Order

1. Land `V4-P10` immediately (S effort, data-security fix): remove/guard the filter-payload `console.log` calls in `crew-store.ts` — this should not wait behind perf work.
2. Implement `V4-P01` next because it directly targets perceived left/right smoothness and reduces global scroll churn.
3. Implement `V4-P02` and `V4-P03` to cut render-loop CPU in the two largest non-roster panes — `V4-P02` by copying the existing roster `buildRosterRenderBuckets` pattern.
4. Implement `V4-P04` with `V4-P03` because the same flight render model can carry cached cross-day fields (labels are already cached via `formatTime`).
5. Apply `V4-P06` as a small vertical-scroll cleanup (include the operator-precedence fix in `PaneHeaderCanvas`).
6. Prototype `V4-P05` behind a feature flag and compare recordings/FPS before making it default.
7. Bring `V4-P08` (scenario Gantt) up to live-Gantt parity — start with RAF + dirty-flag rendering, the largest gap.
8. Address backend items `V4-P11` to `V4-P13` after UI smoothness is stable, unless production logs show event-loop stalls first. `V4-P13` is the cheapest (executor-wrap two calls).

## Benchmark Plan

Use the same dataset for every run:

- 5,000 crew
- 10,000 pairings
- 5,000 flights
- roster main, pairing, and flight panes visible
- date range covering at least 90 days

Measure:

- horizontal scroll FPS over 3,000px and 10,000px sweeps
- vertical scroll FPS per pane
- long tasks greater than 50ms
- React commits per scroll second
- canvas render count per pane per scroll second
- JS heap after initial load, after full load, and after 60 seconds of scroll
- payload compressed/uncompressed size and time to first visible roster

Acceptance targets:

- no static pane chrome commits during plain scroll
- no all-pane redraw for pane-local vertical scroll
- horizontal scroll remains visually responsive while data panes are fully loaded
- render cost scales with visible rows/items, not total row count

