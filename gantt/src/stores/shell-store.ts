import { create } from 'zustand'
import { useAuthStore } from '@/stores/auth-store'
import { useMenuStore } from '@/stores/menu-store'
import { MODULE_MENU } from '@/config/menu-registry'

// Known module names (extend for new static modules); dynamic tabs use 'scenario-gantt:{id}' pattern
export type KnownModule = 'dashboard' | 'live' | 'scenario' | 'data' | 'legality' | 'system' | 'regression' | 'pbs' | 'dev' | 'help' | 'release'
export type ActiveModule = string
export type ActiveLiveItem = 'roster' | 'pairing' | 'flight'
export type ActiveScenarioItem = 'all' | 'po' | 'ro' | 'crew-bids'
export type ActiveLegalityItem = 'rule-sets' | 'rule-instances' | 'composition' | 'comp-load'
export type ActiveSystemItem = 'queue-tasks' | 'scheduler' | 'grafana' | 'prometheus' | 'windmill' | 'data-quality' | 'user-mgmt' | 'profile-mgmt' | 'menu-mgmt' | 'pbs-user-mgmt' | 'dept-mgmt'
export type ActivePbsItem = 'period' | 'bid-definitions' | 'business-time' | 'admin-tools' | 'simulated-crew-portal'
export type SidebarState = 'expanded' | 'collapsed' | 'hidden'
export type FilterDialogTab = 'crew' | 'pairing' | 'flight'

/**
 * Modules whose every view hits an admin-gated endpoint on mount. Non-admin
 * users must never see these in the top nav, sidebar, or content area —
 * restoring a stale localStorage value that points here must fall back to
 * `dashboard` so the user does not see a 403 toast.
 */
export const ADMIN_ONLY_MODULES: ActiveModule[] = ['pbs', 'system']

interface ShellStore {
  activeModule: ActiveModule
  activeLiveItem: ActiveLiveItem
  activeScenarioItem: ActiveScenarioItem
  activeLegalityItem: ActiveLegalityItem
  activeSystemItem: ActiveSystemItem
  activePbsItem: ActivePbsItem
  /** Ordered list of open tabs — only these views are mounted in the DOM */
  openTabs: ActiveModule[]
  /** Persisted display labels for scenario-gantt tabs keyed by module string (e.g. 'scenario-gantt:6') */
  scenarioTabLabels: Record<string, string>
  /** Persisted scenario types for scenario-gantt tabs (e.g. 'scenario-gantt:6' → 'PO') */
  scenarioTabTypes: Record<string, string>
  /** In-memory refresh nonce for scenario-gantt tabs; incrementing it forces a reload on focus/open. */
  scenarioTabRefreshTokens: Record<string, number>
  topNavVisible: boolean
  sidebarState: SidebarState
  /** true 表示用户手动操作过 sidebar，阻止模块切换时自动覆盖 */
  sidebarUserOverride: boolean
  /** Per top-level module sidebar state; scenario-gantt:* is normalized to scenario. */
  sidebarStatesByModule: Record<string, SidebarState>
  /** Global Filter dialog visibility — opened from the toolbar funnel, the Live empty state or a pane funnel. */
  filterDialogOpen: boolean
  /** Tab the dialog should open on (pane funnel entry) — null keeps the last active tab. */
  filterDialogTab: FilterDialogTab | null

  setModule: (module: ActiveModule) => void
  setLiveItem: (item: ActiveLiveItem) => void
  setScenarioItem: (item: ActiveScenarioItem) => void
  setLegalityItem: (item: ActiveLegalityItem) => void
  setSystemItem: (item: ActiveSystemItem) => void
  setPbsItem: (item: ActivePbsItem) => void
  /** Close a tab and release its view from the DOM */
  closeTab: (module: ActiveModule) => void
  /** Close a tab, then force a caller-owned fallback view when deterministic navigation is required. */
  closeTabAndSetModule: (module: ActiveModule, fallbackModule: ActiveModule) => void
  /** Close every open scenario-gantt tab and return to the Scenario list. */
  closeAllScenarioTabs: () => void
  /** Persist the resolved display label for a scenario-gantt tab */
  setScenarioTabLabel: (module: string, label: string) => void
  /** Persist the scenario type for a scenario-gantt tab */
  setScenarioTabType: (module: string, fileType: string) => void
  toggleTopNav: () => void
  /** byUser=true 时设置 sidebarUserOverride=true，阻止后续自动切换 */
  setSidebarState: (state: SidebarState, byUser?: boolean) => void
  setFilterDialogOpen: (open: boolean) => void
  /** Open the Filter dialog pre-switched to the tab matching the entry point (pane funnel). */
  openFilterDialog: (tab: FilterDialogTab) => void
  loadFromStorage: () => void
}

