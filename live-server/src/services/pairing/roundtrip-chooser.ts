import { z } from 'zod'
import profile from '../../config/roundtrip-profile.json'
import { localWallTimeToUtc } from '../../utils/zoned-time.js'

const ALL_FLEETS = 'ALL'
const LINK_WINDOW_MS = 5 * 24 * 60 * 60 * 1000
const LINK_LIMIT = 3

const roundtripRulesSchema = z.object({
  checkinMin: z.number().int().min(profile.defaults.checkinMin).max(profile.limits.maxRuleMinutes),
  debriefMin: z.number().int().min(profile.defaults.debriefMin).max(profile.limits.maxRuleMinutes),
  restMin: z.number().int().min(profile.defaults.restMin).max(profile.limits.maxRuleMinutes),
  maxDutyBlockMin: z.number().int().positive().max(profile.defaults.maxDutyBlockMin),
  singleLegExemption: z.boolean(),
})

export const roundtripScopeSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  ganttStart: z.string().date(),
  ganttEnd: z.string().date(),
  timezone: z.string().min(1).max(100),
  base: z.string().min(1).max(3),
  fleet: z.string().min(1).max(10).optional(),
  fleets: z.array(z.string().min(1).max(10)).min(1).optional(),
  composition: z.array(z.object({
    rank: z.string().min(1).max(10),
    plan: z.number().int().min(1).max(profile.limits.maxCompositionCount),
  })).min(1),
  rules: roundtripRulesSchema,
}).superRefine((value, ctx) => {
  if (!value.fleet && (!value.fleets || value.fleets.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fleets'], message: 'Choose at least one fleet' })
  }
}).transform(({ fleet, fleets, ...value }) => ({
  ...value,
  fleets: fleets && fleets.length > 0 ? [...new Set(fleets)] : [fleet!],
}))

export type RoundtripScope = z.infer<typeof roundtripScopeSchema>
export type RoundtripRules = RoundtripScope['rules']
export interface RoundtripFlight {
  id: number
  airline: string
  fltNum: string
  depArp: string
  arvArp: string
  schDepDtUtc: string
  schArvDtUtc: string
  blockMin: number
  fleet: string
}
export interface Rotation {
  key: string
  flightIds: number[]
  dutyFlightIds: number[][]
  blockMin: number
  layoverMinutes: number[]
}
export interface RoundtripLinkCandidate {
  flightId: number
  fltNum: string
  depArp: string
  arvArp: string
  schDepDtUtc: string
  schArvDtUtc: string
  preferred: boolean
}

/** CX/X runtime cancellation markers; C is schema-defined cancelled flag. */
export const isRoundtripFlightCancelled = (f: { isDeleted?: number | null; flightFlag?: string | null; fltSts?: string | null }): boolean => {
  const marker = `${String(f.flightFlag ?? '')} ${String(f.fltSts ?? '')}`.toUpperCase()
  return f.isDeleted === 1 || /\b(CX|X|C)\b/.test(marker)
}

export const roundtripError = (message: string, statusCode = 400): Error =>
  Object.assign(new Error(message), { statusCode })

const dep = (f: RoundtripFlight): number => new Date(f.schDepDtUtc).getTime()
const arr = (f: RoundtripFlight): number => new Date(f.schArvDtUtc).getTime()

const shiftDate = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + days * 86400000).toISOString().slice(0, 10)

export const toRoundtripFlight = (f: {
  id: number
  airline: string
  fltNum: string
  depArp: string
  arvArp: string
  schDepDtUtc: Date
  schArvDtUtc: Date
  blkMin: number
  fleet: string
}): RoundtripFlight => ({
  id: f.id,
  airline: f.airline,
  fltNum: f.fltNum,
  depArp: f.depArp,
  arvArp: f.arvArp,
  schDepDtUtc: f.schDepDtUtc.toISOString(),
  schArvDtUtc: f.schArvDtUtc.toISOString(),
  blockMin: f.blkMin,
  fleet: f.fleet,
})

export const scopeFleetMatches = (scope: RoundtripScope, fleet: string): boolean =>
  scope.fleets.includes(ALL_FLEETS) || scope.fleets.includes(fleet)

export const linkScope = (scope: RoundtripScope): RoundtripScope => ({
  ...scope,
  startDate: shiftDate(scope.startDate, -5) < scope.ganttStart ? scope.ganttStart : shiftDate(scope.startDate, -5),
  endDate: shiftDate(scope.endDate, 5) > scope.ganttEnd ? scope.ganttEnd : shiftDate(scope.endDate, 5),
})

