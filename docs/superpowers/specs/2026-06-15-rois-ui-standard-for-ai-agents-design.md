# ROIS UI Standard For AI Agents

**Created**: 2026-06-15 America/Vancouver
**Audience**: Codex, Claude, and other AI coding agents working on ROIS frontends
**Scope**: Gantt, Scenario, Scenario Gantt, Legality, Rule, Data, System, Help, Release
**Status**: approved design standard

## Purpose

ROIS is an airline crew scheduling operations system. Its UI must feel like a professional workbench for dispatch, planning, legality, and schedule analysis. It should not feel like a marketing site, a consumer dashboard, or a decorative SaaS demo.

AI agents must optimize for:

1. Fast scanning.
2. Low visual noise.
3. Consistent dense layout.
4. Clear operational state.
5. Theme-safe implementation.
6. Performance-safe rendering, especially in Gantt and Scenario Gantt.

## External Best-Practice Baseline

Use these as background principles, not as a replacement for project rules:

- W3C WCAG 2.2: meet accessible contrast, target size, keyboard/focus, and non-color-only meaning requirements.
- IBM Carbon Design System: use role-based tokens, neutral layering, and productive typography for dense product screens.
- Material Design 3: maintain consistent type hierarchy and semantic use of type roles.
- Nielsen Norman Group dashboard guidance: data-heavy screens must support rapid scanning and preattentive recognition.

Reference links:

- https://www.w3.org/TR/WCAG22/
- https://carbondesignsystem.com/elements/color/overview/
- https://carbondesignsystem.com/elements/typography/type-sets/
- https://m3.material.io/styles/typography/applying-type
- https://www.nngroup.com/videos/data-visualizations-dashboards/

## Existing Project Foundation

Agents must use the existing design system before inventing styles.

Primary sources:

- `packages/ui/src/styles/globals.css`
- `packages/ui/src/theme/themes.ts`
- `packages/ui/src/components/`
- `gantt/src/components/gantt/gantt-constants.ts`
- `gantt/src/components/shell/`
- `gantt/src/components/scenario-gantt/`
- `gantt/src/components/legality/`
- `gantt/src/components/data/`
- `gantt/src/components/rule/`

The project already provides:

- CSS theme tokens: `background`, `foreground`, `card`, `muted`, `accent`, `primary`, `destructive`, `border`, `input`, `ring`.
- Sidebar tokens: `sidebar-background`, `sidebar-foreground`, `sidebar-accent`, `sidebar-border`.
- Gantt canvas variables: `--gantt-bg`, `--gantt-grid`, `--gantt-text`, `--gantt-task-flight`, `--gantt-row-selected`, and related variables.
- Dense type tokens: `text-3xs`, `text-2xs`, `text-xs`, `text-sm`, `text-base`.
- Small radius default: `--radius: 0.125rem`.
- Lucide icon usage across shell, toolbar, scenario, legality, and data screens.

## Core Visual Direction

### Required Tone

The UI should be:

- Professional.
- Calm.
- Dense.
- Precise.
- Airline-operations oriented.
- Easy to scan repeatedly for hours.

The UI should not be:

- Decorative.
- Gradient-heavy.
- Card-heavy without purpose.
- One-color monotone.
- Oversized.
- Marketing-like.
- Playful in critical operations views.

## Typography Standard

### Canonical Type Scale

Use the project type scale. Do not add arbitrary font sizes unless there is a measured canvas/layout reason.

| Token | Size | Use |
|---|---:|---|
| `text-3xs` | 9px | uppercase micro labels, compact chips, table headers in dense grids |
| `text-2xs` | 10px | counters, metadata, small badges, toolbar secondary labels |
| `text-xs` | 12px | default dense UI body, toolbar text, sidebar items, table cells |
| `text-sm` | 14px | section titles, dialog body text, important labels |
| `text-base` | 16px | page-level titles or dialog titles only |
| `text-lg+` | 18px+ | rare; only for true top-level empty states or help/article content |

### Typography Rules

- Default dense workbench text is `text-xs`.
- Module section headings are usually `text-sm font-semibold`.
- Table headers use `text-3xs` or `text-2xs`, uppercase only when helpful for scanning.
- IDs, times, numeric columns, versions, and counters should use `tabular-nums`; use mono only when it improves alignment.
- Avoid `text-[Npx]`. Migrate to project tokens unless canvas drawing requires a numeric constant.
- Do not scale font size with viewport width.
- Do not use negative letter spacing.
- Do not use hero-scale typography inside work surfaces.