const KEYS = {
  module:             'rois-shell-module',
  liveItem:           'rois-shell-live-item',
  scenarioItem:       'rois-shell-scenario-item',
  legalityItem:       'rois-shell-legality-item',
  systemItem:         'rois-shell-system-item',
  pbsItem:            'rois-shell-pbs-item',
  openTabs:           'rois-shell-open-tabs',
  scenarioTabLabels:  'rois-shell-scenario-tab-labels',
  scenarioTabTypes:   'rois-shell-scenario-tab-types',
  topNav:             'rois-shell-top-nav',
  sidebar:            'rois-shell-sidebar',
  sidebarByModule:    'rois-shell-sidebar-by-module',
  sidebarOverride:    'rois-shell-sidebar-override',
} as const

const save = (key: string, value: string): void => {
  try { localStorage.setItem(key, value) } catch { /* ignore storage errors */ }
}

const sidebarModuleKey = (module: ActiveModule): string =>
  module.startsWith('scenario-gantt:') ? 'scenario' : module

const defaultSidebarForModule = (module: ActiveModule): SidebarState =>
  module === 'live' ? 'collapsed' :
  module === 'help' ? 'hidden' :
  module === 'release' ? 'hidden' :
  module.startsWith('scenario-gantt:') ? 'collapsed' : 'expanded'

const sidebarForModule = (
  module: ActiveModule,
  statesByModule: Record<string, SidebarState>,
): SidebarState => statesByModule[sidebarModuleKey(module)] ?? defaultSidebarForModule(module)

const applySidebarForModule = (
  module: ActiveModule,
  statesByModule: Record<string, SidebarState>,
  set: (patch: Partial<ShellStore>) => void,
): void => {
  set({ sidebarState: sidebarForModule(module, statesByModule) })
}

