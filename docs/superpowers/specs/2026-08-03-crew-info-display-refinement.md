# Crew Info Display Refinement

## Scope

Refine the shared Live/Scenario Crew Info dialog without changing how it is
opened or how crew records are stored.

## Decisions

- Show all Crew Info sections on one page without top tabs or section headings.
- Place Basic Info fields first, followed by Base and Rank, then Fleet,
  Qualification, Certification, and Team.
- Hide the common audit fields from every displayed record.
- Hide all fields whose names start with `interface` from child-table records.
- Hide the explicitly excluded personal and legacy fields from Basic Info.
- Render date-like values as `YYYY-MM-DD`.
- Render numeric Seniority without a trailing `.00`.
- Load certification records through the existing crew certificates endpoint.
- Keep the Crew ID out of the dialog header area; the tab strip is the first
  content control.
- Place Base and Rank tables under Basic Info, side by side.
- In Crew Records, place Fleet beside Qualification and Certification beside
  Team.
- Apply the requested per-table field exclusions for Base, Rank,
  Qualification, Certification, and Team.
- Sort every child table by effective date descending and keep the paired
  tables side by side with compact scrollable heights. Use five columns per
  Basic Info row to preserve vertical space.

## Verification

- Update the focused Crew Info unit test and Scenario Crew Info Playwright
  assertions.
- Run Gantt TypeScript compilation, focused Vitest, relevant Playwright, and
  UI standard checks.
