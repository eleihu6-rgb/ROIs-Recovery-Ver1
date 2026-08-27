// gantt/src/components/help/help-data.ts
export interface HelpTopic {
  slug: string
  /** Stable ShellSidebar sub-menu id that this topic documents. */
  sourceMenuId?: string
  title: string
  categorySlug: string
  parentSlug?: string
  depth?: number
  stepCount?: number
  overview: string
  /**
   * Mark a brand-new topic so the left nav shows a red "NEW" badge next to it.
   * Set this when documenting a feature that just shipped, and REMOVE it in the
   * next release once the feature is no longer new (see online-help-writing skill).
   */
  isNew?: boolean
}

export interface HelpCategory {
  slug: string
  title: string
  lucideIcon: string
  defaultExpanded: boolean
  topics: HelpTopic[]
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    slug: 'dashboard',
    title: 'Dashboard',
    lucideIcon: 'LayoutDashboard',
    defaultExpanded: true,
    topics: [
      {
        slug: 'dashboard-overview',
        title: 'Dashboard overview',
        categorySlug: 'dashboard',
        overview: 'The Dashboard tab summarizes the current operation with live stat cards, crew rank distribution, flight trend charts, and a Refresh action.',
      },
    ],
  },
  {
    slug: 'live',
    title: 'Live',
    lucideIcon: 'CalendarDays',
    defaultExpanded: true,
    topics: [
      {
        slug: 'live-overview',
        title: 'Live overview',
        categorySlug: 'live',
        overview: "The Live tab shows your airline's current operational schedule — the roster as it stands right now, not a planning scenario.",
      },
      {
        slug: 'live-date-range',
        title: 'Setting a date range',
        categorySlug: 'live',
        stepCount: 4,
        overview: 'The roster-period selector at the left of the Live toolbar sets which days of crew rosters and flights appear on the scheduling canvas. Pick one or more roster periods — the window becomes the merged selection with seven days of context on each side. Selecting a period only updates the selection and date range; the toolbar reminds you to apply filters, and the data loads when you press Apply Filters. Up to six consecutive periods can be selected, and older (historical) periods load incrementally. Refresh reloads the same window with the latest data.',
      },
      {
        slug: 'live-filter',
        title: 'Filtering crew, pairings, and flights',
        categorySlug: 'live',
        stepCount: 5,
        overview: 'Filters let you narrow down what the canvas shows — by crew base, rank, pairing label, Pairing ID, flight number, and more — so you only see the data relevant to your task.',
      },
      {
        slug: 'live-panes',
        title: 'Working with panes',
        categorySlug: 'live',
        stepCount: 6,
        overview: 'Panes are the panels on the Gantt canvas. Open separate Roster, Pairing, and Flight panels, sort them, jump between related crew and pairings, and read the Open/Partial pairing credit badge — up to 2 Roster, 2 Pairing, and 1 Flight pane (4 in total).',
      },
      {
        slug: 'live-pairing-label',
        title: 'Pairing label',
        categorySlug: 'live',
        stepCount: 4,
        overview: 'A pairing label is the human-readable identifier your airline assigns to a pairing. It appears in the Pairing pane, the Pairing Info dialog title, the status bar (ground tasks), and the filter Label field.',
      },
      {
        slug: 'live-flight-navi',
        title: 'Navigating flights with Flight Navi',
        categorySlug: 'live',
        stepCount: 4,
        overview: 'Flight Navi is a table of every flight in the date range, with filters and one-click navigation from a flight to its pairings, its crew, or its detail card.',
      },
      {
        slug: 'live-edit',
        title: 'Editing assignments',
        categorySlug: 'live',
        stepCount: 6,
        overview: 'Select, reassign, edit, swap, and delete crew duties on the canvas, work on pairings, and pin rows. Every change is a draft until you save.',
      },
      {
        slug: 'live-context-menu',
        title: 'Right-click context menu',
        categorySlug: 'live',
        parentSlug: 'live-edit',
        depth: 1,
        stepCount: 4,
        overview: 'Right-clicking in the Gantt opens a context menu of actions for the task or crew under the cursor — edit, swap, view pairing or flight detail, locate, memo, schedule, delete, and pin. Covers the Live and Scenario roster panes.',
      },
      {
        slug: 'schedule-details',
        title: 'Schedule Details',
        categorySlug: 'live',
        parentSlug: 'live-context-menu',
        depth: 2,
        stepCount: 4,
        overview: 'Schedule Details lists every assignment a crew member has in one roster period — Type, Start, End, Credit, Label, Pairing, and Source, with the duties of each pairing grouped into one row (credit summed, earliest start to latest end). It has a Crew search, a Live RP Date stepper, and a display-timezone / UTC toggle that defaults to the crew’s base timezone. Opened from the roster right-click context menu (Live + Scenario).',
      },
      {
        slug: 'daily-task-calendar',
        title: 'Daily Task Calendar',
        categorySlug: 'live',
        parentSlug: 'live-context-menu',
        depth: 2,
        stepCount: 5,
        overview: 'Daily Task Calendar lays out a crew member’s month as a week-at-a-glance grid — Mon to Sun columns, colour-coded task chips per day (in the crew’s base timezone by default), and a Statistics panel (RpCred, Flight, Reserve, Ground, Day Off, Open, Tasks, Max Work, Max Off/Open, Max Reserve). Opened from the roster right-click context menu (Live + Scenario).',
      },
      {
        slug: 'manday-info',
        title: 'Manday Info',
        categorySlug: 'live',
        parentSlug: 'live-context-menu',
        depth: 2,
        stepCount: 3,
        overview: 'Manday Info is a quick daily Credit + Block Hours (BH) + Duty Period (DP) table for one crew member — one row per calendar day of the viewport’s leftmost month, with the crew’s Base shown in the header. Opened from the roster row-background context menu (Live + Scenario).',
      },
      {
        slug: 'crew-info',
        title: 'Crew Info',
        categorySlug: 'live',
        parentSlug: 'live-context-menu',
        depth: 2,
        stepCount: 3,
        overview: 'Crew Info is a crew member’s personnel file — a profile summary grid plus Crew Base, Rank, Fleet, Qualification, Certification, and Team record tables, most recent first. Opened from the roster row-background context menu (Live + Scenario).',
      },
      {
        slug: 'live-crew-memo',
        title: 'Adding a crew memo',
        categorySlug: 'live',
        stepCount: 4,
        overview: "Add a free-text note to a crew member's roster for a date range. Memos show as a yellow sticky-note icon on the canvas, so operational notes stay visible directly on the roster.",
      },
      {
        slug: 'live-res-pairing',
        title: 'Creating reserve pairings (RES Planner)',
        categorySlug: 'live',
        stepCount: 7,
        overview: 'The RES Pairing Planner is a Live-only tool for generating and managing reserve pairings (PRAM / PRPM for pilots, CRAM / CRPM for cabin crew). Define how many reserve slots you need per day, then use the summary, conflict policy, and Generate controls at the bottom of the Define page before managing existing ones — all without leaving the Live screen.',
      },
      {
        slug: 'live-save-undo',
        title: 'Saving, undoing, and redoing',
        categorySlug: 'live',
        stepCount: 3,
        overview: 'Any edits you make on the canvas are held as a draft until you save. You can undo mistakes before saving.',
      },
      {
        slug: 'live-ground-task',
        title: 'Creating a ground task',
        categorySlug: 'live',
        stepCount: 7,
        overview: 'A ground task is a non-flight assignment with Dep Arp and Arv Arp locations — such as training, standby, or administrative duty — that you assign to one or more crew members.',
      },
      {
        slug: 'live-source-column',
        title: 'Understanding the Source column',
        categorySlug: 'live',
        stepCount: 4,
        overview: 'Every roster and pairing task carries a Source that records where it came from: IMP (imported), MA (manual), PA (pre-assignment seed), CR (optimizer). Shown in the bulk-delete dialogs.',
      },
      {
        slug: 'live-timezone',
        title: 'Switching time zones',
        categorySlug: 'live',
        stepCount: 2,
        overview: "You can display all times on the canvas in any airport's local time instead of UTC.",
      },
      {
        slug: 'live-rule-set',
        title: 'Choosing a rule set',
        categorySlug: 'live',
        stepCount: 2,
        overview: 'A rule set is the collection of compliance rules used to check crew assignments. You pick one rule set at a time.',
      },
      {
        slug: 'live-zoom',
        title: 'Zooming in and out',
        categorySlug: 'live',
        stepCount: 3,
        overview: 'Zoom controls how many days fit across the canvas. Zoom in for hourly detail; zoom out to see weeks at a glance.',
      },
      {
        slug: 'live-keyboard',
        title: 'Keyboard shortcuts',
        categorySlug: 'live',
        overview: 'Quick reference for all keyboard shortcuts available on the Live — Roster screen.',
      },
    ],
  },
  {
    slug: 'scenario',
    title: 'Scenario',
    lucideIcon: 'FlaskConical',
    defaultExpanded: true,
    topics: [
      {
        slug: 'scenario-overview',
        title: 'Scenario overview',
        categorySlug: 'scenario',
        overview: 'Scenarios are draft plans you build and optimize before committing anything to the live schedule.',
      },
      {
        slug: 'scenario-browse',
        title: 'Browsing and searching scenarios',
        categorySlug: 'scenario',
        stepCount: 2,
        overview: 'The left panel lists all your scenarios. Use search and the type filters to find the one you need.',
      },
      {
        slug: 'scenario-create',
        title: 'Creating a new scenario',
        categorySlug: 'scenario',
        stepCount: 6,
        overview: 'You create a scenario to plan a new optimization run. Give it a name, choose the type, and set its date range.',
      },
      {
        slug: 'scenario-duplicate',
        title: 'Duplicating a scenario',
        categorySlug: 'scenario',
        stepCount: 3,
        overview: 'Duplicate a scenario to create a Draft copy with all its configuration — without re-entering filters from scratch.',
      },
      {
        slug: 'scenario-import',
        title: 'Importing PBS material',
        categorySlug: 'scenario',
        stepCount: 4,
        overview: 'Seed a scenario from an external PBS export — pick the roster period and the materials (Crew, Roster, RosterGround, Pairing, Flight) to import, watch the per-material progress, then review the Add / Update / Delete / OK / Fail / Skip counts.',
      },
      {
        slug: 'scenario-filters',
        title: 'Setting scope filters',
        categorySlug: 'scenario',
        stepCount: 2,
        overview: 'Scope filters tell the optimization engine which crew, pairings, or flights to include (PO / RO / TO) — crews by bases, ranks, fleets, seniority and birthday; pairings by bases, ranks, fleets, types and duration. Narrower scope means faster results.',
      },
      {
        slug: 'scenario-run',
        title: 'Running an optimization',
        categorySlug: 'scenario',
        stepCount: 9,
        overview: 'Before running, the system checks that required fields are set (dates, rule set, pairing scenario). The pre-run check dialog lists blockers or warnings, and unsaved changes must be saved before the engine starts.',
      },
      {
        slug: 'scenario-kpi',
        title: 'Reading your optimization results',
        categorySlug: 'scenario',
        stepCount: 6,
        overview: 'When an optimization finishes, the result panel shows tabs for KPI, Credit Hours, Uncovered, Distribution, Versions, and Notes — Notes records questions and replies (available even in Draft), the rest summarize the optimization output.',
      },
      {
        slug: 'scenario-quality',
        title: 'Checking roster quality (Quality Analyzer)',
        categorySlug: 'scenario',
        stepCount: 5,
        overview: "The Quality Analyzer is a Scenario-only tool that scores each crew member's optimized roster — the credit they earned plus quality findings such as standalone reserve days, runs of more than six working days, a roster that is all days off, or too many working days in the scenario period.",
      },
      {
        slug: 'scenario-publish',
        title: 'Importing a roster to Live',
        categorySlug: 'scenario',
        stepCount: 6,
        overview: 'Importing writes optimized crew assignments back to the Live roster. You select exactly which assignments to import — already-imported rows are shown greyed out.',
      },
      {
        slug: 'scenario-delete',
        title: 'Deleting a scenario',
        categorySlug: 'scenario',
        stepCount: 2,
        overview: 'Delete a scenario when you no longer need it. This cannot be undone.',
      },
    ],
  },
  {
    slug: 'data',
    title: 'Data',
    lucideIcon: 'Database',
    defaultExpanded: false,
    topics: [
      {
        slug: 'data-overview',
        title: 'Data overview',
        categorySlug: 'data',
        overview: 'The Data tab contains master-data maintenance pages for operational reference data such as bases, ranks, fleets, aircraft, locations, assignments, qualifications, compositions, roster periods, configuration dictionaries, holidays, and crew records.',
      },
      { slug: 'data-org-base', sourceMenuId: 'basic.org-base', title: 'Org & Base', categorySlug: 'data', parentSlug: 'data-overview', depth: 1, overview: 'Maintain Base, Department, and Division reference records used to organise crew and operational data.' },
      { slug: 'data-rank', sourceMenuId: 'basic.rank', title: 'Rank', categorySlug: 'data', parentSlug: 'data-overview', depth: 1, overview: 'Maintain rank codes, division scope, display order, and descriptions.' },
      { slug: 'data-fleet-aircraft', sourceMenuId: 'basic.fleet-aircraft', title: 'Fleet & Aircraft', categorySlug: 'data', parentSlug: 'data-overview', depth: 1, overview: 'Maintain fleet definitions and individual aircraft registrations.' },
      { slug: 'data-location-route', sourceMenuId: 'basic.location-route', title: 'Location & Route', categorySlug: 'data', parentSlug: 'data-overview', depth: 1, overview: 'Maintain Airport reference data. Route and Hotel are not yet exposed on this page.' },
      { slug: 'data-assignment', sourceMenuId: 'basic.assignment', title: 'Assignment', categorySlug: 'data', parentSlug: 'data-overview', depth: 1, overview: 'Maintain assignment codes, assignment groups, and their resolved group map.' },
      { slug: 'data-qualification', sourceMenuId: 'basic.qualification', title: 'Qualification', categorySlug: 'data', parentSlug: 'data-overview', depth: 1, overview: 'Maintain qualification codes, descriptions, divisions, and groups.' },
      { slug: 'data-composition', sourceMenuId: 'basic.composition', title: 'Composition', categorySlug: 'data', parentSlug: 'data-overview', depth: 1, overview: 'Maintain composition, composition-rank, and composition-load records.' },
      { slug: 'data-roster-period', sourceMenuId: 'basic.roster-period', title: 'Roster Period', categorySlug: 'data', parentSlug: 'data-overview', depth: 1, overview: 'Maintain roster-period dates, publication milestones, payment dates, and lock status.' },
      { slug: 'data-config-dictionary', sourceMenuId: 'basic.config-dictionary', title: 'Config Dictionary', categorySlug: 'data', parentSlug: 'data-overview', depth: 1, overview: 'Filter and maintain dictionary values by category, code, name, and code value.' },
      { slug: 'data-query', sourceMenuId: 'basic.query', title: 'Query', categorySlug: 'data', parentSlug: 'data-overview', depth: 1, overview: 'Review the Query records currently exposed by the Data page.' },
      { slug: 'data-holiday', sourceMenuId: 'basic.holiday', title: 'Holiday Calendar', categorySlug: 'data', parentSlug: 'data-overview', depth: 1, overview: 'Filter and maintain city holiday dates, types, and authorities.' },
      { slug: 'data-crew-master', sourceMenuId: 'crew.master', title: 'Crew Master', categorySlug: 'data', parentSlug: 'data-overview', depth: 1, overview: 'Review crew basic details and their related effective-dated operational records.' },
      { slug: 'data-crew-workload', sourceMenuId: 'crew.workload-summary', title: 'Crew Workload Summary (Partial)', categorySlug: 'data', parentSlug: 'data-overview', depth: 1, overview: 'Reserved for a crew workload summary; the current page is not yet implemented.' },
    ],
  },
  {
    slug: 'legality-tab',
    title: 'Legality',
    lucideIcon: 'Scale',
    defaultExpanded: false,
    topics: [
      {
        slug: 'legality-tab-overview',
        title: 'Legality overview',
        categorySlug: 'legality-tab',
        overview: 'The Legality tab is the operational workspace for reviewing rule sets, rule templates, rule instances, and parameter changes before live or scenario legality checks use them.',
      },
      { slug: 'legality-tab-rule-sets', sourceMenuId: 'rule-sets', title: 'Rule Sets', categorySlug: 'legality-tab', parentSlug: 'legality-tab-overview', depth: 1, overview: 'Review and administer rule sets, their scope, member rules, and parameters.' },
      { slug: 'legality-tab-rule-templates', sourceMenuId: 'rule-instances', title: 'Rule Templates', categorySlug: 'legality-tab', parentSlug: 'legality-tab-overview', depth: 1, overview: 'Browse system rule templates and rule instances.' },
      { slug: 'legality-tab-composition', title: 'Composition (Partial)', categorySlug: 'legality-tab', parentSlug: 'legality-tab-overview', depth: 1, overview: 'A valid Legality route that is not currently exposed in the sidebar.' },
      { slug: 'legality-tab-comp-load', title: 'Comp Load (Partial)', categorySlug: 'legality-tab', parentSlug: 'legality-tab-overview', depth: 1, overview: 'A valid Legality route that is not currently exposed in the sidebar.' },
    ],
  },
  {
    slug: 'system',
    title: 'System',
    lucideIcon: 'Settings2',
    defaultExpanded: false,
    topics: [
      {
        slug: 'system-overview',
        title: 'System overview',
        categorySlug: 'system',
        overview: 'The System tab groups operational tools and administration pages, including scheduler status, queue tasks, monitoring dashboards, data quality, user management, profile management, menu management, PBS user management, and department management.',
      },
      { slug: 'system-scheduler', sourceMenuId: 'scheduler', title: 'Scheduler', categorySlug: 'system', parentSlug: 'system-overview', depth: 1, overview: 'Monitor scheduled jobs, controls, and execution history by service.' },
      { slug: 'system-users', sourceMenuId: 'user-mgmt', title: 'Users', categorySlug: 'system', parentSlug: 'system-overview', depth: 1, overview: 'Administer product user records, profile/role bindings, department membership, and access settings.' },
      { slug: 'system-roles', sourceMenuId: 'profile-mgmt', title: 'Roles', categorySlug: 'system', parentSlug: 'system-overview', depth: 1, overview: 'Administer roles, the menus and controls assigned to each role, and the data scope.' },
      { slug: 'system-menus', sourceMenuId: 'menu-mgmt', title: 'Menus', categorySlug: 'system', parentSlug: 'system-overview', depth: 1, overview: 'Review the menu tree and manage menu-level permissions.' },
      { slug: 'system-pbs-users', sourceMenuId: 'pbs-user-mgmt', title: 'PBS Users', categorySlug: 'system', parentSlug: 'system-overview', depth: 1, overview: 'Administer PBS crew accounts, including enable/disable state, password reset, and detailed account fields.' },
      { slug: 'system-departments', sourceMenuId: 'dept-mgmt', title: 'Departments', categorySlug: 'system', parentSlug: 'system-overview', depth: 1, overview: 'Administer department records used by the organisation structure.' },
      { slug: 'system-queue-tasks', title: 'Queue Tasks (Partial)', categorySlug: 'system', parentSlug: 'system-overview', depth: 1, overview: 'Supported operational queue dashboard that is not currently exposed in the sidebar.' },
      { slug: 'system-grafana', title: 'Grafana (Partial)', categorySlug: 'system', parentSlug: 'system-overview', depth: 1, overview: 'Supported operational dashboard that is not currently exposed in the sidebar.' },
      { slug: 'system-prometheus', title: 'Prometheus (Partial)', categorySlug: 'system', parentSlug: 'system-overview', depth: 1, overview: 'Supported metrics tool that is not currently exposed in the sidebar.' },
      { slug: 'system-windmill', title: 'Windmill (Partial)', categorySlug: 'system', parentSlug: 'system-overview', depth: 1, overview: 'Supported automation tool that is not currently exposed in the sidebar.' },
      { slug: 'system-data-quality', title: 'Data Quality (Partial)', categorySlug: 'system', parentSlug: 'system-overview', depth: 1, overview: 'Supported data-quality tool that is not currently exposed in the sidebar.' },
    ],
  },
  {
    slug: 'pbs',
    title: 'PBS',
    lucideIcon: 'CalendarCog',
    defaultExpanded: false,
    topics: [
      {
        slug: 'pbs-overview',
        title: 'PBS overview',
        categorySlug: 'pbs',
        overview: 'The PBS tab opens planning and bidding administration tools such as roster periods, bid definitions, business-time settings, admin tools, and the simulated crew portal entry point.',
      },
      { slug: 'pbs-period', sourceMenuId: 'period', title: 'Period', categorySlug: 'pbs', parentSlug: 'pbs-overview', depth: 1, overview: 'Maintain PBS periods, their bid timelines, and annual draft-period generation.' },
      { slug: 'pbs-bid-definitions', sourceMenuId: 'bid-definitions', title: 'Bid Definitions', categorySlug: 'pbs', parentSlug: 'pbs-overview', depth: 1, overview: 'Administer company definitions used by PBS bids and exports.' },
      { slug: 'pbs-business-time', sourceMenuId: 'business-time', title: 'Business Time', categorySlug: 'pbs', parentSlug: 'pbs-overview', depth: 1, overview: 'Administer simulated PBS Business Time and rolling-time mode.' },
      { slug: 'pbs-admin-tools', sourceMenuId: 'admin-tools', title: 'Admin Tools', categorySlug: 'pbs', parentSlug: 'pbs-overview', depth: 1, overview: 'Run algorithm package, crew-bid import, roster-import, and run-history administration.' },
      { slug: 'pbs-simulated-crew-portal', sourceMenuId: 'simulated-crew-portal', title: 'Simulated Crew Portal', categorySlug: 'pbs', parentSlug: 'pbs-overview', depth: 1, overview: 'Administer and audit simulated crew Portal logins.' },
    ],
  },
  {
    slug: 'release',
    title: 'Release',
    lucideIcon: 'Megaphone',
    defaultExpanded: false,
    topics: [
      {
        slug: 'release-overview',
        title: 'Release overview',
        categorySlug: 'release',
        overview: 'The Release tab lists user-facing release notes. Open a release to review what changed across Live, Scenario, Data, Legality, System, PBS, and global navigation.',
      },
    ],
  },
  {
    slug: 'settings',
    title: 'Settings & Personalization',
    lucideIcon: 'Settings2',
    defaultExpanded: false,
    topics: [
      {
        slug: 'settings-theme',
        title: 'Changing the theme',
        categorySlug: 'settings',
        stepCount: 2,
        overview: "You can switch the app's colour scheme to match your preference or lighting conditions.",
      },
      {
        slug: 'settings-darkmode',
        title: 'Switching dark / light mode',
        categorySlug: 'settings',
        stepCount: 2,
        overview: 'Dark mode reduces eye strain in low-light environments. You can toggle it independently of the colour theme.',
      },
      {
        slug: 'settings-signout',
        title: 'Signing out',
        categorySlug: 'settings',
        stepCount: 1,
        overview: 'Sign out when you are done to keep your session secure, especially on shared computers.',
      },
    ],
  },
  {
    slug: 'legality',
    title: 'Legality Rules',
    lucideIcon: 'ShieldCheck',
    defaultExpanded: false,
    topics: [
      {
        slug: 'legality-overview',
        title: 'Overview',
        categorySlug: 'legality',
        overview: 'The Legality tab checks crew assignments against compliance rule sets. This section documents the F8 Full Ruleset (workset 433) — all 15 Flight-Deck rules, their origin in the Flair PBS BRD, and their parameters.',
      },
      {
        slug: 'legality-rule-sets',
        title: 'Managing Rule Sets',
        categorySlug: 'legality',
        stepCount: 6,
        overview: 'The Rule Sets view lists every compliance rule set as a card — id, name, last editor, type (LIVE / PBS / RO) and division (P / C) badges, Enabled / Disabled, and rule count. Admins create, edit, copy, delete, and add rules to sets, and an amber warning flags division + type combinations with no enabled set.',
      },
      {
        slug: 'legality-rule-templates',
        title: 'Rule Templates & Instances',
        categorySlug: 'legality',
        stepCount: 6,
        overview: 'The master rule catalog: system templates (instance-001) and the copies rule sets use, browsable as a reference › category › function › instance tree or a table, with search and the admin actions Add to set, Copy to new instance, and Delete (templates and rules used by a Rule Set cannot be deleted).',
      },
      {
        slug: 'legality-edit-params',
        title: 'Editing rule parameters (admin)',
        categorySlug: 'legality',
        stepCount: 5,
        overview: "Admins can edit a rule's parameter table directly on the Legality tab — change limits, add/copy/delete rows, reorder them — with an undo-able change log, then Save All. Saving flags the affected rosters for a legality recheck. Non-admins see the same table read-only.",
      },
      {
        slug: 'legality-1001',
        title: '1001 — Assignment Overlap',
        categorySlug: 'legality',
        overview: 'Flags when two of a crew’s assignments overlap in time — the “before” duty and the “after” duty both demand the crew at once. Each parameter row defines a prohibited Before → After combination (Table rule, F8 Full Ruleset workset 433).',
      },
      {
        slug: 'legality-2014',
        title: '2014 — Local Night Definition',
        categorySlug: 'legality',
        overview: "Defines the protected overnight window that counts as a local night's rest — the building block other day-off and WOCL rules read. Raises no violations.",
      },
      {
        slug: 'legality-2015',
        title: '2015 — DO Start Time Definition',
        categorySlug: 'legality',
        overview: 'Defines the local home-base clock used by Min-GDO rules to decide when a duty-ending day starts counting. Raises no violations.',
      },
      {
        slug: 'legality-7272',
        title: '7272 — Calculate DP of the Reserves',
        categorySlug: 'legality',
        overview: 'Computes the duty-period length to charge for reserve / standby blocks so the cumulative duty-hour rule can count them. Raises no violations.',
      },
      {
        slug: 'legality-7500',
        title: '7500 — Basic definition of Acc State',
        categorySlug: 'legality',
        overview: 'Computes each crew member’s acclimatized reference time zone — the body-clock location other rules use to read local time. Raises no violations.',
      },
      {
        slug: 'legality-7501',
        title: '7501 — Single Day Free from Duty in Rolling Hours',
        categorySlug: 'legality',
        overview: 'Guarantees a minimum number of single days free from duty inside rolling-hour windows.',
      },
      {
        slug: 'legality-7502',
        title: '7502 — The Calculation of Credit Hours',
        categorySlug: 'legality',
        overview: 'Computes the credit hours earned for each assignment — the value the monthly credit-hour band reconciles against. Raises no violations.',
      },
      {
        slug: 'legality-7503',
        title: '7503 — Limits of Consecutive WOCLs',
        categorySlug: 'legality',
        overview: 'Caps how many consecutive duties may touch the Window of Circadian Low (02:00–05:59).',
      },
      {
        slug: 'legality-7504',
        title: '7504 — Spacing Rule - WOCL',
        categorySlug: 'legality',
        overview: 'Enforces a minimum spacing between two WOCL flight duties.',
      },
      {
        slug: 'legality-7505',
        title: '7505 — Min # GDOs in a RP',
        categorySlug: 'legality',
        overview: 'Guarantees a minimum number of Guaranteed Days Off in a roster period, sliding with the amount of vacation taken.',
      },
      {
        slug: 'legality-7506',
        title: '7506 — One Checkin Per Day',
        categorySlug: 'legality',
        overview: 'A crew member may report for a flight duty at most once per calendar day.',
      },
      {
        slug: 'legality-7507',
        title: '7507 — Min # GDOs (fly/reserve filters)',
        categorySlug: 'legality',
        overview: 'Same Min-GDO check as 7505 with NUM FLY DAY / NUM RESERVES band filters.',
      },
      {
        slug: 'legality-7508',
        title: '7508 — Single Day Free from Duty in Calendar Days',
        categorySlug: 'legality',
        overview: 'Guarantees single days free from duty using calendar-day boundaries, Duty Report / Duty Release semantics, and Min-GDO windows.',
      },
      {
        slug: 'legality-8002-flight-time',
        title: '8002 — Maximum Flight Time',
        categorySlug: 'legality',
        overview: 'Caps cumulative block (flight) hours over rolling periods, plus a standalone monthly credit-hour utilisation band.',
      },
      {
        slug: 'legality-8002-hours',
        title: '8002 — Maximum Hours of Work',
        categorySlug: 'legality',
        overview: 'Caps cumulative duty hours (hours of work) over rolling periods.',
      },
      {
        slug: 'legality-8004',
        title: '8004 — Basic Competency-F8',
        categorySlug: 'legality',
        overview: 'Checks each crew member is qualified for the base, rank and fleet of every flight assignment.',
      },
      {
        slug: 'legality-8030',
        title: '8030 — Age Restriction',
        categorySlug: 'legality',
        overview: 'Limits how many crew over an age threshold may be on the same flight.',
      },
      {
        slug: 'legality-8056',
        title: '8056 — Roster Spacing',
        categorySlug: 'legality',
        overview: 'A general minimum-spacing rule between two activities matching configured attributes; 7504 is its WOCL specialization.',
      },
    ],
  },
  {
    slug: 'glossary',
    title: 'Glossary',
    lucideIcon: 'BookOpen',
    defaultExpanded: false,
    topics: [
      {
        slug: 'glossary',
        title: 'Glossary',
        categorySlug: 'glossary',
        overview: 'Plain-language definitions for terms you will see throughout the app.',
      },
    ],
  },
]

export const ALL_TOPICS: HelpTopic[] = HELP_CATEGORIES.flatMap((c) => c.topics)

export function findTopic(slug: string): HelpTopic | undefined {
  return ALL_TOPICS.find((t) => t.slug === slug)
}

export function findCategory(slug: string): HelpCategory | undefined {
  return HELP_CATEGORIES.find((c) => c.slug === slug)
}
