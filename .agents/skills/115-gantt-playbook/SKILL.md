---
name: 115-gantt-playbook
description: Use when the user says "gantt playbook", or before starting ANY Live/Scenario gantt feature or gantt debugging task. Loads the canonical Live/Scenario Gantt reference (architecture, shared source layer, stores, panes, data model, filters, capabilities, backend endpoints, gotchas) so you work from accumulated knowledge instead of re-deriving it.
---

# Gantt Playbook

When this skill is invoked (or the user says "gantt playbook"):

1. **Read the full playbook first**, before touching any gantt code:

   `docs/modules/gantt/live-scenario-gantt-playbook.md`

   (repo: ROIs-Crew-Ver4-PBS). This is the single canonical reference accumulating
   all Live + Scenario gantt knowledge: the §Gantt-Unify one-code-path principle,
   the source-abstraction layer (`gantt/src/components/gantt/source/*`), the
   per-context store registry, shared pane components + column system, the gantt
   data model + type shapes, Live vs Scenario backend endpoints, filters/sort/
   coverage, capabilities, the e2e harness, and hard-won gotchas.

2. **Apply §Gantt-Unify**: any common gantt feature/bugfix must land in the shared
   layer so Live AND Scenario both benefit; source differences hide behind a
   `GanttPaneSource` capability, never a forked UI. Confirm "can this go in the
   shared layer?" before writing scenario-only or live-only code.

3. **Keep it alive**: after finishing a gantt task that uncovered new structure,
   behavior, a data-model trap, or a debugging lesson, append/update the relevant
   section of the playbook (and bump anything stale) — it is meant to grow.

If the playbook file does not yet exist, it is being (re)generated; check
`docs/modules/gantt/` and tell the user.
