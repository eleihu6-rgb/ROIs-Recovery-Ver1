# Gantt Help Full Menu Coverage

## Goal

Extend the in-app Help tree so Data, Legality, System, and PBS each expose a
topic for every current second-level product menu. Topics describe the shipped
surface, not registry-only or planned behavior.

## Information Architecture

- Data: add child topics for all 13 visible menu entries. Each topic lists the
  current data sections and the available grid actions. `Location & Route` must
  state that Airport is the only implemented section; `Crew Workload Summary`
  must be marked Partial because the UI is a placeholder.
- Legality: add topics for Rule Sets, Rule Templates, Composition, and Comp
  Load. The latter two are marked Partial because valid routes exist but are
  not exposed in the current sidebar menu.
- System: add topics for Scheduler, Users, Roles, Menus, PBS Users, and
  Departments. Add the supported operational integrations (Queue Tasks,
  Grafana, Prometheus, Windmill, Data Quality) as Partial topics because they
  are not current sidebar entries.
- PBS: add topics for Period, Bid Definitions, Business Time, Admin Tools, and
  Simulated Crew Portal. Admin-only surfaces must say so.

## Constraints

- Keep every topic body behind a `lazy()` import.
- Match labels, fields, permissions, and implemented/partial state to code.
- Do not advertise registry-only Data entities as current page sections.
- Add content assertions for the menu coverage and partial states.
- Bump `FRONTEND_VERSION`; run focused Help Playwright, UI gate, build, and
  `git diff --check`.

## Ongoing Coverage Gate

- Each visible Data, Legality, System, and PBS sidebar item declares a required
  `helpTopicSlug`; TypeScript prevents a newly added item from omitting it.
- Its matching Help registry entry declares `sourceMenuId`. The coverage script
  checks the two fields as a one-to-one relation and also checks visible title
  drift, reporting `GAP`, `DRIFT`, or `EXTRA` with a non-zero exit status.
- The online Help skill requires this check on every Help pass. The daily Help
  prompt and wrapper run it as a delivery gate, so a new submenu cannot be
  published without its Help topic being brought current.
- Intentionally non-sidebar or incomplete surfaces remain valid `Partial`
  topics, but do not declare `sourceMenuId`.
