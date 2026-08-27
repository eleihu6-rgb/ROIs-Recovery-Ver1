# Help Page — Design Spec

**Date:** 2026-06-03  
**Scope:** gantt frontend only  
**Status:** Approved for implementation

---

## 1. Goal

Add a Help page to the gantt app so end users with no IT background can find task-based instructions, control references, and troubleshooting guidance without leaving the app. Content covers Live — Roster, Scenario, Settings & Personalization, and R'Bot. Other tabs (Dashboard, Rule, Regression, Data, System) are out of scope for this iteration.

---

## 2. Navigation Integration

### 2.1 New module

Add `'help'` to the `ActiveModule` union type in `gantt/src/stores/shell-store.ts`:

```ts
export type ActiveModule =
  | 'dashboard' | 'live' | 'scenario' | 'rule'
  | 'data' | 'system' | 'regression' | 'help'
```

### 2.2 Top nav tab

Add a Help entry to `NAV_ITEMS` in `shell-top-nav.tsx` immediately after the Regression entry:

```ts
{ id: 'help', label: 'Help', icon: HelpCircle }
```

### 2.3 Sidebar behaviour

When `activeModule === 'help'`, the app sidebar auto-collapses to `'hidden'` (width 0), giving Help the full viewport width below the top nav. This matches how the Live module auto-collapses the sidebar. Add this case to `shell-store.ts` alongside the existing Live auto-collapse logic.

### 2.4 Content area

Add `HelpView` to the keep-alive content area in `app-shell.tsx`, alongside `DashboardView`, `RosterView`, etc.

---

## 3. Page Layout (Option B)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Top Nav (40 px, unchanged)                                          │
├───────────────────────┬─────────────────────────────────────────────┤
│  Left nav (260 px)    │  Content area (flex-1, scrollable)          │
│  ─────────────────    │                                              │
│  ❓ Help Center        │  [ Welcome screen  OR  Article ]           │
│  🔍 Search topics…    │                                              │
│                        │                                              │
│  📅 Live — Roster ▾   │                                              │
│    Overview            │                                              │
│    Setting a date…     │                                              │
│    Filtering crew      │                                              │
│    …                   │                                              │
│                        │                                              │
│  🧪 Scenario ▾         │                                              │
│    …                   │                                              │
│                        │                                              │
│  ⚙ Settings ▾          │                                              │
│  🤖 R'Bot ▾            │                                              │
│  📖 Glossary           │                                              │
└───────────────────────┴─────────────────────────────────────────────┘
```

The left panel is `260px` wide, `flex-shrink: 0`, `bg-muted/30`, `border-r border-border`. The content area is `flex-1 overflow-y-auto`.

---

## 4. Left Navigation Panel

### 4.1 Structure

```
Help Center  (heading, text-sm font-semibold)
[ 🔍  Search topics… ]  (input, filters topic list client-side)

─── Categories ───

📅  Live — Roster       ▾  (expanded by default)
    Overview
    Setting a date range
    Filtering crew, pairings, and flights
    Opening and closing panes
    Saving, undoing, and redoing
    Creating a ground task
    Switching time zones
    Choosing a rule set
    Zooming in and out
    Keyboard shortcuts

🧪  Scenario            ▾  (expanded by default)
    Overview
    Browsing and searching scenarios
    Creating a new scenario
    Importing PBS material
    Setting scope filters
    Running an optimization
    Reading your KPI results
    Deleting a scenario

⚙  Settings & Personalization  ▾  (collapsed by default)
    Changing the theme
    Switching dark / light mode
    Signing out

🤖  R'Bot               ▾  (collapsed by default)
    What R'Bot can do
    Asking R'Bot a question
    Example commands

