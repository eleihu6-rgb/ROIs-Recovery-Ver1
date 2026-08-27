const en = {
  ruleDialog: {
    titleBlocked: 'Rule Violation Detected',
    titleWarning: 'Rule Violations Detected',
    descBlocked: '',
    descWarning:
      'This operation produced rule warnings (highlighted rows). You may continue or cancel.',
    badgeNew: 'NEW',
    cancel: 'Cancel',
    continueAnyway: 'Continue Anyway',
  },
} as const

export type GanttLocale = { [K in keyof typeof en]: { [P in keyof (typeof en)[K]]: string } }

export default en
