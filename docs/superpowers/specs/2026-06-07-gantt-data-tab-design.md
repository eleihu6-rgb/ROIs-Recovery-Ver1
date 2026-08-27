# Gantt Data Tab Design

Date: 2026-06-07
Module: `gantt` + `live-server`
Status: Draft, awaiting user approval before implementation

Implementation plan: `docs/superpowers/plans/2026-06-06-231433-gantt-data-tab-implementation-plan-Ver1.md`
Mandatory validation standard: `docs/test-cases/gantt/data-tab-validation-standard.md`

## Goal

Build a professional data-maintenance tab in the Gantt app where authorized users can view and modify basic setup data and crew HR data while preventing invalid references, broken effective-dated records, duplicate keys, and unsaved accidental changes.

This is an HR-style master-data workspace, not a free-form database editor. The UI should guide users into valid choices and the server must reject invalid batches even if a caller bypasses the UI.

## Existing Context

- The top navigation already exposes a `Data` module, currently rendered by `PlaceholderView`.
- `live-server` already has base routes for `base`, `rank`, `fleet`, `composition`, `dictionary`, and related objects.
- `live-server` already has crew routes for `crew`, `crew_rank`, `crew_base`, `crew_fleet`, `crew_qualification`, `crew_team`, and other sub-resources.
- Most existing APIs validate request shapes with Zod, but referential integrity is not consistently centralized.
- Some references are code-based, not physical FK columns, for example `crew_base.base -> base.base` and `crew_rank.rank -> rank.rank`.

## Scope

### Basic Root

Left tree root: `Basic`

Initial pages:

- `Org & Base`: `filiale`, `base`, `department`, `division`, `division_construction`, `team`
- `Rank`: `rank`, `rank_acting`, `rank_position`
- `Fleet & Aircraft`: `fleet`, `aircraft`
- `Location & Route`: `airport`, `route`, `hotel`
- `Assignment`: `assignment`, `assignment_group`, `assignment_group_map`
- `Qualification`: `qualification`, `qualification_projection`, `certificate`, `language`, `port_qual_reqmnt`
- `Composition`: `composition`, `composition_rank`, `composition_load`
- `Roster Period`: `roster_period`, `roster_period_config`
- `Configuration Dictionary`: `dictionary`, `attribute`, `live_config`, `severity`, `pane_header`
- `Query`: `query_criteria`, `sort_criteria`, `user_query`, `query`
- `Holiday Calendar`: `holiday`

The first implementation can prioritize the core pages already requested, but the Data tab scope should account for the setup tables above so we do not design a dead-end navigation model.

### Crew Root

Left tree root: `Crew`

One crew workspace page covering:

- Crew basic: table `crew`
- Crew base: table `crew_base`
- Crew rank: table `crew_rank`
- Crew fleet: table `crew_fleet`
- Crew qualification: table `crew_qualification`
- Crew team: table `crew_team`
- Crew status: table `crew_status`
- Crew certificate: table `crew_certificate`
- Crew license: tables `crew_license`, `crew_lic_instructor`
- Crew language: table `crew_language`
- Crew entitlement: table `crew_entitlement`
- Crew memo/profile: tables `crew_memo`, `crew_profile`
- Crew seniority: table `crew_seniority`
- Crew KPI adjust: table `crew_kpi_adjust`, advanced/audited only because it affects calculated values

Crew manday tables (`crew_manday_fd_daily`, `crew_manday_fd_monthly`, `crew_manday_fd_yearly`, `crew_manday_cc_am_daily`, `crew_manday_cc_am_monthly`, `crew_manday_cc_am_yearly`, `manday_archive_log`) are generated/archived workload summaries. They can be view-only diagnostics in Data tab, but should not be manually edited in normal HR maintenance.

Explicitly omitted from Data tab maintenance:

- Flight operational data: `flight`, `flight_composition`
- Pairing operational data: `pairing`, `pairing_segment`, `pairing_composition`, `pairing_template`, `pairing_template_detail`, `pairing_memo`
- Roster operational data: `roster_flight`, `roster_publish`, `roster_publish_adjust`, `schedule_publish_record`
- Scenario/optimization data: `scenario`, `scenario_group`, `scenario_kpi`, scenario files
- Rule authoring tables: maintained in the existing Rule tab
- System/security tables: `users`, profile authorization, menus, warn authorization, login audit
- Tag assignment tables tied to flight/pairing/roster operations; if needed later, expose them from the relevant Gantt workflow instead of this HR/basic data page

Crew filter conditions:

- crew id
- name
- rank
- base
- qualification
- team
- expiry status/date

Filters are optional and combinable. Within a field, multiple selected values should be OR; across fields, filters should be AND.

Expiry filtering is required for crew data. It should support:

- `Current / active`: default behavior; rows whose `exp_dt` is null or not before the reference date.
- `Expired`: rows whose expiry date is before the reference date.
- `Expiring in X days`: rows whose expiry date is between the reference date and `reference date + X days`, inclusive.
- Optional advanced mode: explicit expiry date range.

The expiry filter must be able to apply to all effective-dated crew sections or to a specific section: `Crew Base`, `Crew Rank`, `Crew Fleet`, `Crew Qual`, or `Crew Team`. The reference date defaults to today in the user's operating timezone. `X days` must be a positive integer and should be parameterized/validated, not hard-coded.

## UX Design

### Layout

Use a dense enterprise maintenance layout:

- Left pane: tree navigation, fixed width around 220-260px, resizable if existing pane patterns support it.
- Main header: selected dataset title, record count, dirty-change count, validation status, save/undo/redo controls.
- Filter bar: compact controls, chips for active filters, reset button.
- Crew filter bar includes an expiry group: expiry scope, expiry mode, reference date, and days/range fields as applicable.
- Main area: editable data grid with pinned key columns and row-level validation markers.
- Right inspector drawer: selected row details, references, validation messages, audit fields, and change history for the draft.

Do not use marketing-style cards. This should feel closer to AIMS, Jeppesen, Sabre CrewTrac, or Workday admin grids: restrained, high-density, keyboard-friendly, and explicit about data quality.

### Tree

Tree structure:

```text
Basic
  Org & Base
  Rank
  Fleet & Aircraft
  Location & Route
  Assignment
  Qualification
  Composition
  Roster Period
  Configuration Dictionary
  Query
  Holiday Calendar
Crew
  Crew Master
  Crew Workload Summary (view-only)
```

`Composition` opens one combined setup workspace because `composition_rank` and `composition_load` are children of `composition`. The page should show stacked sections:

- Composition
- Composition Rank
- Composition Load

Selecting a composition row should filter or highlight the related rank rows by `comp_id`, and users should not need to leave the page to maintain the rank requirements for that composition.

`Crew Master` opens one combined crew workspace. It should show the filtered crew list and all related crew data on the same page, grouped into stacked sections instead of separate tabs/pages:

- Crew Basic
- Crew Base
- Crew Rank
- Crew Fleet
- Crew Qual
- Crew Team
- Crew Status
- Crew Certificate
- Crew License & Instructor
- Crew Language
- Crew Entitlement
- Crew Memo & Profile
- Crew Seniority
- Crew KPI Adjust

The intent is to let HR/data users inspect a crew member's complete profile with minimal clicking. Each section can be collapsed for density, but the default view should expose the core crew groups together. Selecting a crew row should keep the related section rows aligned to the same `crew_id` context. Less-frequently-used sections can start collapsed, but should remain on the same Crew Master page.

### Editing Model

- Grid edits are staged locally first.
- Save is batch/transactional per page.
- Save button is disabled when validation has blocking errors.
- Non-blocking warnings are visible but do not block save.
- Delete should be soft delete where the table supports it. For current tables without `is_deleted`, do not introduce destructive delete in the UI; mark as inactive/expired where business semantics exist.
- Effective-dated rows should use guided date controls and prevent overlapping active ranges for the same business key.

### Undo / Redo

Each data page has a local draft command stack:

- Add row
- Edit cell
- Delete/expire row
- Bulk paste/import changes, if added later