export const useShellStore = create<ShellStore>((set, get) => ({
  activeModule: 'dashboard',
  activeLiveItem: 'roster',
  activeScenarioItem: 'all',
  activeLegalityItem: 'rule-sets',
  activeSystemItem: 'scheduler',
  activePbsItem: 'period',
  openTabs: ['dashboard'],
  scenarioTabLabels: {},
  scenarioTabTypes: {},
  scenarioTabRefreshTokens: {},
  topNavVisible: true,
  sidebarState: 'expanded',
  sidebarUserOverride: false,
  sidebarStatesByModule: {},
  filterDialogOpen: false,
  filterDialogTab: null,

  setModule: (module) => {
    const { sidebarStatesByModule, openTabs, scenarioTabRefreshTokens } = get()
    // Open tab if not already open (keep insertion order)
    const nextTabs = openTabs.includes(module) ? openTabs : [...openTabs, module]
    const nextRefreshTokens = module.startsWith('scenario-gantt:')
      ? { ...scenarioTabRefreshTokens, [module]: (scenarioTabRefreshTokens[module] ?? 0) + 1 }
      : scenarioTabRefreshTokens
    set({ activeModule: module, openTabs: nextTabs, scenarioTabRefreshTokens: nextRefreshTokens })
    save(KEYS.module, module)
    save(KEYS.openTabs, JSON.stringify(nextTabs))
    applySidebarForModule(module, sidebarStatesByModule, set)
  },

  setLiveItem: (item) => {
    set({ activeLiveItem: item })
    save(KEYS.liveItem, item)
  },

  setScenarioItem: (item) => {
    set({ activeScenarioItem: item })
    save(KEYS.scenarioItem, item)
  },

  setLegalityItem: (item) => {
    set({ activeLegalityItem: item })
    save(KEYS.legalityItem, item)
  },

  setSystemItem: (item) => {
    set({ activeSystemItem: item })
    save(KEYS.systemItem, item)
  },

  setPbsItem: (item) => {
    set({ activePbsItem: item })
    save(KEYS.pbsItem, item)
  },

  closeTab: (module) => {
    const { openTabs, activeModule, sidebarStatesByModule, scenarioTabLabels, scenarioTabTypes, scenarioTabRefreshTokens } = get()
    // Never close the last tab
    if (openTabs.length <= 1) return
    const nextTabs = openTabs.filter((t) => t !== module)
    // If closing the active tab, activate the nearest remaining tab
    let nextActive = activeModule
    if (activeModule === module) {
      const idx = openTabs.indexOf(module)
      nextActive = nextTabs[Math.max(0, idx - 1)]
    }
    // Clean up persisted label/type for scenario tabs
    const nextLabels = { ...scenarioTabLabels }
    delete nextLabels[module]
    const nextTypes = { ...scenarioTabTypes }
    delete nextTypes[module]
    const nextRefreshTokens = { ...scenarioTabRefreshTokens }
    delete nextRefreshTokens[module]
    set({
      openTabs: nextTabs,
      activeModule: nextActive,
      scenarioTabLabels: nextLabels,
      scenarioTabTypes: nextTypes,
      scenarioTabRefreshTokens: nextRefreshTokens,
    })
    save(KEYS.openTabs, JSON.stringify(nextTabs))
    save(KEYS.scenarioTabLabels, JSON.stringify(nextLabels))
    save(KEYS.scenarioTabTypes, JSON.stringify(nextTypes))
    save(KEYS.module, nextActive)
    if (nextActive !== activeModule) {
      applySidebarForModule(nextActive, sidebarStatesByModule, set)
    }
  },

  closeTabAndSetModule: (module, fallbackModule) => {
    const { openTabs, sidebarStatesByModule, scenarioTabLabels, scenarioTabTypes, scenarioTabRefreshTokens } = get()
    if (openTabs.length <= 1) {
      set({
        activeModule: fallbackModule,
        scenarioTabRefreshTokens: fallbackModule.startsWith('scenario-gantt:')
          ? { ...scenarioTabRefreshTokens, [fallbackModule]: (scenarioTabRefreshTokens[fallbackModule] ?? 0) + 1 }
          : scenarioTabRefreshTokens,
      })
      save(KEYS.module, fallbackModule)
      applySidebarForModule(fallbackModule, sidebarStatesByModule, set)
      return
    }

    const nextTabsWithoutModule = openTabs.filter((t) => t !== module)
    const nextTabs = nextTabsWithoutModule.includes(fallbackModule)
      ? nextTabsWithoutModule
      : [fallbackModule, ...nextTabsWithoutModule]

    const nextLabels = { ...scenarioTabLabels }
    delete nextLabels[module]
    const nextTypes = { ...scenarioTabTypes }
    delete nextTypes[module]
    const nextRefreshTokens = { ...scenarioTabRefreshTokens }
    delete nextRefreshTokens[module]

    set({
      openTabs: nextTabs,
      activeModule: fallbackModule,
      scenarioTabLabels: nextLabels,
      scenarioTabTypes: nextTypes,
      scenarioTabRefreshTokens: fallbackModule.startsWith('scenario-gantt:')
        ? { ...nextRefreshTokens, [fallbackModule]: (nextRefreshTokens[fallbackModule] ?? 0) + 1 }
        : nextRefreshTokens,
    })
    save(KEYS.openTabs, JSON.stringify(nextTabs))
    save(KEYS.scenarioTabLabels, JSON.stringify(nextLabels))
    save(KEYS.scenarioTabTypes, JSON.stringify(nextTypes))
    save(KEYS.module, fallbackModule)
    applySidebarForModule(fallbackModule, sidebarStatesByModule, set)
  },

  closeAllScenarioTabs: () => {
    const { openTabs, sidebarStatesByModule, scenarioTabLabels, scenarioTabTypes, scenarioTabRefreshTokens } = get()
    const scenarioTabs = openTabs.filter((tab) => tab.startsWith('scenario-gantt:'))
    if (scenarioTabs.length === 0) return

    const nextTabsWithoutScenarios = openTabs.filter((tab) => !tab.startsWith('scenario-gantt:'))
    const nextTabs = nextTabsWithoutScenarios.includes('scenario')
      ? nextTabsWithoutScenarios
      : ['scenario', ...nextTabsWithoutScenarios]

    const nextLabels = { ...scenarioTabLabels }
    const nextTypes = { ...scenarioTabTypes }
    const nextRefreshTokens = { ...scenarioTabRefreshTokens }
    for (const tab of scenarioTabs) {
      delete nextLabels[tab]
      delete nextTypes[tab]
      delete nextRefreshTokens[tab]
    }

    set({
      openTabs: nextTabs,
      activeModule: 'scenario',
      scenarioTabLabels: nextLabels,
      scenarioTabTypes: nextTypes,
      scenarioTabRefreshTokens: nextRefreshTokens,
    })
    save(KEYS.openTabs, JSON.stringify(nextTabs))
    save(KEYS.scenarioTabLabels, JSON.stringify(nextLabels))
    save(KEYS.scenarioTabTypes, JSON.stringify(nextTypes))
    save(KEYS.module, 'scenario')
    applySidebarForModule('scenario', sidebarStatesByModule, set)
  },

  setScenarioTabLabel: (module, label) => {
    const nextLabels = { ...get().scenarioTabLabels, [module]: label }
    set({ scenarioTabLabels: nextLabels })
    save(KEYS.scenarioTabLabels, JSON.stringify(nextLabels))
  },

  setScenarioTabType: (module, fileType) => {
    const nextTypes = { ...get().scenarioTabTypes, [module]: fileType }
    set({ scenarioTabTypes: nextTypes })
    save(KEYS.scenarioTabTypes, JSON.stringify(nextTypes))
  },

  toggleTopNav: () => {
    const next = !get().topNavVisible
    set({ topNavVisible: next })
    save(KEYS.topNav, String(next))
  },

  setSidebarState: (state, byUser = false) => {
    if (!byUser) {
      set({ sidebarState: state })
      save(KEYS.sidebar, state)
      return
    }

    const key = sidebarModuleKey(get().activeModule)
    const nextStates = { ...get().sidebarStatesByModule, [key]: state }
    set({ sidebarState: state, sidebarUserOverride: true, sidebarStatesByModule: nextStates })
    save(KEYS.sidebar, state)
    save(KEYS.sidebarOverride, 'true')
    save(KEYS.sidebarByModule, JSON.stringify(nextStates))
  },

  // Toolbar/empty-state entry keeps the last active tab (tab: null).
  setFilterDialogOpen: (open) => set({ filterDialogOpen: open, ...(open ? { filterDialogTab: null } : {}) }),

  openFilterDialog: (tab) => set({ filterDialogOpen: true, filterDialogTab: tab }),

  loadFromStorage: () => {
    try {
      // Boot-time safety: the menu store hasn't fetched /api/auth/menus yet, and
      // canAccessMenu is fail-open during that window. Until menus land we fall
      // back to users.is_admin as a synchronous gate so a stale localStorage
      // value pointing at PBS/SYSTEM never mounts an admin-only view for a
      // non-admin user (which would 403 with "Admin access required"). Once
      // menus load, AppShell/ShellTopNav filters take over and respect the
      // permission system instead — see useShellStore consumer code.
      const userIsAdmin = useAuthStore.getState().user?.isAdmin === 1
      const { canAccessMenu, loaded: menusLoaded } = useMenuStore.getState()
      const isHidden = (m: ActiveModule): boolean => {
        if (menusLoaded) return !canAccessMenu(MODULE_MENU[m])
        // Menus still loading: admin short-circuit + the boot-only deny list
        // for non-admin (PBS / SYSTEM are strictly admin-only modules).
        return !userIsAdmin && ADMIN_ONLY_MODULES.includes(m)
      }
      const rawModule = (localStorage.getItem(KEYS.module) as ActiveModule | null) ?? 'dashboard'
      const module: ActiveModule = isHidden(rawModule) ? 'dashboard' : rawModule
      const VALID_LIVE_ITEMS: ActiveLiveItem[] = ['roster']
      const rawLiveItem = localStorage.getItem(KEYS.liveItem)
      const liveItem: ActiveLiveItem =
        VALID_LIVE_ITEMS.includes(rawLiveItem as ActiveLiveItem)
          ? (rawLiveItem as ActiveLiveItem)
          : 'roster'
      const VALID_SCENARIO_ITEMS: ActiveScenarioItem[] = ['all', 'po', 'ro', 'crew-bids']
      const rawScenarioItem = localStorage.getItem(KEYS.scenarioItem)
      const scenarioItem: ActiveScenarioItem =
        VALID_SCENARIO_ITEMS.includes(rawScenarioItem as ActiveScenarioItem)
          ? (rawScenarioItem as ActiveScenarioItem)
          : 'all'
      const VALID_LEGALITY_ITEMS: ActiveLegalityItem[] = ['rule-sets', 'rule-instances']
      const rawLegalityItem = localStorage.getItem(KEYS.legalityItem)
      const legalityItem: ActiveLegalityItem =
        VALID_LEGALITY_ITEMS.includes(rawLegalityItem as ActiveLegalityItem)
          ? (rawLegalityItem as ActiveLegalityItem)
          : 'rule-sets'
      const VALID_SYSTEM_ITEMS: ActiveSystemItem[] = ['queue-tasks', 'scheduler', 'grafana', 'prometheus', 'windmill', 'data-quality', 'user-mgmt', 'profile-mgmt', 'menu-mgmt', 'pbs-user-mgmt', 'dept-mgmt']
      const rawSystemItem = localStorage.getItem(KEYS.systemItem)
      const systemItem: ActiveSystemItem =
        VALID_SYSTEM_ITEMS.includes(rawSystemItem as ActiveSystemItem)
          ? (rawSystemItem as ActiveSystemItem)
          : 'scheduler'
      const VALID_PBS_ITEMS: ActivePbsItem[] = ['period', 'bid-definitions', 'business-time', 'admin-tools', 'simulated-crew-portal']
      const rawPbsItem = localStorage.getItem(KEYS.pbsItem)
      const pbsItem: ActivePbsItem =
        VALID_PBS_ITEMS.includes(rawPbsItem as ActivePbsItem)
          ? (rawPbsItem as ActivePbsItem)
          : 'period'
      const topNavVisible = localStorage.getItem(KEYS.topNav) !== 'false'
      const sidebarUserOverride = localStorage.getItem(KEYS.sidebarOverride) === 'true'
      const sidebarStatesRaw = localStorage.getItem(KEYS.sidebarByModule)
      const sidebarStatesByModule: Record<string, SidebarState> = sidebarStatesRaw
        ? (JSON.parse(sidebarStatesRaw) as Record<string, SidebarState>)
        : {}
      const sidebarState = sidebarForModule(module, sidebarStatesByModule)
      const openTabsRaw = localStorage.getItem(KEYS.openTabs)
      const restoredTabs = (openTabsRaw
        ? (JSON.parse(openTabsRaw) as ActiveModule[])
        : [module]
      ).filter((t) => !isHidden(t))
      // Keep the active module present and never end up with zero tabs.
      const openTabs: ActiveModule[] = restoredTabs.includes(module)
        ? restoredTabs
        : [module, ...restoredTabs]
      const scenarioTabLabelsRaw = localStorage.getItem(KEYS.scenarioTabLabels)
      const scenarioTabLabels: Record<string, string> = scenarioTabLabelsRaw
        ? (JSON.parse(scenarioTabLabelsRaw) as Record<string, string>)
        : {}
      const scenarioTabTypesRaw = localStorage.getItem(KEYS.scenarioTabTypes)
      const scenarioTabTypes: Record<string, string> = scenarioTabTypesRaw
        ? (JSON.parse(scenarioTabTypesRaw) as Record<string, string>)
        : {}
      set({
        activeModule: module,
        activeLiveItem: liveItem,
        activeScenarioItem: scenarioItem,
        activeLegalityItem: legalityItem,
        activeSystemItem: systemItem,
        activePbsItem: pbsItem,
        openTabs,
        scenarioTabLabels,
        scenarioTabTypes,
        scenarioTabRefreshTokens: {},
        topNavVisible,
        sidebarState,
        sidebarUserOverride,
        sidebarStatesByModule,
      })
    } catch { /* ignore */ }
  },
}))
