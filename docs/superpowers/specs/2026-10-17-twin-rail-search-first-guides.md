# Twin Rail search-first layout and selection guides

Follow-up: the shared mode switch must show Matrix, Market, Ticket and Twin Rail
fully without horizontal scrolling. Four equal flexible segments fit the measured
header; icons are omitted below 360pt, labels retain 13pt type and may wrap.
The wide header retains icons and the side rail is unchanged. This shared
navigation fix is explicitly requested; other concepts' workflows are untouched.

Scope: Concept B only. Remove its standalone calendar; enter through pairing
search and show the user's pinned roster above matching crew in the Gantt.
Keep Search pairing as an accessible top-right header icon. Reuse the date
toolbar for history/locked-duty actions when no side action rail is present.
Preserve the other concepts, review folding, selection/submit semantics and
fixed 40pt pucks.

Use light neutral candidate/date separators (22% opacity per latest feedback).
Draw two purple brand-color dashed vertical
guides from the outer selected puck corners through the candidate viewport.
Guides use 90% opacity and 1.5pt strokes, distinct even in Graphite theme.
Multiple selected visible duties share the outer two guides. Guides are visual
only (not legality evidence), ignore touches, track zoom/window/width, and vanish
when no selected puck is visible or the selection is cleared. Virtualized rows
remain virtualized; the overlay must not increase per-candidate work.

Verification: existing Jest search/review/account-isolation regressions plus
selection/clear/multiple/zoom guide geometry; TypeScript and UI style gate.
Native XCUITest on Air, Duo, then iPad, one simulator at a time, PR473006 and TG
isolation; inspect versioned screenshots. Native UI has no Playwright surface.
No TestFlight upload or Git commit/push in this task.

Brainstorming skill is unavailable in this session/local skill catalog; this
spec records the bounded design authorized by the user's requested changes.
