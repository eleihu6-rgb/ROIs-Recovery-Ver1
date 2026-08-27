import type { RuleViolation } from '@/types/rule-check'

export interface RuleConfirmMember {
  crewId: string
  age: number | null
}

export interface RuleConfirmGroup {
  key: string
  ruleCode: string
  ruleName: string
  severity: number
  isNew: boolean
  message: string
  members: RuleConfirmMember[]
}

interface MutableConfirmGroup extends RuleConfirmGroup {
  earliestStartMs?: number
  flightId?: number | null
}

/** Label may be `605` or `605 (2026-09-07)`. */
const RULE_8030_MESSAGE =
  /^(Row\s+\d+:\s*)?Pilot aged (\d+) on flight (.+?) carrying (.+)$/i

const parseRule8030Message = (
  message: string,
): {
  rowPrefix: string
  age: number | null
  flightLabel: string | null
  sharedMessage: string
} => {
  const match = message.match(RULE_8030_MESSAGE)
  if (!match) {
    return { rowPrefix: '', age: null, flightLabel: null, sharedMessage: message }
  }

  const rowPrefix = match[1] ?? ''
  const flightLabel = match[3]
  const rest = match[4]
  return {
    rowPrefix,
    age: Number(match[2]),
    flightLabel,
    sharedMessage: `${rowPrefix}Flight ${flightLabel} carrying ${rest}`,
  }
}

const startMsOf = (violation: RuleViolation): number => {
  if (!violation.windowStartDt) return Number.POSITIVE_INFINITY
  const ms = Date.parse(violation.windowStartDt)
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY
}

const keepEarliest8030Flight = (groups: MutableConfirmGroup[]): MutableConfirmGroup[] => {
  const flight8030 = groups.filter(
    (g) => g.ruleCode === '8030' && g.flightId != null && g.members.length > 0,
  )
  if (flight8030.length <= 1) return groups

  let best = flight8030[0]
  for (const g of flight8030.slice(1)) {
    const bestStart = best.earliestStartMs ?? Number.POSITIVE_INFINITY
    const nextStart = g.earliestStartMs ?? Number.POSITIVE_INFINITY
    if (
      nextStart < bestStart
      || (nextStart === bestStart && (g.flightId ?? 0) < (best.flightId ?? 0))
    ) {
      best = g
    }
  }

  const dropKeys = new Set(
    flight8030.filter((g) => g.key !== best.key).map((g) => g.key),
  )
  return groups.filter((g) => !dropKeys.has(g.key))
}

const toPublicGroup = ({
  earliestStartMs: _earliestStartMs,
  flightId: _flightId,
  ...group
}: MutableConfirmGroup): RuleConfirmGroup => group

export const groupRuleConfirmViolations = (
  violations: RuleViolation[],
): RuleConfirmGroup[] => {
  const groups: MutableConfirmGroup[] = []
  const groupIndexes = new Map<string, number>()

  for (const violation of violations) {
    const isPairingRule8030 =
      violation.ruleCode === '8030' &&
      violation.targetType === 'pairing' &&
      violation.crewId

    if (isPairingRule8030) {
      const parsed = parseRule8030Message(violation.message)
      const flightId =
        violation.flightId != null && Number.isFinite(Number(violation.flightId))
          ? Number(violation.flightId)
          : null
      const flightKey =
        flightId != null
          ? String(flightId)
          : `unparsed:${violation.targetId}:${violation.crewId}`
      const key =
        `${violation.ruleCode}:${violation.ruleName}:${parsed.rowPrefix}:${flightKey}`
      const existingIndex = groupIndexes.get(key)
      const member = { crewId: violation.crewId!, age: parsed.age }
      const startMs = startMsOf(violation)

      if (existingIndex === undefined) {
        groupIndexes.set(key, groups.length)
        groups.push({
          key,
          ruleCode: violation.ruleCode,
          ruleName: violation.ruleName,
          severity: violation.severity,
          isNew: Boolean(violation.isNew),
          message: parsed.sharedMessage,
          members: [member],
          earliestStartMs: startMs,
          flightId,
        })
      } else {
        const existing = groups[existingIndex]
        existing.severity = Math.max(existing.severity, violation.severity)
        existing.isNew ||= Boolean(violation.isNew)
        existing.earliestStartMs = Math.min(
          existing.earliestStartMs ?? Number.POSITIVE_INFINITY,
          startMs,
        )
        if (!existing.members.some(({ crewId }) => crewId === member.crewId)) {
          existing.members.push(member)
        }
      }
      continue
    }

    const key = `${violation.ruleCode}:${violation.message}`
    if (groupIndexes.has(key)) continue
    groupIndexes.set(key, groups.length)
    groups.push({
      key,
      ruleCode: violation.ruleCode,
      ruleName: violation.ruleName,
      severity: violation.severity,
      isNew: Boolean(violation.isNew),
      message: violation.message,
      members: [],
    })
  }

  return keepEarliest8030Flight(groups)
    .sort((a, b) => b.severity - a.severity)
    .map(toPublicGroup)
}