### Migration Mapping (legacy `text-[Npx]` → token)

When cleaning up historical magic values, normalize to the nearest scale step — do not introduce new 11px/13px tiers:

`text-[8px]/[9px] → text-3xs` · `text-[10px] → text-2xs` · `text-[11px] → text-2xs or text-xs` (by density) · `text-[12px] → text-xs` · `text-[13px] → text-sm or text-xs` · `text-[14px] → text-sm` · `text-[16px] → text-base` · `text-[18px] → text-lg` · `text-[20px]/[21px]/[22px] → text-xl` · `text-[24px]/[26px] → text-2xl`

Legacy `text-[Npx]` still renders but new code must not add it; migrate opportunistically in files you touch. Each token has a bound recommended `line-height` — don't hand-write `leading-*` unless there's a specific need.

### Canvas Typography

Gantt canvas font sizes live in `gantt/src/components/gantt/gantt-constants.ts`.

Current canvas defaults are appropriate for dense operations:

- Header: 12px.
- Header day: 13px.
- Day-of-week: 10px.
- Task text: 11px.
- Panel text: 11px.
- Tooltip: 12px.

Agents must keep Live Gantt and Scenario Gantt visually aligned. If changing canvas typography, update shared constants or shared source abstractions, not one pane in isolation.

## Color Standard

### Token-First Rule

Use project tokens first:

- Surface: `bg-background`, `bg-card`, `bg-muted`, `bg-popover`.
- Text: `text-foreground`, `text-muted-foreground`, `text-popover-foreground`.
- Borders: `border-border`, `border-input`.
- Actions: `text-primary`, `bg-primary`, `ring-ring`.
- Danger: `text-destructive`, `bg-destructive`, `border-destructive`.
- Sidebar: `bg-sidebar-background`, `text-sidebar-foreground`, `border-sidebar-border`.

For canvas, use Gantt variables through `gantt-constants.ts` and `getGanttColors()`.

### Page Color Budget

Each operational page should mostly use neutral surfaces and one accent family.

Recommended budget per page:

- 70-85% neutral: background, card, muted, border, foreground.
- 10-20% structural accent: selected tab, active row, primary action.
- 5-10% semantic colors: severity, lock, warning, destructive, success.

Do not turn every card, chip, header, and icon into a different bright color. Color should guide attention and encode meaning.

### Semantic Color Rules

- Blue/primary: active selection, current context, primary action.
- Amber/yellow: warning, pending, editable lock ownership, frozen rows.
- Red/destructive: violation, blocked, delete, critical error.
- Green: success, valid, complete, fully crewed.
- Purple/pink: only where already meaningful in task/domain colors.
- Gray/muted: disabled, secondary, inactive, historical, low priority.

Color must not be the only indicator. Pair it with icon, text, border style, shape, or position.

### Avoid

- New hard-coded hex values in React class strings.
- Random `bg-blue-500/15` style chips when an existing token or helper exists.
- Multiple saturated chips in one row.
- Decorative gradients, glow effects, color blobs, or visual wallpaper.
- Strong colored backgrounds behind large content regions unless the screen is a focused status state.

## Layout Standard

### Shell

The shell is a dense desktop workbench:

- Top nav height: compact, currently `h-11`.
- Sidebar: compact, collapsible, token-based.
- Content area: full height, no decorative outer page card.
- Keep-alive tabs require performance care; hidden heavy views must be suspended when appropriate.

### Work Surface Structure

Most modules should follow this order:

1. Optional compact module header.
2. Filter/search/action toolbar.
3. Main table, canvas, grid, or split-pane content.
4. Optional status/footer bar.

Do not make landing pages for operational modules. The first screen should be the actual tool.

### Spacing

Use compact spacing:

- Toolbar height: 32-40px.
- Icon buttons: 28-32px visual size on desktop.
- Dense rows: 36-44px depending on content.
- Side panels: fixed or constrained widths; avoid responsive drifting.
- Internal gaps: `gap-1`, `gap-1.5`, `gap-2`.
- Section padding: usually `px-3`, `px-4`, `py-2`.

Use larger spacing only in help articles, empty states, or forms that require readability.

### Radius

The project root radius is very small. Prefer:

- `rounded-sm` for toolbar buttons, nav tabs, table controls.
- `rounded` or `rounded-md` for compact chips and dialogs.
- Avoid `rounded-xl`, `rounded-2xl`, and pill-heavy styling in operations screens.

## Component Standards

### Buttons

- Toolbars should prefer icon buttons with tooltips.
- Use text buttons only for clear commands where the label prevents mistakes: Save, Apply, Delete, Publish, Import.
- Critical actions require clear label and confirmation when destructive.
- Disabled state must be visually obvious and must not rely only on cursor behavior.
- Use existing `@rois/ui` `Button` where possible.

### Icons

- Use lucide icons already established in the project.
- Icon size in dense toolbars: usually `h-3.5 w-3.5`.
- Sidebar icons: usually `h-4 w-4`.
- Icons must clarify function, not decorate.
- Add tooltip for icon-only controls.

### Tabs

Top module tabs and Scenario Gantt tabs must:

- Fit in the top nav without overlapping.
- Truncate long labels.
- Keep close icons small and stable.
- Show active state clearly with token background/text.
- Avoid large colored tab backgrounds except domain chips like PO/RO/TO when already defined.

### Cards

Use cards for:

- Repeated list items.
- Dialog bodies.
- Small summary/KPI blocks.
- Bounded form sections.

Do not use cards for:

- Page sections that should be full-width work surfaces.
- Wrapping another card.
- Decorative hero blocks.
- Every table row when a table is more appropriate.

### Tables

Tables should be dense and scannable:

- Header: compact, muted, sticky when useful.
- Body text: `text-xs`.
- Numeric/time columns: `tabular-nums`.
- Row hover: subtle `bg-muted/40` or token equivalent.
- Selection: clear left border or background, not a loud full-row color.
- Empty/loading states: centered, short, and operationally useful.

### Chips And Badges

Use chips sparingly:

- Status.
- Rule taxonomy.
- Scenario type.
- Severity.
- Default/current indicators.

Chip text should usually be `text-3xs` or `text-2xs`. Prefer muted backgrounds and semantic text over saturated blocks.

## Module-Specific Standards

### Live Gantt

Live Gantt is the primary operations canvas. It must remain dense, fast, and stable.

Keep:

- `LEFT_PANEL_WIDTH = 260` default alignment unless the user explicitly changes layout.
- `ROW_HEIGHT = 43` and dual-line roster panel rhythm unless there is a coordinated redesign.
- Shared time axis and pane alignment.
- Compact status bar and summary bar.
- Canvas virtualization and requestAnimationFrame rendering.

Do:

- Use `--gantt-*` variables for canvas colors.
- Keep roster, pairing, and flight panes visually consistent.
- Keep current time, selected row, violation, frozen row, and drag/drop states visually distinct.
- Verify both light and dark themes.

Do not:

- Add DOM-heavy overlays per row when canvas rendering can handle the state.
- Add large text labels inside narrow task blocks without truncation logic.
- Change only Live or only Scenario Gantt canvas styling without checking the other.

### Scenario Gantt

Scenario Gantt should feel like Live Gantt plus scenario context, not a separate product.

Required:

- Reuse Live Gantt visual rules for rows, panes, task blocks, selection, hover, and severity.
- Keep PO/RO/TO identity compact through existing scenario type color helpers.
- Keep lock/edit state visible but not dominant.
- Suspend or reduce hidden heavy rendering where possible.
- Preserve dirty/editing state clearly.

Toolbar rules:

- Scenario name: `text-xs font-semibold`.
- Scenario type chips: `text-3xs`, compact.
- Lock/edit controls: icon plus short status text.
- Pane toggles: compact, stable width, do not wrap.

### Scenario List / Scenario Tab

Scenario browse and scenario tab UI should be split-pane and task-oriented:

- Left panel list can be around 360-420px if it improves scanning.
- Search and filter controls stay at top.
- Scenario list item should show name, type, status, date range, and key metadata without visual overload.
- Opening a Scenario Gantt tab should create a compact top tab with truncated scenario label.

Avoid:

- Large scenario cards that reduce list density.
- Too many colored tags per scenario row.
- Empty states that take over the page when data exists elsewhere.

### Legality

Legality is a rule workbench. It should be table-first and highly scannable.

Current direction is good:

- Left ruleset rail.
- Header with selected ruleset.
- Search toolbar.
- Dense rules table.
- Compact taxonomy chips.

