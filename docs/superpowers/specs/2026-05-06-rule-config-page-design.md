# Rule Config Page Design

**Date:** 2026-05-06  
**Module:** gantt · `rule` module  
**Status:** Approved (v2 — updated per review)

## Overview

Add a full-featured configuration UI for the `rule` module (already registered in `shell-top-nav.tsx` as `ActiveModule = 'rule'`, currently renders `<PlaceholderView>`). Operators can manage rule sets (法规集合) and configure per-set overrides (参数覆盖 + 告警信息模版). The editing scope is **collection-level only**: which rules are in a group, `enabled`, `param_override`, `severity_override`, `sort_order`, and `message_template`. Instance-level `rule_instance.params` are read-only in this UI.

**Architecture principle:** All management CRUD APIs live in **live-server** (port 3000, `/fpqe/live`). The rule-engine (port 3001, `/fpqe/rule`) remains a pure computation service — check + calc only, no management writes.

## Data Model

### Existing tables (no change to schema)

```
rule_template   — system algorithm templates (read-only, system-owned)
  └── rule_instance   — airline-specific instances with base params (read-only in this UI)
        └── rule_group_item  — per-group overrides: enabled, param_override, severity_override, sort_order
              └── rule_group  — named collections (GANTT/PO/RO/PBS/ALL, per filiale+division)
```

### DB Migration required

Add `message_template` column to `rule_group_item`:

```sql
-- migration: add message_template to rule_group_item
ALTER TABLE rule_group_item ADD COLUMN message_template text;
```

`message_template` is nullable. When set, the rule engine uses this template instead of the checker's built-in message string.

### Key fields

- `rule_group`: `group_code`, `name`, `description`, `usage`, `filiale`, `division`, `is_default`
- `rule_group_item`: `instance_id`, `enabled`, `severity_override`, `param_override`, `sort_order`, **`message_template`** (new)
- `rule_instance`: `instance_code`, `name`, `template_code`, `severity`, `params`, `ccar_reference`
- `rule_template`: `category`, `check_type` (CHECK / CALC / BOTH), `param_schema`

## Layout — Two-Panel Master-Detail

