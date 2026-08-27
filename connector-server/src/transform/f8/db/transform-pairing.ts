import type { PairingImportRecord, PairingDutyRecord, PairingSegmentRecord } from '../../../types/import-jobs.js'
import { normalizeAssignment, normalizeRank } from './normalize.js'

const toNum = (v: unknown): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const toIso = (v: string | null | undefined): string =>
  v ? new Date(String(v).replace(' ', 'T')).toISOString() : ''

const toInt = (v: unknown): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

const nodeKind = (n: Record<string, unknown>): string =>
  String(n['node'] ?? '').replace('_', '').trim().toLowerCase()

const getDutyList = (raw: Record<string, unknown>): Record<string, unknown>[] =>
  (raw['pairingDutyList'] as Record<string, unknown>[] | undefined)
  ?? (raw['pairingDuties'] as Record<string, unknown>[] | undefined)
  ?? (raw['duties'] as Record<string, unknown>[] | undefined)
  ?? []

const getDutyNodes = (duty: Record<string, unknown>): Record<string, unknown>[] =>
  (duty['pairingDutyNodes'] as Record<string, unknown>[] | undefined)
  ?? (duty['nodes'] as Record<string, unknown>[] | undefined)
  ?? []

const getDutySegments = (duty: Record<string, unknown>): Record<string, unknown>[] =>
  (duty['pairingDutySegments'] as Record<string, unknown>[] | undefined)
  ?? (duty['segments'] as Record<string, unknown>[] | undefined)
  ?? []

const getNodeTime = (n: Record<string, unknown>, key: string): string =>
  toIso((n[key] ?? n[key.replace('Utc', '_utc')]) as string)

function expandNodes(
  rawNodes: Record<string, unknown>[],
  strArp: string,
  endArp: string,
): Partial<PairingDutyRecord> {
  const kinds = new Set(rawNodes.map(nodeKind))
  let nodes = rawNodes

  if (kinds.has('checkin') && kinds.has('checkout') && !kinds.has('pickup')) {
    const ci = rawNodes.find(n => nodeKind(n) === 'checkin')!
    const co = rawNodes.find(n => nodeKind(n) === 'checkout')!
    // Latest API no longer sends an `arp` fallback — use `airport` then duty arp.
    const ciAp = String(ci['airport'] ?? strArp)
    const coAp = String(co['airport'] ?? endArp)
    const ciS = getNodeTime(ci, 'startUtc')
    const ciE = getNodeTime(ci, 'endUtc')
    const coS = getNodeTime(co, 'startUtc')
    const coE = getNodeTime(co, 'endUtc')
    nodes = [
      { node: 'PICKUP', airport: ciAp, startUtc: ciS, endUtc: ciS },
      { node: 'BRIEF', airport: ciAp, startUtc: ciS, endUtc: ciE },
      { node: 'DEBRIEF', airport: coAp, startUtc: coS, endUtc: coE },
      { node: 'DROPOFF', airport: coAp, startUtc: coE, endUtc: coE },
    ]
  }

  const result: Partial<PairingDutyRecord> = {}
  for (const n of nodes) {
    const k = nodeKind(n)
    const s = getNodeTime(n, 'startUtc')
    const e = getNodeTime(n, 'endUtc')
    if (!s && !e) continue
    const start = s || e
    const end = e || s
    if (k === 'pickup') { result.pickupStartUtc = start; result.pickupEndUtc = end }
    if (k === 'brief') { result.briefStartUtc = start; result.briefEndUtc = end }
    if (k === 'debrief') { result.debriefStartUtc = start; result.debriefEndUtc = end }
    if (k === 'dropoff') { result.dropoffStartUtc = start; result.dropoffEndUtc = end }
  }
  return result
}

function deriveDivision(p: Record<string, unknown>): string {
  const div = String(p['division'] ?? '').trim().toUpperCase().slice(0, 1)
  if (div === 'P' || div === 'C') return div
  const comps = (p['pairingCompositions'] as Record<string, unknown>[] | undefined) ?? []
  const hasCabin = comps.some(
    c => !['CA', 'FO'].includes(normalizeRank(String(c['actingRank'] ?? ''))),
  )
  return hasCabin ? 'C' : 'P'
}

