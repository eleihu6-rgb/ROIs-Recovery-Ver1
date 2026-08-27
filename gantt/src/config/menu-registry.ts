/**
 * 前端导航 ↔ system_menu 映射。
 * 顶层 Tab（module）与侧栏 sub-item（pageId）对应 menu_code，
 * 供权限过滤（未授权不渲染）。
 */

/** 顶层 Tab → menu_code */
export const MODULE_MENU: Record<string, string> = {
  dashboard:  'DASHBOARD',
  live:       'LIVE',
  scenario:   'SCENARIO',
  data:       'DATA',
  legality:   'LEGALITY',
  system:     'SYSTEM',
  pbs:        'PBS',
  help:       'HELP',
  regression: 'REGRESSION',
  dev:        'DEV',
  release:    'RELEASE',
}

/** 模块内 sub-item（pageId）→ menu_code */
export const PAGE_MENU: Record<string, string> = {
  // cross-cutting (not a nav tab; gates the R'Bot floating assistant, hoisted at shell root)
  rbot: 'RBOT',
  // live
  roster: 'LIVE_ROSTER',
  // scenario
  all: 'SCENARIO_ALL',
  po: 'SCENARIO_PO',
  ro: 'SCENARIO_RO',
  'crew-bids': 'SCENARIO_CREW_BIDS',
  // data
  'basic.org-base': 'DATA_ORG_BASE',
  'basic.rank': 'DATA_RANK',
  'basic.fleet-aircraft': 'DATA_FLEET_AIRCRAFT',
  'basic.location-route': 'DATA_LOCATION_ROUTE',
  'basic.assignment': 'DATA_ASSIGNMENT',
  'basic.qualification': 'DATA_QUALIFICATION',
  'basic.composition': 'DATA_COMPOSITION',
  'basic.roster-period': 'DATA_ROSTER_PERIOD',
  'basic.config-dictionary': 'DATA_CONFIG_DICTIONARY',
  'basic.query': 'DATA_QUERY',
  'basic.holiday': 'DATA_HOLIDAY',
  'crew.master': 'DATA_CREW_MASTER',
  'crew.workload-summary': 'DATA_CREW_WORKLOAD',
  // legality
  'rule-sets': 'LEGALITY_RULE_SETS',
  'rule-instances': 'LEGALITY_RULE_INSTANCES',
  composition: 'LEGALITY_COMPOSITION',
  'comp-load': 'LEGALITY_COMP_LOAD',
  // system
  scheduler: 'SYSTEM_SCHEDULER',
  'queue-tasks': 'SYSTEM_QUEUE_TASKS',
  grafana: 'SYSTEM_GRAFANA',
  prometheus: 'SYSTEM_PROMETHEUS',
  windmill: 'SYSTEM_WINDMILL',
  'data-quality': 'SYSTEM_DATA_QUALITY',
  'user-mgmt': 'SYSTEM_USER_MGMT',
  'profile-mgmt': 'SYSTEM_PROFILE_MGMT',
  'menu-mgmt': 'SYSTEM_MENU_MGMT',
  'pbs-user-mgmt': 'SYSTEM_PBS_USER_MGMT',
  'dept-mgmt': 'SYSTEM_DEPT_MGMT',
  // pbs
  period: 'PBS_PERIOD',
  'bid-definitions': 'PBS_BID_DEFINITIONS',
  'business-time': 'PBS_BUSINESS_TIME',
  'admin-tools': 'PBS_ADMIN_TOOLS',
  'simulated-crew-portal': 'PBS_SIMULATED_CREW_PORTAL',
}

/** 反查：menu_code → module（顶层 Tab 对应关系，用于知道该菜单属于哪个 Tab） */
export const MENU_TO_MODULE: Record<string, string> = Object.entries(MODULE_MENU).reduce(
  (acc, [module, menuCode]) => {
    acc[menuCode] = module
    return acc
  },
  {} as Record<string, string>,
)