Undo/redo applies only to unsaved changes. After save succeeds, the command stack resets and a new server revision/audit entry is created.

Controls:

- Undo and redo icon buttons in the page header with keyboard shortcuts.
- Dirty rows highlighted subtly.
- A change drawer shows pending operations in order.

## Integrity Rules

Validation must run in two places:

1. Client-side, to prevent bad options and give immediate feedback.
2. Server-side, inside a batch validation/save endpoint, to guarantee integrity.

The UI should avoid offering invalid choices by using reference-backed select controls instead of free text for parent-key fields.

### Parent-Key Checks

Initial required checks:

| Child table/field | Parent table/field | Rule |
| --- | --- | --- |
| `crew_base.crew_id` | `crew.crew_id` | Crew must exist. |
| `crew_base.base` | `base.base` scoped by compatible `filiale` | Base must exist. |
| `crew_rank.crew_id` | `crew.crew_id` | Crew must exist. |
| `crew_rank.rank` | `rank.rank` | Rank must exist and be valid for crew division where applicable. |
| `crew_fleet.crew_id` | `crew.crew_id` | Crew must exist. |
| `crew_fleet.fleet_specific` | `fleet.fleet` | Fleet must exist. |
| `crew_qualification.crew_id` | `crew.crew_id` | Crew must exist. |
| `crew_qualification.qualification` | `qualification.qualification` scoped by `filiale`/`division` where applicable | Qualification must exist. |
| `crew_qualification.rank` | `rank.rank` when provided | Rank must exist. |
| `crew_qualification.fleet_specific` | `fleet.fleet` when provided | Fleet must exist. |
| `crew_qualification.bases` | `base.base` for every parsed value when provided | All bases must exist. |
| `crew_qualification.ranks` | `rank.rank` for every parsed value when provided | All ranks must exist. |
| `crew_qualification.fleets` | `fleet.fleet` for every parsed value when provided | All fleets must exist. |
| `crew_qualification.teams` | `team.team` or `team.id`, depending on stored value after inspection | All teams must exist. |
| `crew_team.crew_id` | `crew.crew_id` | Crew must exist. |
| `crew_team.team_id` | `team.id` | Team must exist. |
| `composition_rank.comp_id` | `composition.id` | Composition must exist. |
| `composition_rank.rank` | `rank.rank` | Rank must exist. |
| `composition_load.comp_id` | `composition.id` when provided | Composition must exist. |
| `composition_load.fleet` | `fleet.fleet` when provided | Fleet must exist. |

Before implementation, inspect current seed/data conventions for comma-separated fields such as `crew_qualification.bases`, `ranks`, `fleets`, and `teams`; then implement a shared parser/validator instead of ad hoc string checks.

### Uniqueness Checks

Preserve and surface existing unique keys:

- `base`: `filiale + base`
- `rank`: `rank`
- `fleet`: `fleet`
- `crew`: `crew_id`
- `crew_rank`: `crew_id + ac_type + rank + position + eff_dt`
- `team`: `filiale + team + division`

Add page-level duplicate detection before save so duplicate rows are marked in the grid.

### Effective-Date Checks

For crew history tables:

- `eff_dt` is required.
- `exp_dt` must be null or greater than `eff_dt`.
- For the same crew and business dimension, overlapping active windows are blocking errors unless the table intentionally allows parallel qualifications/fleets.
- Prime/current base rules must be explicit: do not allow two current prime bases for the same crew at the same time.

### Delete / Parent In Use

Do not allow deleting or deactivating parent setup records that are still referenced by active child data unless the action only expires future use and preserves historical references.

Examples:

- Base referenced by active `crew_base` cannot be removed.
- Rank referenced by active `crew_rank` or `composition_rank` cannot be removed.
- Fleet referenced by active `crew_fleet`, `composition_load`, pairing, or flight data cannot be removed.
- Qualification referenced by active `crew_qualification` cannot be removed.

## API Design

Add a new data-maintenance API layer rather than relying only on individual CRUD routes.

Suggested endpoints:

```text
GET  /api/data/catalog
GET  /api/data/reference-options
GET  /api/data/table/:entity
POST /api/data/validate
POST /api/data/save
```

For `Crew Master`, `GET /api/data/table/:entity` or the dedicated crew data query must accept expiry filter parameters equivalent to:

- `expiryScope`: `all | base | rank | fleet | qualification | team`
- `expiryMode`: `current | expired | expiring_in_days | range`
- `referenceDate`: `YYYY-MM-DD`, default today
- `expiryDays`: positive integer when `expiryMode = expiring_in_days`
- `expiryFrom` / `expiryTo`: optional range fields when `expiryMode = range`

Expiry filtering should be executed server-side so pagination/counts are correct and large crew datasets do not require client-side full scans.

`/api/data/save` accepts a batch of typed operations and saves them in one transaction. It must:

- Re-run all validation rules.
- Use the current schema/search_path.
- Apply audit fields from authenticated user.
- Invalidate relevant Redis caches.
- Return structured row/cell validation errors if rejected.
- Return a new revision id if committed.

Do not write sensitive data to logs.

## Frontend Implementation Shape

Suggested new files:

- `gantt/src/components/data/data-view.tsx`
- `gantt/src/components/data/data-tree.tsx`
- `gantt/src/components/data/data-grid.tsx`
- `gantt/src/components/data/crew-master-view.tsx`
- `gantt/src/components/data/data-toolbar.tsx`
- `gantt/src/components/data/validation-panel.tsx`
- `gantt/src/services/data-api.ts`
- `gantt/src/stores/data-maintenance-store.ts`
- `gantt/src/types/data-maintenance.ts`

The `Data` module in `AppShell` should render `DataView`.

Use existing `@rois/ui` primitives and lucide icons. Avoid introducing new dependencies unless strictly needed and reviewed for license/security.

## AI Coding Contract

This section is intentionally deterministic for coding agents. Prefer following these names and boundaries unless local code inspection proves a different existing pattern is safer.

### Module IDs

Use stable IDs instead of display labels:

```typescript
export type DataRootId = 'basic' | 'crew'

export type DataPageId =
  | 'basic.org-base'
  | 'basic.rank'
  | 'basic.fleet-aircraft'
  | 'basic.location-route'
  | 'basic.assignment'
  | 'basic.qualification'
  | 'basic.composition'
  | 'basic.roster-period'
  | 'basic.config-dictionary'
  | 'basic.query'
  | 'basic.holiday'
  | 'crew.master'
  | 'crew.workload-summary'

export type DataEntityId =
  | 'filiale' | 'base' | 'department' | 'division' | 'division_construction' | 'team'
  | 'rank' | 'rank_acting' | 'rank_position'
  | 'fleet' | 'aircraft'
  | 'airport' | 'route' | 'hotel'
  | 'assignment' | 'assignment_group' | 'assignment_group_map'
  | 'qualification' | 'qualification_projection' | 'certificate' | 'language' | 'port_qual_reqmnt'
  | 'composition' | 'composition_rank' | 'composition_load'
  | 'roster_period' | 'roster_period_config'
  | 'dictionary' | 'attribute' | 'live_config' | 'severity' | 'pane_header'
  | 'query_criteria' | 'sort_criteria' | 'user_query' | 'query'
  | 'holiday'
  | 'crew' | 'crew_base' | 'crew_rank' | 'crew_fleet' | 'crew_qualification' | 'crew_team'
  | 'crew_status' | 'crew_certificate' | 'crew_license' | 'crew_lic_instructor' | 'crew_language'
  | 'crew_entitlement' | 'crew_memo' | 'crew_profile' | 'crew_seniority' | 'crew_kpi_adjust'
```

Do not use table display names as logic keys. Display labels can change; IDs should not.

### Entity Registry

Create a registry object instead of hard-coding table behavior inside components:

```typescript
interface DataEntityConfig {
  id: DataEntityId
  tableName: string
  pageId: DataPageId
  label: string
  editable: boolean
  primaryKey: 'id'
  businessKey: string[]
  columns: DataColumnConfig[]
  references: DataReferenceConfig[]
  effectiveDate?: {
    effField: 'effDt' | 'eff_dt'
    expField: 'expDt' | 'exp_dt'
    overlapKey: string[]
  }
}

interface DataColumnConfig {
  key: string
  dbField: string
  label: string
  type: 'text' | 'number' | 'date' | 'datetime' | 'select' | 'multi-code' | 'boolean'
  required?: boolean
  maxLength?: number
  referenceEntity?: DataEntityId
  readonly?: boolean
}

interface DataReferenceConfig {
  childField: string
  parentEntity: DataEntityId
  parentField: string
  required: boolean
  parser?: 'single-code' | 'csv-code-list'
}
```

Expected file:

- `gantt/src/config/data-entity-registry.ts`

Backend may mirror this with:

- `live-server/src/services/data/data-entity-registry.ts`

### API DTOs

Use these shapes as the implementation baseline:

```typescript
export interface DataTableQuery {
  pageId: DataPageId
  entityId?: DataEntityId
  page: number
  pageSize: number
  filters?: Record<string, unknown>
  expiry?: DataExpiryFilter
}

export interface DataExpiryFilter {
  scope: 'all' | 'base' | 'rank' | 'fleet' | 'qualification' | 'team' | 'status' | 'certificate' | 'license' | 'language' | 'entitlement' | 'profile'
  mode: 'current' | 'expired' | 'expiring_in_days' | 'range'
  referenceDate: string
  days?: number
  from?: string
  to?: string
}

export interface DataChange {
  clientChangeId: string
  entityId: DataEntityId
  action: 'create' | 'update' | 'expire' | 'delete'
  rowId?: number
  crewId?: string
  before?: Record<string, unknown>
  after: Record<string, unknown>
}

export interface DataValidationIssue {
  severity: 'error' | 'warning'
  code:
    | 'missing_parent'
    | 'duplicate_key'
    | 'invalid_effective_range'
    | 'overlap_effective_range'
    | 'parent_in_use'
    | 'invalid_value'
  entityId: DataEntityId
  rowId?: number
  clientChangeId?: string
  field?: string
  message: string
  parentEntityId?: DataEntityId
  parentField?: string
  parentValue?: string
}
```

### Stable Test IDs

Use stable `data-testid` values on major UI surfaces:

- `data-view`
- `data-tree`
- `data-tree-root-basic`
- `data-tree-root-crew`
- `data-tree-item-${pageId}`
- `data-toolbar`
- `data-undo`
- `data-redo`
- `data-validate`
- `data-save`
- `data-discard`
- `data-filter-crew-id`
- `data-filter-name`
- `data-filter-rank`
- `data-filter-base`
- `data-filter-qualification`
- `data-filter-team`
- `data-filter-expiry-scope`
- `data-filter-expiry-mode`
- `data-filter-expiry-days`
- `data-section-${entityId}`
- `data-grid-${entityId}`
- `data-validation-panel`
- `data-validation-issue`

For `pageId` containing dots, keep dots in the actual value. Do not transform to display text.

### File Boundaries

Frontend:

- `data-view.tsx`: module shell, page selection, layout composition only.
- `data-tree.tsx`: tree rendering and page navigation only.
- `data-toolbar.tsx`: save/undo/redo/validate/discard controls.
- `data-filter-bar.tsx`: crew/basic filters and expiry controls.
- `data-section.tsx`: section header, collapse state, add-row entry.
- `data-grid.tsx`: generic editable grid from entity config.
- `crew-master-view.tsx`: Crew Master grouped page composition.
- `composition-view.tsx`: Composition + Composition Rank + Composition Load grouped page composition.
- `validation-panel.tsx`: issues and pending change review.
- `data-maintenance-store.ts`: selected page, loaded rows, draft changes, undo/redo stacks.
- `data-api.ts`: only HTTP calls and DTO mapping.

Backend:

- `routes/data/index.ts`: endpoint registration and Zod request parsing.
- `services/data/data-query-service.ts`: server-side table/crew query and expiry filtering.
- `services/data/data-validation-service.ts`: parent-key, duplicate, effective-date, and delete-in-use validation.
- `services/data/data-save-service.ts`: transaction application and cache invalidation.
- `services/data/data-reference-service.ts`: reference option loading.

### Implementation Phases

1. Wire `DataView` into the existing `data` module placeholder with read-only tree and grouped page shells.
2. Add registry and read-only query APIs for core requested pages: `crew.master`, `basic.composition`, `basic.org-base`, `basic.rank`, `basic.fleet-aircraft`, `basic.qualification`.
3. Add client draft store with undo/redo but keep save disabled behind validation.
4. Add server validation endpoint and client issue rendering.
5. Add transactional save endpoint for the core editable entities.
6. Add expiry filters server-side and Playwright coverage.
7. Expand remaining scoped Basic/Crew tables after core flows pass.

### Coding Constraints

- Do not add a generic SQL table editor.
- Do not manually edit flight, pairing, roster, scenario, security, or rule-authoring tables from Data tab.
- Do not use front-end-only validation for integrity.
- Do not introduce a new grid dependency without license/security review.
- Do not hard-code airline-specific values such as bases, ranks, fleets, or qualifications.
- Do not log crew personal data or sensitive document numbers.

## Testing

### Unit / Integration

Backend:

- Validation rejects missing parent base/rank/fleet/qualification/team.
- Validation rejects duplicate keys in a batch.
- Validation rejects invalid effective-date ranges.
- Save is transactional: if one operation fails, none commit.
- Cache invalidation occurs for changed entity groups.

Frontend:

- Undo/redo command stack.
- Client validation blocks save.
- Crew filters compose correctly.
- Expiry filters correctly switch between current, expired, and expiring-within-X-days modes.
- Reference-backed selects do not expose invalid parent options.

### Playwright

Create Gantt E2E tests:

- Navigate to Data tab and verify tree roots `Basic` and `Crew`.
- Open Basic > Base and edit a non-key field, undo, redo, save.
- Open Basic > Composition and verify `Composition` and `Composition Rank` are visible together on one page.
- Open Crew > Crew Master, filter by two or more criteria, verify visible rows satisfy all selected criteria using app/test introspection or API-backed assertions.
- Open Crew > Crew Master, query expired records and expiring-within-X-days records; verify returned section rows satisfy the `exp_dt` window.
- Attempt to create a crew base with invalid base; the UI should prevent invalid selection. If forced through test hook/API, save must fail with a specific validation error.
- Attempt to delete/deactivate an in-use parent setup row; UI blocks action and shows references.
- Verify unsaved changes survive tree navigation inside Data tab but are warned before closing tab or switching away.

Follow existing Gantt anti-illusion rules: avoid hard-coded positive filter values unless seeded or discovered dynamically first.

## Acceptance Criteria

- Data tab replaces the placeholder with a professional two-pane data-maintenance workspace.
- Left tree has `Basic` and `Crew` roots with the requested child pages.
- `Composition` and `Composition Rank` are maintained together in one `Composition` page.
- Users can view and edit the scoped basic and crew data.
- Parent-key violations cannot be selected in normal UI controls.
- Server-side validation still rejects violations.
- Save is disabled when blocking errors exist.
- Undo/redo works for all unsaved edits before save.
- Crew filters support zero, one, or multiple criteria.
- Crew filters support expiry-based queries for expired records and records expiring in X days.
- Playwright tests cover navigation, editing, validation blocking, undo/redo, and multi-criteria crew filtering.

## Open Decisions Before Implementation

1. Should the first version include only the requested tables, or also expose airport/aircraft/assignment because they already exist under base setup?
2. Should parent-key enforcement be implemented only in the new `/api/data/*` layer first, or also retrofit existing individual CRUD routes in the same change?
3. For physical database FK constraints, should we add migrations now for safe relationships, or start with application-level enforcement because several references are code-based and may need data cleanup first?

## Execution Gate

Implementation must not start until the user explicitly approves this spec.
