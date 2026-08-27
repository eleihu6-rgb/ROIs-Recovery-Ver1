# Flight Detail → AppDialog (draggable)

**Status:** Approved (design dialogue 2026-08-22)  
**Scope:** Gantt Flight Detail dialog (Live + Scenario shared)

## Goal

Make Flight Detail draggable like Crew Info by migrating the shell to `@rois/ui` `AppDialog`, while keeping the existing body content, data loading, and compact spacing.

## Shell

| Concern | Behavior |
|---------|----------|
| Component | `AppDialog` (`draggable` default on) |
| Title | `#{id} {airline} {fltNum} · {Flight Date}` plus status badge (Partial / Full / …) as `title` ReactNode |
| Icon | Plane (same as current header) |
| Body | Existing Flight Info / times / duration / Composition / Crew Assignment; keep CSS under a root class (e.g. `flight-detail-dialog-root`) |
| Footer | Left: updated + crew/slots meta; Right: Assign Crew / Edit (disabled) + Close; `footerClassName="py-1"` |
| Dismiss | AppDialog overlay click + Escape + Close button (remove custom overlay / Escape listener) |
| Stacking | `className` / `overlayClassName` `z-[1100]` when needed so it stacks above other layers (same as Crew Info) |
| testid | `data-testid="flight-detail-dialog"` on AppDialog |

## Unchanged

- Live / Scenario flight + crew load and merge
- Crew ID → `openCrewInfo`
- Base column and as-of-date resolution
- Compact spacing already shipped in CSS

## Out of scope

- Enabling Assign Crew / Edit
- Redesigning body layout beyond shell migration
- Changing Pairing Info or other dialogs

## Tests

- Scen-2020 / Live-1073: open dialog via real UI; assert content; Close works
- Selectors keep `flight-detail-dialog` / crew table / crew-id buttons
- No regression on Crew Info open-from-Crew-ID

## Acceptance

1. Flight Detail opens and can be dragged by the title bar (Crew Info behavior).
2. Body and footer content match pre-migration behavior.
3. Escape / overlay / Close dismiss the dialog.
4. E2E Scen-2020 (and Live path when env allows) PASS.
