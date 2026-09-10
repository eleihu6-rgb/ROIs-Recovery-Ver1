# Cost Library Visual Parity

## Scope and Approval

Bounded presentation correction to the existing Cost Library. Reference:
`2026-09-10-legality-cost-mockup-Ver1/index.html` and its CSS/JavaScript.
User requests a comprehensive comparison, not just backgrounds and title icons.
Status: approved by the user's "proceed to dev", including the subsequent
chart-based workbench comparison addition.

## Findings and Intended Corrections

| Area | Current implementation gap | Correction |
| --- | --- | --- |
| Surfaces | Catalogue and details have little visual distinction; expanded rows lack the mockup highlight | White list surfaces, subtle detail background, themed blue selection/expanded treatment and restrained separators |
| Catalogue | IDs and names share one narrow line and names truncate | Stack code and readable name, preserve compact density; restore count badges and search placeholders |
| Sets | Compressed metadata and no selected leading accent | Restore description, separate metadata/status badge, member count and leading selection accent |
| Main heading | Set title has nearly the same weight and size as row text | Restore clear compact title/subtitle hierarchy and member count; keep revision information |
| Title icons | Parameters lacks its icon and title treatment is inconsistent | Consistent Lucide icons, alignment and sizing for pane/section headings and actions |
| Cost rows | Missing column headings and separate category/source/status presentation | Aligned responsive columns for identity/description, category/source, price/unit, available audit/status and actions |
| Typography | Slash-separated metadata competes with names; numeric price lacks formatting | Distinct labels, secondary metadata, monospaced codes and consistent currency formatting |
| Parameters | Four-column form is crowded compared with reference; tier inputs touch | Responsive three-column primary form, field spacing, tier row separators and compact aligned controls |
| Workbench | Formula/result hierarchy is flattened | Restore formula typography and an emphasized result band with readable KPI labels and values |
| States | Selected/expanded styling and visual status are weak | Consistent hover, focus, selected, expanded, disabled, error and unpriced states; never imply success for an unpriced/disabled result |
| Responsive layout | Persistent application sidebar leaves narrow mobile content | Verify with existing sidebar controls; adapt cost panes/rows/forms without redesigning the global shell |

Use existing UI tokens and Lucide, not the mockup's literal colors/fonts/custom
SVGs. Preserve application navigation and AppDialog. Do not invent audit users,
sample sets or production metadata to reproduce static mockup content.

## Options

1. Recommended: full Cost Library visual parity within the existing shell.
   Restores the approved information hierarchy without global styling changes.
2. Literal standalone-shell replica: closer outer-page match, but conflicts
   with the existing Legality navigation and is outside this correction.

## Workbench Comparison Addition

The user's subsequent screenshot adds an explicit functional scope beyond
visual parity: enrich the actual GH/standby workbench with an understandable
two-crew comparison, using the earlier `workbench.html` mockup as reference.

- Keep single-crew calculation available; provide a comparison mode with
  editable Crew A/B baseline credit, removed credit and optional hourly rates.
  Shared assignment inputs and the saved policy apply to both comparison sides.
- For standby, show eligible standby, standby pay/flight credit and total
  assignment credit as prominent HH:MM values. Preserve decimal-hour entry
  where used today; explicitly distinguish display units from input units.
- Show before/after credit bars for each crew on one common scale, with the
  guarantee threshold labeled from the saved policy, not hard-coded at 85.
  Adapt the axis to both results and the guarantee so large values cannot clip.
  Use simple accessible HTML/CSS bars with textual equivalents, no new library.
- Show a side-by-side breakdown table, highlighted incremental cash per crew
  and absolute cash difference. Do not claim a cheapest result if either side
  is disabled, unpriced, invalid or has a different currency.
- Reuse the existing saved-revision server calculator for each crew. Resolve
  standby's pinned GH dependency for the threshold; never use the latest
  unrelated GH revision. No duplicate browser payroll calculation.
- Clear or explicitly mark results stale after input/policy changes. Do not
  present one new result alongside an old result as a valid comparison.
- Preserve the compact mockup result band for other calculator families;
  GH charts do not belong on hotel, transfer or other unrelated costs.
- Stack comparison columns on narrow screens and retain readable labels.

Acceptance example: default GH85 with tiers1.2 through90 and1.5 above90,
hourly rate100; standby07:00 to departure10:00 with factor0.5/cutoff60minutes
and pairing5.75 yields eligible standby2:00, standby credit1:00, total6:45.
Crew A baseline84 becomes90:45 with incremental cash712.50; Crew B baseline70
becomes76:45 with incremental cash0.00; cash difference712.50.

## Behavioral Boundary

No schema, tariff, calculator-math, permission or revision changes. Keep pinned
revisions, historical/latest controls, saved-revision calculations and all
editable fields. Existing actions retain behavior. Mock-only bulk actions such
as Recalculate All are not silently added as part of styling; identify any
such functional differences separately. Preserve the approved mockup files.

## Implementation and Verification

Primary files: `gantt/src/components/cost/cost-library-view.tsx` and
`gantt/src/components/cost/cost-detail.tsx`; tightly scoped shared cost styles
only if they remove duplication. Extend `e2e/tests/gantt/cost-library.spec.ts`
for visual structure and state assertions without weakening existing coverage.

Compare matching desktop viewports and collapsed/expanded GH, standby, ordinary
cost, result, templates, selected set and dialog states. Capture new versioned
screenshots, including mobile, in `docs/assets/screenshots/crew-recovery/`.
Inspect screenshots for wrapping, clipping, overlapping elements and meaningful
surface differences. Run existing three Playwright workflows, Gantt typecheck,
`npm run check:ui` (zero hard violations) and `git diff --check`.
Add real-UI comparison assertions for the acceptance example, changed GH,
changed hourly rate, unpriced/error/stale states and narrow-screen chart layout.
Use GPT-5.5 for test work per the user's existing explicit request.

## Implementation Notes

Implemented in `cost-library-view.tsx`, `cost-detail.tsx` and the focused
`cost-workbench.tsx` component. Chart/cash values reuse saved-revision server
results; local math only formats durations, sizes bars and displays the delta.
No database migration was needed for this follow-up.

Screenshot review exposed the shared unlayered universal border-color reset
overriding Tailwind accent colors. Cost selection edges, formula edge and GH
markers therefore use inline existing theme tokens; global styling is untouched.
The comparison discards in-flight stale responses as well as clearing displayed
results on edits. Test receipts are in
`docs/test-cases/crew-recovery/cost-library-visual-parity.md`.
