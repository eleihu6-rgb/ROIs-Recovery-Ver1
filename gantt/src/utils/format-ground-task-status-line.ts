import { formatCreditMinutes } from '@/utils/format-credit'
import { formatDateShort, formatTime } from '@/stores/timezone-store'
import type { RosterItem } from '@/types/roster'

type GroundTaskStatusItem = Pick<
  RosterItem,
  | 'id'
  | 'crewId'
  | 'base'
  | 'depArp'
  | 'arvArp'
  | 'assignmentGroup'
  | 'assignment'
  | 'label'
  | 'schStrDtUtc'
  | 'schEndDtUtc'
  | 'actCreditedMinutes'
  | 'schCreditedMinutes'
  | 'dpMin'
>

export interface GroundTaskStatusLineOptions {
  zoneIdForBase?: (base: string) => string | undefined
}

const zoneIdForTaskBase = (
  base: string,
  resolver?: (base: string) => string | undefined,
): string => {
  const baseCode = base.split(' | ')[0]?.trim() ?? ''
  return resolver?.(baseCode || base) ?? 'UTC'
}

const formatGroundTaskTime = (
  startUtc: string | null,
  endUtc: string | null,
  zoneId: string,
): string => {
  if (!startUtc || !endUtc) return ''
  const startDate = formatDateShort(startUtc, zoneId)
  const startTime = formatTime(startUtc, zoneId)
  const endDate = formatDateShort(endUtc, zoneId)
  const endTime = formatTime(endUtc, zoneId)
  const endStamp = startDate === endDate ? `${endTime}L` : `${endDate} ${endTime}L`
  return `${startDate} ${startTime}L ~ ${endStamp}`
}

export const formatGroundTaskStatusLine = (
  item: GroundTaskStatusItem,
  options: GroundTaskStatusLineOptions = {},
): string => {
  const depArp = item.depArp ?? item.base ?? ''
  const arvArp = item.arvArp ?? ''
  const route = [depArp, arvArp].filter(Boolean).join('-')
  const zoneId = zoneIdForTaskBase(depArp || item.base, options.zoneIdForBase)
  const time = item.schStrDtUtc && item.schEndDtUtc
    ? formatGroundTaskTime(item.schStrDtUtc, item.schEndDtUtc, zoneId)
    : ''
  const credit = formatCreditMinutes(item.actCreditedMinutes) || formatCreditMinutes(item.schCreditedMinutes)

  return [
    `${item.crewId} #${item.id}`,
    route,
    item.assignmentGroup,
    item.assignment,
    item.label,
    time,
    credit ? `Credit ${credit}` : '',
    item.dpMin != null ? `DP Min ${item.dpMin}` : '',
  ].filter(Boolean).join('  ·  ')
}