📖  Glossary            (single page, no sub-items)
```

### 4.2 Search behaviour

- Input is `text-xs`, placeholder `"Search topics…"`.
- Filtering is client-side: on every keystroke, hide any topic whose title does not contain the query string (case-insensitive). Categories with no matching children are also hidden.
- When the query is empty, restore the default expanded/collapsed states.
- No server call, no debounce needed (small data set).

### 4.3 Active state

The active topic link has `bg-primary/10 text-primary font-medium border-r-2 border-primary`. All others are `text-muted-foreground hover:text-foreground hover:bg-muted/50`.

---

## 5. Content Area — Default State (Welcome Screen)

When no topic is selected, show a welcome / landing screen (`help-home.tsx`):

- Heading: **"Help Center"**
- Sub-heading: `"What do you need help with?"`
- Category cards (2-column grid on desktop, 1-column on mobile). Each card shows the category icon, name, and topic count, and clicking it expands that category in the left nav and navigates to its Overview topic.

---

## 6. Article Format (Option C)

Every topic renders using `help-article.tsx`, which accepts a structured topic object. The visual anatomy, top to bottom:

| Zone | Content |
|---|---|
| **Breadcrumb** | `Category › Topic title` in `text-2xs text-muted-foreground` |
| **Title** | `text-xl font-bold` |
| **Step count** | small badge: `N steps` next to the title, only when steps > 0 |
| **Overview box** | `bg-green-50 border border-green-200 rounded-md p-3` — one sentence: what this feature does and when to use it |
| **"How to" steps** | Numbered, each step: bold action verb + what happens next; screenshot inline immediately below the step that needs it |
| **Callout boxes** | Tip (blue), Note (yellow), Warning (orange) — only used when the app itself surfaces an error, validation message, or important gotcha |
| **Controls reference** | Heading "Controls on this screen"; two-column table: `Name | What it does`. Every visible button, field, and toggle on the screen |
| **Troubleshooting / FAQ** | Only present when the app has real error messages or validation rules to explain |

### 6.1 Callout box colours

| Type | Background | Border-left | Text |
|---|---|---|---|
| Tip | `bg-blue-50` | `border-blue-400` | `text-blue-800` |
| Note | `bg-yellow-50` | `border-yellow-400` | `text-yellow-800` |
| Warning | `bg-orange-50` | `border-orange-500` | `text-orange-900` |

### 6.2 Screenshot conventions

- Images live in `gantt/public/help/screenshots/`.
- Referenced as `<img src="/help/screenshots/<name>.png" alt="…" />`.
- Naming pattern: `<module>-<action>-<state>.png` — e.g. `live-filter-crewbase-selected.png`, `live-filter-crewbase-result.png`.
- Captured by the Playwright script at `e2e/scripts/capture-help-screenshots.ts`.
- Each image has a visible caption below it (`text-2xs text-muted-foreground italic`).

---

## 7. Topic Inventory

### 7.1 Live — Roster (10 topics)

| Slug | Title | Key controls covered |
|---|---|---|
| `live-overview` | Live — Roster: Overview | What "Live" means; when to use it |
| `live-date-range` | Setting a date range | Date range picker, Load button, Refresh |
| `live-filter` | Filtering crew, pairings, and flights | Filter button, Filter dialog (Crew/Pairing/Flight tabs), Apply, Reset, Clear all, active-count badge |
| `live-panes` | Opening and closing panes | Roster/Pairing/Flight pane buttons, max-pane tooltip, Reset layout |
| `live-save-undo` | Saving, undoing, and redoing | Ctrl+S, Ctrl+Z, Ctrl+Y, DraftToolbar, unsaved-change indicator |
| `live-ground-task` | Creating a ground task | Create Ground Task button (SquarePlus icon) |
| `live-timezone` | Switching time zones | TimezoneSwitcher dropdown (Airline Bases / Other Airports / UTC) |
| `live-rule-set` | Choosing a rule set | RuleGroupSelector dropdown, rule checking status indicator |
| `live-zoom` | Zooming in and out | Zoom In / Zoom Out buttons, keyboard shortcuts Ctrl++ / Ctrl+- |
| `live-keyboard` | Keyboard shortcuts | Full shortcuts reference table (all groups: File / Edit / Selection / Pairing / View) |

### 7.2 Scenario (8 topics)

| Slug | Title | Key controls covered |
|---|---|---|
| `scenario-overview` | Scenario: Overview | What PO / RO / TO / Crew Bids mean; when to use each |
| `scenario-browse` | Browsing and searching scenarios | Search bar, pagination (prev/next), scenario list |
| `scenario-create` | Creating a new scenario | Create New button, scenario name input, type selector, date range, source (lead-in live checkbox) |
| `scenario-import` | Importing PBS material | Import PBS button, file upload, what formats are accepted |
| `scenario-filters` | Setting scope filters | PO flight filters; RO crew + pairing filters; TO training filters |
| `scenario-run` | Running an optimization | Submit button, Running status, progress indicator |
| `scenario-kpi` | Reading your KPI results | KPI cards grid, what each metric means, Done vs Failed states |
| `scenario-delete` | Deleting a scenario | Delete button (Trash2), confirmation dialog |

### 7.3 Settings & Personalization (3 topics)

| Slug | Title | Key controls covered |
|---|---|---|
| `settings-theme` | Changing the theme | ThemeSwitcher dropdown, 5 available themes with colour swatches |
| `settings-darkmode` | Switching dark / light mode | Dark Mode / Light Mode toggle inside ThemeSwitcher |
| `settings-signout` | Signing out | Sign Out button (top-right nav) |

### 7.4 R'Bot (3 topics)

| Slug | Title | Key controls covered |
|---|---|---|
| `rbot-overview` | What R'Bot can do | What types of commands it understands; what it can and cannot change |
| `rbot-ask` | Asking R'Bot a question | Toggle button, input field, Send, Thinking… indicator, applied chips |
| `rbot-examples` | Example commands | Curated command list (filter crew, sort roster, clear filters, etc.) |

### 7.5 Glossary (1 page)

Terms: Roster, Pairing, Flight, PO (Pairing Optimisation), RO (Roster Optimisation), TO (Training Optimisation), Scenario, Rule Group, Ground Task, Crew Base, Filiale, KPI, Draft, Gantt canvas, Pane.

---

## 8. Playwright Screenshot Capture Script

File: `e2e/scripts/capture-help-screenshots.ts`

The script:
1. Starts the gantt dev server (reuses if already running on port 5173).
2. Seeds auth via `addInitScript` (admin / 123456, schema f8).
3. Navigates to each feature in turn, performs the real interaction (open control → select real value → apply), and captures element-level screenshots.
4. Saves all PNGs to `gantt/public/help/screenshots/`.

Viewport: `1280 × 800` for all captures (consistent across all screenshots).

Screenshots per topic (representative list, full list is in the script):

| File | What it captures |
|---|---|
| `live-toolbar.png` | Full Live toolbar in normal state |
| `live-date-range-open.png` | Date range picker open with calendar visible |
| `live-filter-btn.png` | Filter button with active-count badge |
| `live-filter-dialog-crew.png` | Filter dialog open on Crew tab, Rank dropdown expanded, value selected |
| `live-filter-result.png` | Canvas after filter applied (match pill counts visible) |
| `live-panes-buttons.png` | Pane add buttons (Roster / Pairing / Flight) in toolbar |
| `live-timezone-open.png` | TimezoneSwitcher dropdown open, Airline Bases section visible |
| `live-ruleset-open.png` | RuleGroupSelector dropdown open, a group highlighted |
| `scenario-list.png` | Scenario list panel with real scenarios loaded |
| `scenario-create-dialog.png` | Create scenario dialog open with fields filled |
| `scenario-detail-draft.png` | Scenario detail panel in Draft state |
| `scenario-detail-running.png` | Scenario detail panel in Running state with progress bar |
| `scenario-detail-done.png` | Scenario detail panel in Done state with KPI cards |
| `settings-theme-open.png` | ThemeSwitcher dropdown open, all 5 themes visible |
| `rbot-panel-open.png` | R'Bot panel open, showing example hint text |
| `rbot-response.png` | R'Bot panel after a command, showing applied chip |

---

## 9. File Structure

```
gantt/src/components/help/
├── help-view.tsx             ← Layout shell (left nav + content)
├── help-nav.tsx              ← Search input + category/topic tree
├── help-home.tsx             ← Welcome screen (category cards)
├── help-article.tsx          ← Article renderer (format C)
├── help-data.ts              ← Topic registry (all slugs, titles, categories)
└── topics/
    ├── live/
    │   ├── live-overview.tsx
    │   ├── live-date-range.tsx
    │   ├── live-filter.tsx
    │   ├── live-panes.tsx
    │   ├── live-save-undo.tsx
    │   ├── live-ground-task.tsx
    │   ├── live-timezone.tsx
    │   ├── live-rule-set.tsx
    │   ├── live-zoom.tsx
    │   └── live-keyboard.tsx
    ├── scenario/
    │   ├── scenario-overview.tsx
    │   ├── scenario-browse.tsx
    │   ├── scenario-create.tsx
    │   ├── scenario-import.tsx
    │   ├── scenario-filters.tsx
    │   ├── scenario-run.tsx
    │   ├── scenario-kpi.tsx
    │   └── scenario-delete.tsx
    ├── settings/
    │   ├── settings-theme.tsx
    │   ├── settings-darkmode.tsx
    │   └── settings-signout.tsx
    ├── rbot/
    │   ├── rbot-overview.tsx
    │   ├── rbot-ask.tsx
    │   └── rbot-examples.tsx
    └── glossary.tsx

gantt/public/help/screenshots/   ← Playwright-captured PNGs

e2e/scripts/
└── capture-help-screenshots.ts  ← Screenshot automation script
```

---

## 10. What Does NOT Change

- No routing library added.
- No URL changes (consistent with the rest of the app).
- No new npm dependencies.
- `shell-store.ts` changes limited to: adding `'help'` to `ActiveModule`, adding Help to `openTabs` default list (optional), and the sidebar auto-collapse rule.
- `app-shell.tsx` change: add `<HelpView />` to the keep-alive content area.
- `shell-top-nav.tsx` change: add Help to `NAV_ITEMS`.

---

## 11. Playwright E2E Test

Per project rules (§Playwright-Required), a smoke test must accompany this feature:

File: `e2e/tests/gantt/help/help-navigation.spec.ts`

Minimum coverage:
- Help tab appears in top nav and is clickable.
- Welcome screen shows category cards.
- Clicking a category navigates to its Overview topic (article title visible).
- Search filters the topic list (type "date" → only date-range topic shown).
- Left nav shows active state on selected topic.

---

## 12. Version Bump

`FRONTEND_VERSION` in `gantt/src/version.ts` must be incremented by 1 when this feature lands.