```
┌─────────────────────────────────────────────────────────────────┐
│  Top Nav  [Dashboard] [Live] [Scenario] [Rule ●] [Data] [System]│
├─────────────────────────────────────────────────────────────────┤
│  Tab Bar  [Dashboard ✕] [Live ✕] [Rule ✕]                       │
├──────────────┬──────────────────────────────────────────────────┤
│  Left Panel  │  Right Panel                                     │
│  264px fixed │  flex-1, min-width 0                             │
│              │                                                  │
│  [Rule Sets] │  [Group Header]                                  │
│  + New Set   │  [Rules Toolbar — search, filters, + Add Rules]  │
│              │  [Rules Table — draggable rows, scrollable]      │
│  ▸ CCAR Full │                                                  │
│    CCAR Lite │                                                  │
│    Training  │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

## Left Panel — Rule Group List

- Fixed width 264px, `bg-card`, `border-right`
- Header: "Rule Sets" title + "New Set" button (opens `NewGroupDialog`)
- Scrollable list of `RuleGroupCard` components
- Card shows: group name, Default badge (if `is_default`), Usage badge (GANTT/ALL/…), Division badge (Pilot/Cabin), rule count
- Active card: `bg-primary-bg`, `border-primary-dim`, name in `text-primary`
- Clicking a card loads group detail into the right panel

## Right Panel — Group Detail

### Group Header (non-scrolling)

- Group name (large), `group_code` in monospace, Usage + Division badges
- Description text
- Stats row: total rules · enabled count · rules with overrides · filiale
- Action buttons: **Set as Default** (if not already) · **Duplicate** · **Delete** (disabled if `is_default`)

### Rules Toolbar

- Search box: filters rules by name or instance_code
- Filter chip "Enabled only": hides disabled rules
- Filter chip "Overrides only": shows only rows with any override set (`param_override` or `message_template`)
- **"+ Add Rules" button** (right-aligned): opens `AddRulesDialog`
- Count label: "12 rules · 10 enabled"

### Rules Table

Columns: ⠿ (drag handle) | Rule | Category | Severity | Overrides | Enabled | Actions

**Rows:**
- Grouped by `sort_order` (no section separators — order is user-controlled via drag)
- Drag handle (⠿) on far left — enabled when not filtering/searching
- `CALC` rows (`check_type = CALC`) visually dimmed (opacity 0.6) — no overrides, no drag reorder (always at top of their dependency group)
- Override column: shows pill badges for active overrides:
  - `params` pill if `param_override` is non-null
  - `msg` pill if `message_template` is set
  - `sev` pill if `severity_override` is set
  - "—" if no overrides
- Enabled column: toggle switch → `PATCH rule_group_item.enabled` immediately
- Actions column: "Edit" button → opens inline editor below the row

**Row states:**
- `row-override`: subtle blue tint if any override is active
- `expanded`: darker bg when inline editor is open

### Drag-to-Reorder

- Uses `@dnd-kit/sortable` (already common in the ecosystem, MIT license)
- Drag handle visible on hover; cursor changes to grab
- On drop: optimistic UI update → `PATCH /api/rule/groups/:groupCode/items/reorder` with new ordered array of `instanceCode[]`
- Disabled while search or filter chips are active (show tooltip: "Clear filters to reorder")
- CALC rows are excluded from drag — they always sort before their checker peers

### Inline Override Editor

Appears as an additional `<tr>` immediately below the target rule row. Three sections:

#### 1. Param Override

- Instruction: "Values here override instance defaults only within this rule set. Leave blank to use instance default."
- `param-grid`: one field per key in `rule_template.param_schema`
  - Label: key name + description from schema
  - Input type: schema `type === 'integer'` → `<input type="number">`, `type === 'string'` with enum → `<select>`, otherwise text
  - Modified inputs: `border-primary` + `bg-primary-bg` highlight
  - Hint below: "Default: {instance value}"
  - Blank = no override (use instance default)
- `severity_override` select: ERROR / WARNING / INFO / (empty = instance default)

#### 2. Alert Message Template

- Text input (full width, monospace font) for `message_template`
- Placeholder: e.g. `Duty {duty_seq}: FDP {fdp_minutes}min exceeds limit {limit_minutes}min`
- **Variable Picker**: a "{ }" button opens a popover listing all available template variables for this rule, with one-click insert
- Variables are declared per `rule_template` in a new `template_vars` field (read from `rule_template.param_schema` extended section, or a dedicated column — see Template Variables section below)
- Preview row: shows rendered example message with sample values substituted
- Empty = use the checker's built-in message string

#### 3. Actions Row

- **Save** · **Cancel** · **Reset all overrides** (clears `param_override`, `severity_override`, `message_template`)

## Alert Message Template — Variable System

### Template syntax

`{variable_name}` — single curly brace, no spaces inside.

Example: `"Duty {duty_seq}: FDP {fdp_minutes}min exceeds {limit_minutes}min (crew: {crew_code}, report: {report_local})"`

### Variable source

Variables are populated from the rule checker's execution context at check time. Each `rule_template` declares its available variables. Two categories:

| Category | Examples | Source |
|----------|---------|--------|
| **Computed** | `fdp_minutes`, `limit_minutes`, `rest_minutes`, `ft_24h`, `ft_7d` | Calc result from the calculator chain |
| **Input** | `crew_code`, `pairing_code`, `duty_seq`, `flight_number`, `report_local`, `segment_count` | Check input context |

### Storage in rule_template

Add a `template_vars` JSONB column to `rule_template` (or extend `param_schema`). Each entry describes one variable:

```json
{
  "template_vars": [
    { "name": "fdp_minutes",  "label": "FDP duration (min)",    "example": 745 },
    { "name": "limit_minutes","label": "FDP limit (min)",        "example": 780 },
    { "name": "duty_seq",     "label": "Duty sequence number",   "example": 1 },
    { "name": "crew_code",    "label": "Crew member code",       "example": "CA001" },
    { "name": "report_local", "label": "Report time (local HH:MM)", "example": "06:30" }
  ]
}
```

This is populated via seed/migration alongside `rule_template` rows.

### Rule engine — template interpolation

When the rule engine resolves a `rule_group_item` with `message_template` set:

1. `ResolvedRule` gains a `messageTemplate?: string` field (loaded by `RuleLoader`)
2. `BaseChecker.fail()` / `BaseChecker.pass()` accept an optional `vars` map
3. If `rule.messageTemplate` is set, interpolate it with `vars` before returning the message
4. Interpolation is a simple `str.replace(/{(\w+)}/g, (_, k) => vars[k] ?? '')` — safe, no eval

## New Group Dialog

Modal. Fields:
- Group name (required)
- Group code (auto-generated from name, editable, unique per filiale+division)
- Usage: select GANTT / PO / RO / PBS / ALL
- Division: select P (Pilot) / C (Cabin)
- Description (optional)
- Set as default: checkbox

On save: `POST /fpqe/live/api/rule/groups` → reload group list → select new group. Empty group shows "+ Add Rules" CTA.

## Add Rules Dialog

Sheet triggered by "+ Add Rules" toolbar button. Shows a searchable, checkable list of all `rule_instance` records for the current filiale+division that are **not yet in this group**. Grouped by category. Each row: instance name, instance_code, check_type badge, severity badge. "Add selected (N)" → `POST /fpqe/live/api/rule/groups/:groupCode/items` with selected `instanceCode[]`. `sort_order` auto-assigned as max+1 per selected item.

## API Requirements

### live-server — new route group `/api/rule/`

Registered under `prefix: '/api/rule'` in live-server, proxied via nginx as `/fpqe/live/api/rule/...`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/groups` | List all groups for current filiale |
| POST | `/groups` | Create new group |
| PATCH | `/groups/:groupCode` | Update name / description / is_default |
| DELETE | `/groups/:groupCode` | Delete (reject with 409 if is_default) |
| GET | `/groups/:groupCode/items` | List resolved group items (joined with instance + template) |
| POST | `/groups/:groupCode/items` | Add instances to group (array of instanceCode) |
| PATCH | `/groups/:groupCode/items/:instanceCode` | Update enabled / param_override / severity_override / message_template |
| DELETE | `/groups/:groupCode/items/:instanceCode` | Remove from group |
| PATCH | `/groups/:groupCode/items/reorder` | Update sort_order for all items (body: ordered instanceCode[]) |
| GET | `/instances` | List all available instances for current filiale (for AddRulesDialog) |

