export type AlertRuleFocus = {
  functionCode: string
  instanceCode: string | null
}

/** Parse Alert Center Rule ID (`8030/001` or bare `8030`) into function + instance. */
export const parseAlertRuleId = (ruleId: string): AlertRuleFocus => {
  const trimmed = ruleId.trim()
  if (!trimmed) return { functionCode: '', instanceCode: null }
  const slash = trimmed.indexOf('/')
  if (slash < 0) return { functionCode: trimmed, instanceCode: null }
  const functionCode = trimmed.slice(0, slash)
  const instanceCode = trimmed.slice(slash + 1) || null
  return { functionCode, instanceCode }
}