export const scopeBounds = (scope: RoundtripScope): { start: Date; end: Date } => {
  if (scope.startDate < scope.ganttStart || scope.endDate > scope.ganttEnd || scope.startDate > scope.endDate) {
    throw roundtripError('Dates must stay within the open Gantt range')
  }
  try {
    const midnight = (date: string): Date => {
      const [year, month, day] = date.split('-').map(Number)
      return localWallTimeToUtc(year, month, day, 0, 0, scope.timezone)
    }
    const nextDay = new Date(Date.parse(`${scope.endDate}T00:00:00.000Z`) + 86400000)
    return { start: midnight(scope.startDate), end: midnight(nextDay.toISOString().slice(0, 10)) }
  } catch {
    throw roundtripError('Invalid timezone date range')
  }
}

/** Duty accounting retains arrival checkout; free rest excludes debrief and next check-in. */
export const rotationDuties = (flights: RoundtripFlight[], scope: RoundtripScope): RoundtripFlight[][] => {
  const duties: RoundtripFlight[][] = []
  const { rules } = scope
  for (const f of flights) {
    const duty = duties.at(-1)
    if (!duty) {
      duties.push([f])
      continue
    }
    const previous = duty[duty.length - 1]
    const gap = (dep(f) - arr(previous)) / 60000
    if (gap >= rules.restMin) {
      const priorPeriod = (arr(previous) - dep(duty[0])) / 60000 + rules.checkinMin
      if (gap - rules.debriefMin - rules.checkinMin < Math.max(rules.restMin, priorPeriod)) {
        throw roundtripError('Insufficient free rest between duties')
      }
      duties.push([f])
    } else {
      duty.push(f)
    }
  }
  for (const duty of duties) {
    const block = duty.reduce((sum, f) => sum + f.blockMin, 0)
    if (block > rules.maxDutyBlockMin && !(duty.length === 1 && rules.singleLegExemption)) {
      throw roundtripError('Duty block limit exceeded')
    }
  }
  return duties
}

const validateChain = (flights: RoundtripFlight[], scope: RoundtripScope): RoundtripFlight[][] => {
  if (!flights.length || new Set(flights.map((f) => f.id)).size !== flights.length) {
    throw roundtripError('Flight IDs must be unique and nonempty')
  }
  const bounds = scopeBounds(scope)
  for (let i = 0; i < flights.length; i++) {
    const f = flights[i]
    if (!f.fleet.trim() || f.fleet !== flights[0].fleet) {
      throw roundtripError('Rotation must use one known fleet')
    }
    if (
      !scopeFleetMatches(scope, f.fleet) ||
      f.airline !== flights[0].airline ||
      !Number.isFinite(dep(f)) ||
      !Number.isFinite(arr(f)) ||
      arr(f) <= dep(f) ||
      f.blockMin <= 0 ||
      dep(f) < bounds.start.getTime() ||
      arr(f) >= bounds.end.getTime()
    ) {
      throw roundtripError('Flight is outside selected scope')
    }
    if (i && (flights[i - 1].arvArp !== f.depArp || dep(f) < arr(flights[i - 1]))) {
      throw roundtripError('Flight sequence is not continuous')
    }
  }
  return rotationDuties(flights, scope)
}

export const validateRotation = (flights: RoundtripFlight[], scope: RoundtripScope): Rotation => {
  const duties = validateChain(flights, scope)
  const first = flights[0]
  const last = flights[flights.length - 1]
  if (dep(first) - scope.rules.checkinMin * 60000 < scopeBounds(scope).start.getTime()) {
    throw roundtripError('Check-in is outside selected scope')
  }
  if (arr(last) + scope.rules.debriefMin * 60000 > scopeBounds(scope).end.getTime()) {
    throw roundtripError('Final debrief is outside selected scope')
  }
  if (first.depArp !== scope.base || last.arvArp !== scope.base) {
    throw roundtripError('Rotation does not start and end at selected base')
  }
  const flightIds = flights.map((f) => f.id)
  return {
    key: flightIds.join('-'),
    flightIds,
    dutyFlightIds: duties.map((duty) => duty.map((f) => f.id)),
    blockMin: flights.reduce((sum, f) => sum + f.blockMin, 0),
    layoverMinutes: duties.slice(1).map((duty, i) =>
      (dep(duty[0]) - arr(duties[i][duties[i].length - 1])) / 60000 - scope.rules.checkinMin - scope.rules.debriefMin),
  }
}

