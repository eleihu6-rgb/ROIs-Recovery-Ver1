import { and, asc, eq, gte, inArray, lt, notExists, notInArray, or, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import profile from '../../config/roundtrip-profile.json'
import { base } from '../../models/base/base.js'
import { fleet } from '../../models/base/fleet.js'
import { rank } from '../../models/base/rank.js'
import { flight } from '../../models/flight/flight.js'
import { pairing } from '../../models/pairing/pairing.js'
import { pairingSegment } from '../../models/pairing/pairing-segment.js'
import { notDeleted } from '../../utils/db.js'
import { pairingBuildService } from './pairing-build-service.js'
import { buildFlightLinks, chooseRotations, isRoundtripFlightCancelled, linkScope, roundtripError, roundtripScopeSchema, scopeBounds, scopeFleetMatches, toRoundtripFlight, validateRotation, type Rotation, type RoundtripFlight, type RoundtripScope } from './roundtrip-chooser.js'

export const roundtripService = {
  async options(fastify: FastifyInstance) {
    const [bases, fleets, ranks] = await Promise.all([
      fastify.db.select({ code: base.base }).from(base).orderBy(asc(base.displayOrder)),
      fastify.db.select({ code: fleet.fleet, body: fleet.body }).from(fleet).orderBy(asc(fleet.displayOrder)),
      fastify.db.select({ code: rank.rank }).from(rank).where(and(eq(rank.division, 'P'), eq(rank.isActingRank, 1))).orderBy(asc(rank.displayOrder)),
    ])
    return { bases: [...new Set(bases.map(b => b.code))], fleets: fleets.map(f => f.code), ranks: ranks.map(r => r.code), defaults: profile.defaults, composition: profile.composition, narrowFleets: fleets.filter(f => f.body === 'N' || profile.narrowFleetPatterns.some(pattern => new RegExp(pattern).test(f.code))).map(f => f.code) }
  },
  async validateScope(fastify: FastifyInstance, input: RoundtripScope): Promise<RoundtripScope> {
    const parsed = roundtripScopeSchema.safeParse(input)
    if (!parsed.success) throw roundtripError(parsed.error.message)
    const scope = parsed.data
    scopeBounds(scope)
    const options = await this.options(fastify)
    if (!options.bases.includes(scope.base) || scope.fleets.some((f) => f !== 'ALL' && !options.fleets.includes(f))) throw roundtripError('Select a valid base and fleet')
    if (new Set(scope.composition.map(c => c.rank)).size !== scope.composition.length || scope.composition.some(c => !options.ranks.includes(c.rank)) || !scope.composition.some(c => c.plan > 0)) throw roundtripError('Select valid, unique crew ranks and positive composition')
    return scope
  },
  async search(fastify: FastifyInstance, input: RoundtripScope) {
    const scope = await this.validateScope(fastify, input)
    const bounds = scopeBounds(scope)
    const linkBounds = scopeBounds(linkScope(scope))
    const covered = fastify.db.select({ id: pairingSegment.id }).from(pairingSegment)
      .innerJoin(pairing, and(eq(pairing.id, pairingSegment.pairingId), notDeleted(pairing.isDeleted)))
      .where(and(eq(pairingSegment.fltId, flight.id), eq(pairing.division, 'P'), notDeleted(pairingSegment.isDeleted), or(isNull(pairingSegment.segAssignment), notInArray(pairingSegment.segAssignment, ['DH', 'DHD']))))
    const rows = await fastify.db.select().from(flight).where(and(
      scope.fleets.includes('ALL') ? undefined : inArray(flight.fleet, scope.fleets), notDeleted(flight.isDeleted),
      gte(flight.schDepDtUtc, linkBounds.start), lt(flight.schArvDtUtc, linkBounds.end), notExists(covered),
    )).orderBy(asc(flight.schDepDtUtc), asc(flight.id)).limit(profile.limits.maxFlights + 1)
    if (rows.length > profile.limits.maxFlights) throw roundtripError('Too many flights; narrow the selected date range')
    const activeRows = rows.filter(f => !isRoundtripFlightCancelled(f))
    const baseAirlines = new Set(activeRows.filter(f => f.depArp === scope.base).map(f => f.airline))
    const inScope = (f: typeof activeRows[number]): boolean => f.schDepDtUtc >= bounds.start && f.schArvDtUtc < bounds.end
    const linkFlights = activeRows.filter(f => baseAirlines.has(f.airline) && scopeFleetMatches(scope, f.fleet)).map(toRoundtripFlight)
    const flights = activeRows.filter(f => inScope(f) && baseAirlines.has(f.airline) && scopeFleetMatches(scope, f.fleet)).map(toRoundtripFlight)
    const rotations = chooseRotations(flights, scope)
    const links = buildFlightLinks(linkFlights, rotations, scope)
    const scopeFlightIds = new Set(flights.map(f => f.id))
    const linkedFlights = Object.fromEntries(linkFlights.filter(f => !scopeFlightIds.has(f.id)).map(f => [f.id, f]))
    const byId = new Map(linkFlights.map(f => [f.id, f]))
    const expandedScope = linkScope(scope)
    const selectionRotations: Record<number, Rotation> = {}
    for (const flight of flights) {
      const preferred = links[flight.id]?.find(link => link.preferred)
      const linkFlight = preferred ? byId.get(preferred.flightId) : undefined
      if (!linkFlight || rotations.some(rotation => rotation.flightIds.includes(flight.id))) continue
      const sequence: RoundtripFlight[] = linkFlight.schArvDtUtc <= flight.schDepDtUtc ? [linkFlight, flight] : [flight, linkFlight]
      try {
        selectionRotations[flight.id] = validateRotation(sequence, expandedScope)
      } catch {
        // Link chips may be informative even when a two-leg direct preview is not a buildable rotation.
      }
    }
    return { flights, linkedFlights, rotations, selectionRotations, links }
  },
  async build(fastify: FastifyInstance, input: RoundtripScope, flightIds: number[], username: string) {
    const scope = await this.validateScope(fastify, input)
    return pairingBuildService.build(fastify, flightIds, username, linkScope(scope))
  },
}