After any write, live-server must call `POST /fpqe/rule/admin/cache/invalidate` (or equivalent) on the rule-engine to flush its in-memory `RuleLoader` cache for the affected `groupCode`.

### rule-engine — minimal admin endpoint

Add one endpoint to allow live-server to trigger cache invalidation:

```
POST /admin/cache/invalidate   body: { groupCode?: string }
```

This is the only new endpoint in rule-engine. All data management stays in live-server.

## Frontend File Structure

```
gantt/src/
├── components/rule/
│   ├── rule-view.tsx                # Top-level module view (replaces PlaceholderView)
│   ├── rule-group-list.tsx          # Left panel — group cards + New Set button
│   ├── rule-group-card.tsx          # Individual group card
│   ├── rule-group-header.tsx        # Right panel header section
│   ├── rule-group-rules.tsx         # Rules toolbar + sortable table
│   ├── rule-group-row.tsx           # Single rule row + drag handle
│   ├── override-editor.tsx          # Inline param + message template editor (the expanded tr)
│   ├── template-var-picker.tsx      # Popover with variable list for message template
│   ├── new-group-dialog.tsx         # Create new group modal
│   └── add-rules-dialog.tsx         # Add instances to group sheet
├── services/
│   └── rule-config-api.ts           # HTTP calls to /fpqe/live/api/rule/...
└── stores/
    └── rule-config-store.ts         # Zustand: selectedGroupCode, groups[], groupItems[]
```

## State Management

`rule-config-store.ts` (Zustand, not persisted to localStorage):

```typescript
interface RuleConfigStore {
  groups: RuleGroup[]
  selectedGroupCode: string | null
  groupItems: ResolvedGroupItem[]
  loading: boolean
  itemsLoading: boolean

  fetchGroups: () => Promise<void>
  selectGroup: (groupCode: string) => Promise<void>
  updateItem: (instanceCode: string, patch: ItemPatch) => Promise<void>
  reorderItems: (orderedCodes: string[]) => Promise<void>
  createGroup: (data: NewGroupData) => Promise<void>
  deleteGroup: (groupCode: string) => Promise<void>
  addItems: (instanceCodes: string[]) => Promise<void>
  removeItem: (instanceCode: string) => Promise<void>
}

interface ItemPatch {
  enabled?: boolean
  paramOverride?: Record<string, unknown> | null
  severityOverride?: string | null
  messageTemplate?: string | null
}
```

## Visual Design

Follows the existing dark theme. Category badges, severity badges, toggle switches, and the inline editor match the mockup at `docs/modules/gantt/rule-config-mockup.html`. CALC rows dimmed at 0.6 opacity. Drag handle (⠿) visible on row hover only.

## Out of Scope

- Editing `rule_instance.params` (base params) — read-only in this UI
- Creating new `rule_instance` records — admin-only via seed scripts
- PO/RO/PBS group management — deferred
- Rule group version history — deferred