export function transformF8Pairings(raw: unknown[]): PairingImportRecord[] {
  const records: PairingImportRecord[] = []

  for (const item of raw) {
    const p = item as Record<string, unknown>
    const interfaceId = String(p['pairingId'] ?? '')
    if (!interfaceId) continue

    const rawDuties = getDutyList(p)
    const duties: PairingDutyRecord[] = []

    rawDuties.forEach((duty, di) => {
      const rawSegs = getDutySegments(duty)
      const rawNodes = getDutyNodes(duty)
      const strArp = String(duty['strArp'] ?? duty['str_arp'] ?? '')
      // Latest API drops the `arrArp` alias — use `endArp`/`end_arp` only.
      const endArp = String(duty['endArp'] ?? duty['end_arp'] ?? '')
      const dutyActStr = toIso((duty['actStrDtUtc'] ?? duty['act_str_dt_utc']) as string)
      const dutyActEnd = toIso((duty['actEndDtUtc'] ?? duty['act_end_dt_utc']) as string)

      const nodeFields = expandNodes(rawNodes, strArp, endArp)

      const segments: PairingSegmentRecord[] = rawSegs.map((seg, si) => {
        const rawFn = String(seg['fltNum'] ?? '')
        // Extract airline prefix (letter + letter-or-digit) from fltNum, e.g. "F87211" → airline="F8", fltNum="7211"
        const fnMatch = rawFn.match(/^([A-Za-z][A-Za-z0-9])(\d.*)$/)
        const rawAirline = String(seg['airline'] ?? '').trim().toUpperCase()
        const segAirline = fnMatch ? fnMatch[1].toUpperCase() : (rawAirline || 'F8')
        const segFltNum = fnMatch ? fnMatch[2] : rawFn
        return {
        segSeq: si + 1,
        interfaceFltId: seg['fltId'] ? String(seg['fltId']) : null,
        fltNum: segFltNum,
        airline: segAirline,
        depArp: String(seg['depArp'] ?? seg['dep_arp'] ?? ''),
        arvArp: String(seg['arvArp'] ?? seg['arv_arp'] ?? ''),
        fleet: String(seg['fleet'] ?? ''),
        schStrDtUtc: toIso((seg['schStrDtUtc'] ?? seg['sch_str_dt_utc'] ?? seg['stdUtc']) as string)
          || toIso(seg['actStrDtUtc'] as string)
          || dutyActStr,
        schEndDtUtc: toIso((seg['schEndDtUtc'] ?? seg['sch_end_dt_utc'] ?? seg['staUtc']) as string)
          || toIso(seg['actEndDtUtc'] as string)
          || dutyActEnd,
        actStrDtUtc: toIso((seg['actStrDtUtc']) as string) || dutyActStr,
        actEndDtUtc: toIso((seg['actEndDtUtc']) as string) || dutyActEnd,
        segAssignment: normalizeAssignment(String(seg['assignment'] ?? 'FLY')),
        isLongTransit: toInt(seg['isLongTransit']),
        fltDt: seg['fltDt'] ? String(seg['fltDt']).slice(0, 10) : null,
        }
      })

      const dutySchStr = dutyActStr
        || segments[0]?.schStrDtUtc
        || nodeFields.briefStartUtc
        || nodeFields.pickupStartUtc
        || ''
      const dutySchEnd = dutyActEnd
        || segments[segments.length - 1]?.schEndDtUtc
        || nodeFields.debriefEndUtc
        || nodeFields.dropoffEndUtc
        || dutySchStr

      duties.push({
        dutySeq: di + 1,
        strArp,
        endArp,
        schStrDtUtc: dutySchStr,
        schEndDtUtc: dutySchEnd,
        actStrDtUtc: dutySchStr,
        actEndDtUtc: dutySchEnd,
        creditedMinutes: toInt(duty['creditedMinutes'] ?? duty['credited_minutes']),
        fdpDiscretionMin: toInt(duty['fdpDiscretionMin']),
        maxFdpMin: toInt(duty['maxFdpMin']),
        minRestMin: toInt(duty['minRestMin']),
        actRestMin: toInt(duty['actRestMin']),
        layoverNits: toInt(duty['layoverNits']),
        planFlightMin: toInt(duty['planFlightMin']),
        planFdpMin: toInt(duty['planFdpMin']),
        actFlightMin: toInt(duty['actFlightMin']),
        actFdpMin: toInt(duty['actFdpMin']),
        actualDutyMinutes: toInt(duty['actualDutyMinutes']),
        briefMin: toInt(duty['briefMin']),
        debriefMin: toInt(duty['debriefMin']),
        comments: String(duty['comments'] ?? '').slice(0, 255),
        ...nodeFields,
        segments,
      })
    })

    // Prefer API top-level sch/act timestamps; fall back to first/last duty.
    const schStr = toIso(p['schStrDtUtc'] as string)
      || duties[0]?.actStrDtUtc || toIso(p['pairingDt'] as string)
    const schEnd = toIso(p['schEndDtUtc'] as string)
      || duties[duties.length - 1]?.actEndDtUtc || schStr
    const actStr = toIso(p['actStrDtUtc'] as string) || schStr
    const actEnd = toIso(p['actEndDtUtc'] as string) || schEnd

    const computedTafbDays = schStr && schEnd
      ? Math.max(0, Math.floor((new Date(schEnd).getTime() - new Date(schStr).getTime()) / 86_400_000))
      : 0
    // F8 interface already sends TAFB when available. If it is missing, fall back to the
    // explicit duration field, then derive the day count from the schedule span.
    const tafb = toInt(p['tafb']) || toInt(p['durationDays']) || computedTafbDays

    records.push({
      interfaceId,
      pairingLabel: (p['label'] as string) ?? null,
      base: String(p['base'] ?? ''),
      fleet: String(p['fleet'] ?? ''),
      division: deriveDivision(p),
      assignmentGroup: String(p['assignmentGroup'] ?? 'FLY'),
      assignment: String(p['assignment'] ?? 'FLY'),
      schStrDtUtc: schStr,
      schEndDtUtc: schEnd,
      actStrDtUtc: actStr,
      actEndDtUtc: actEnd,
      durationDays: toInt(p['durationDays']) || 1,
      tafb,
      comments: String(p['comments'] ?? '').slice(0, 120),
      perDiemMins: toInt(p['perDiemMins']),
      perDiemMinsAdjustment: toInt(p['perDiemMinsAdjustment']),
      fmLhPerDiemMins: toInt(p['fmLhPerDiemMins']),
      wpMins: toInt(p['wpMins']),
      wpMinsAdjustment: toInt(p['wpMinsAdjustment']),
      source: 'F8',
      duties,
      compositions: ((p['pairingCompositions'] as Record<string, unknown>[] | undefined) ?? [])
        .map(c => ({
          rank: normalizeRank(String(c['actingRank'] ?? c['acting_rank'] ?? '')),
          plan: Math.trunc(toNum(c['planValue'] ?? c['plan_value'] ?? c['plan'])),
        }))
        .filter(c => c.rank.length > 0 && c.plan > 0),
    })
  }

  return records
}