export const chooseRotations = (input: RoundtripFlight[], scope: RoundtripScope): Rotation[] => {
  const flights = [...input].filter((f) => scopeFleetMatches(scope, f.fleet)).sort((a, b) => dep(a) - dep(b) || a.id - b.id)
  const byStation = new Map<string, RoundtripFlight[]>()
  for (const f of flights) {
    const key = `${f.airline}:${f.fleet}:${f.depArp}`
    const list = byStation.get(key) ?? []
    list.push(f)
    byStation.set(key, list)
  }
  const used = new Set<number>()
  const output: Rotation[] = []

  const close = (initial: RoundtripFlight[]): RoundtripFlight[] | null => {
    const queue = [initial]
    let explored = 0
    while (queue.length && explored++ < profile.limits.maxSearchStates) {
      const chain = queue.shift()!
      try {
        validateChain(chain, scope)
      } catch {
        continue
      }
      const last = chain[chain.length - 1]
      if (chain.length > 1 && last.arvArp === scope.base) return chain
      if (chain.length >= profile.limits.maxRotationLegs) continue
      const ids = new Set(chain.map((f) => f.id))
      for (const next of byStation.get(`${last.airline}:${last.fleet}:${last.arvArp}`) ?? []) {
        if (!used.has(next.id) && !ids.has(next.id) && dep(next) >= arr(last)) {
          queue.push([...chain, next])
          if (queue.length >= profile.limits.maxSearchStates) break
        }
      }
    }
    return null
  }

  for (const seed of flights) {
    if (used.has(seed.id) || seed.depArp !== scope.base) continue
    let chain = close([seed])
    if (!chain) continue

    // Pack another complete base turn only when it stays in the same final duty.
    while (chain.length < profile.limits.maxRotationLegs) {
      const current = chain
      const last = current[current.length - 1]
      let packed: RoundtripFlight[] | null = null
      for (const next of byStation.get(`${seed.airline}:${seed.fleet}:${scope.base}`) ?? []) {
        if (
          used.has(next.id) ||
          current.some((f) => f.id === next.id) ||
          dep(next) < arr(last) ||
          (dep(next) - arr(last)) / 60000 >= scope.rules.restMin
        ) {
          continue
        }
        const candidate = close([...current, next])
        if (candidate) {
          packed = candidate
          break
        }
      }
      if (!packed) break
      chain = packed
    }

    const rotation = validateRotation(chain, scope)
    rotation.flightIds.forEach((id) => used.add(id))
    output.push(rotation)
  }
  return output
}

const candidateMatches = (flight: RoundtripFlight, candidate: RoundtripFlight, scope: RoundtripScope): boolean => {
  if (flight.id === candidate.id || flight.airline !== candidate.airline || flight.fleet !== candidate.fleet) return false
  const forward = flight.depArp === scope.base || (flight.depArp !== scope.base && flight.arvArp !== scope.base)
  const backward = flight.arvArp === scope.base || (flight.depArp !== scope.base && flight.arvArp !== scope.base)
  return (forward && flight.arvArp === candidate.depArp && dep(candidate) >= arr(flight) && dep(candidate) - arr(flight) <= LINK_WINDOW_MS) ||
    (backward && candidate.arvArp === flight.depArp && arr(candidate) <= dep(flight) && dep(flight) - arr(candidate) <= LINK_WINDOW_MS)
}

export const rankLinkCandidates = (
  flight: RoundtripFlight,
  flights: RoundtripFlight[],
  rotations: Rotation[],
  scope: RoundtripScope,
): RoundtripLinkCandidate[] => {
  const adjacentPreferredIds = new Set<number>()
  for (const rotation of rotations) {
    const index = rotation.flightIds.indexOf(flight.id)
    if (index > 0) adjacentPreferredIds.add(rotation.flightIds[index - 1])
    if (index >= 0 && index < rotation.flightIds.length - 1) adjacentPreferredIds.add(rotation.flightIds[index + 1])
  }

  const candidates = flights
    .filter((candidate) => scopeFleetMatches(scope, candidate.fleet) && candidateMatches(flight, candidate, scope))
    .sort((a, b) => Math.abs(dep(a) - dep(flight)) - Math.abs(dep(b) - dep(flight)) || dep(a) - dep(b) || a.id - b.id)
    .slice(0, LINK_LIMIT)

  const validPair = (candidate: RoundtripFlight): Rotation | null => {
    const sequence = candidate.arvArp === flight.depArp && arr(candidate) <= dep(flight) ? [candidate, flight] : [flight, candidate]
    try {
      return validateRotation(sequence, linkScope(scope))
    } catch {
      return null
    }
  }
  const layoverPreferred = candidates.find((candidate) => (validPair(candidate)?.dutyFlightIds.length ?? 0) > 1)
  const directPreferred = layoverPreferred ?? candidates.find((candidate) => validPair(candidate))
  const preferredId = directPreferred?.id ?? candidates.find((candidate) => adjacentPreferredIds.has(candidate.id))?.id

  return candidates.map((candidate) => ({
    flightId: candidate.id,
    fltNum: candidate.fltNum,
    depArp: candidate.depArp,
    arvArp: candidate.arvArp,
    schDepDtUtc: candidate.schDepDtUtc,
    schArvDtUtc: candidate.schArvDtUtc,
    preferred: preferredId === candidate.id,
  }))
}

export const buildFlightLinks = (
  flights: RoundtripFlight[],
  rotations: Rotation[],
  scope: RoundtripScope,
): Record<number, RoundtripLinkCandidate[]> =>
  Object.fromEntries(flights.map((flight) => [flight.id, rankLinkCandidates(flight, flights, rotations, scope)]))