Agents should preserve:

- `text-xs` row content.
- `text-3xs` table headers and rule metadata chips.
- Compact search input.
- Rule severity as semantic color plus text/icon.

Avoid:

- Replacing the rules table with large cards.
- Using bright color for every category.
- Making parameters or severity hard to compare across rows.

### Rule / Data / System

These modules should follow the same product pattern:

- Sidebar or local nav when needed.
- Compact toolbar.
- Table/grid as the main work surface.
- Dialogs for create/edit/detail.
- Muted cards only for summaries or grouped forms.

Data maintenance screens should prioritize row comparison and editing accuracy over decorative layout.

### Help / Release

Help and Release may use more readable spacing than Gantt/Legality, but must still use project tokens.

- Help articles can use `text-sm` body and more vertical spacing.
- Release pages can use clearer section headings and changelog grouping.
- They should still avoid gradients, oversized hero sections, and arbitrary color palettes.

## Accessibility Standard

Minimum requirements:

- Text contrast should meet WCAG AA: 4.5:1 for normal text where possible.
- UI component non-text contrast should be clear enough for borders, focus, and state.
- Pointer targets should meet WCAG 2.2 minimum guidance or have sufficient spacing/equivalent access.
- Every icon-only button needs an accessible label or tooltip.
- Focus state must remain visible.
- Do not use color as the only state indicator.
- Inputs need labels, placeholders, or surrounding context that stays understandable.
- Keyboard interactions must not trap focus in dialogs, menus, or panes.

Dense desktop UIs may use compact targets for power users, but agents must preserve keyboard accessibility and avoid placing undersized controls too close together.

## Performance-Aware UI Rules

Because Gantt and Scenario Gantt can use large datasets:

- Prefer canvas rendering for dense timeline rows.
- Avoid mounting hidden canvas-heavy views unless there is a clear keep-alive reason.
- Avoid per-row React components for thousands of items.
- Memoize derived row maps/buckets where needed, but avoid duplicating full datasets casually.
- Do not add expensive style reads in render loops; use existing optimized `getGanttColors()` pattern.
- Do not add animated effects to thousands of rows/items.
- Do not add background polling to hidden tabs without an explicit reason.

## Agent Implementation Rules

Before changing UI, agents must check:

1. Is there an existing `@rois/ui` component?
2. Is there an existing shell/scenario/gantt pattern?
3. Is there a token for this color, radius, spacing, or type?
4. Is the page a dense operations surface or a readable article/detail surface?
5. Will this change affect dark mode?
6. Will this change affect hidden-tab memory or canvas performance?

Agents must avoid:

- Arbitrary `text-[Npx]` values.
- New hard-coded colors in component class strings.
- Large rounded cards as the default layout.
- In-app explanatory marketing text.
- Unbounded labels in top nav, tabs, toolbar buttons, or table cells.
- Adding dependencies for visual polish without approval.
- Adding telemetry or analytics packages.

## Verification Checklist

For UI changes, verify at least:

- Live Gantt renders without overlap.
- Scenario Gantt renders without overlap.
- Scenario top tabs truncate long names.
- Legality table remains dense and readable.
- Dark theme still has readable contrast.
- Toolbar buttons remain aligned at desktop widths.
- Text does not overflow buttons, chips, table cells, or tabs.
- Icon-only controls have tooltip or accessible label.
- No console errors.
- Build/typecheck passes for touched frontend package.

Recommended commands:

```bash
cd gantt
npm run build
```

For visual changes, use browser screenshots for:

- Live Gantt.
- Scenario Gantt.
- Legality.
- One dark theme screen.
- One narrow desktop/tablet width if the touched component can shrink.

## Quick Decision Guide

When unsure, choose:

- Smaller over larger.
- Neutral over colorful.
- Token over hard-coded value.
- Table/grid over decorative cards.
- Icon plus tooltip over verbose toolbar text.
- One clear accent over many competing accents.
- Canvas/shared constants over one-off pane styling.
- Operational clarity over visual novelty.

## Definition Of Done

A UI change follows this standard when:

- It uses existing project tokens and components.
- It keeps dense operations screens compact and scannable.
- It limits color to structure and semantic state.
- It works in light and dark themes.
- It does not make Gantt or Scenario Gantt heavier without need.
- It can be understood by another agent without inventing a new style language.
