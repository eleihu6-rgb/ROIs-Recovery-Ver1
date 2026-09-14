import profile from '../../config/roundtrip-profile.json'
import { scopeBounds, validateRotation, type Rotation, type RoundtripFlight, type RoundtripScope } from './roundtrip-chooser.js'

export interface RecoveryRotationResult { rotations: Rotation[]; truncated: boolean }

/** Enumerate alternatives without consuming flights shared by competing options. */
export function chooseRecoveryRotations(input: RoundtripFlight[], scope: RoundtripScope, anchorFlightId: number): RecoveryRotationResult {
  const anchor = input.find(f => f.id === anchorFlightId)
  if (!anchor) return { rotations: [], truncated: false }
  const bounds = scopeBounds(scope)
  const flights = input.filter(f => f.airline === anchor.airline && f.fleet === anchor.fleet
    && new Date(f.schDepDtUtc) >= bounds.start && new Date(f.schArvDtUtc) < bounds.end)
    .sort((a, b) => a.schDepDtUtc.localeCompare(b.schDepDtUtc) || a.id - b.id)
  const byStation = new Map<string, RoundtripFlight[]>()
  for (const flight of flights) byStation.set(flight.depArp, [...(byStation.get(flight.depArp) ?? []), flight])
  if (!flights.some(f => f.id === anchorFlightId)) return { rotations: [], truncated: false }
  const byArrival = new Map<string, RoundtripFlight[]>()
  for (const flight of flights) {
    const list = byArrival.get(flight.arvArp) ?? []
    list.push(flight)
    byArrival.set(flight.arvArp, list)
  }
  // Start at the incident, not every earlier base departure. Otherwise unrelated
  // flights can exhaust the entire bounded queue before the anchor is visited.
  // First connect backwards to base, then forwards to the first return to base.
  const queue = [[anchor]]
  const rotations: Rotation[] = []
  let cursor = 0
  let truncated = false
  while (cursor < queue.length && cursor < profile.limits.maxSearchStates) {
    const chain = queue[cursor++]
    const last = chain[chain.length - 1]
    const first = chain[0]
    const prepend = first.depArp !== scope.base
    if (!prepend && last.arvArp === scope.base) {
      try { rotations.push(validateRotation(chain, scope)) } catch { /* Not a valid build option. */ }
      continue
    }
    if (chain.length >= profile.limits.maxRotationLegs) { truncated = true; continue }
    const candidates = (prepend ? byArrival.get(first.depArp) : byStation.get(last.arvArp)) ?? []
    // Prefer direct base connections and nearby flights within the same budget.
    const connecting = candidates.filter(next => !chain.some(f => f.id === next.id)
      && (prepend ? next.schArvDtUtc <= first.schDepDtUtc : next.schDepDtUtc >= last.schArvDtUtc))
      .sort((a, b) => Number((prepend ? b.depArp : b.arvArp) === scope.base)
        - Number((prepend ? a.depArp : a.arvArp) === scope.base)
        || (prepend ? b.schArvDtUtc.localeCompare(a.schArvDtUtc) : a.schDepDtUtc.localeCompare(b.schDepDtUtc))
        || a.id - b.id)
    for (const next of connecting) {
      if (queue.length >= profile.limits.maxSearchStates) { truncated = true; break }
      queue.push(prepend ? [next, ...chain] : [...chain, next])
    }
  }
  return { rotations, truncated: truncated || cursor < queue.length }
}
