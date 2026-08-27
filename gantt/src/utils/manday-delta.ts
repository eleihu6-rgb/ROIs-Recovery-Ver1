import type { RosterItem } from '@/types/roster'
import type { RosterPeriodOption } from '@/services/roster-period-api'
import { rpForTimestamp } from '@/hooks/use-current-rp'

/**
 * Optimistic per-crew delta for ALL seven manday KPIs (the same Tier-1 instant-feedback
 * treatment RpCred already had, generalized). delta = kpis(virtual) − kpis(base); add it to the
 * server's authoritative `CrewStats` so the editing user sees correct KPIs before Save persists
 * them (the server then recomputes + broadcasts the authoritative values — see manday-tool.ts).
 *
 * Bucketing is by ROSTER PERIOD (not calendar month): each duty's date maps to its RP via
 * rpItems, matching the crew_manday_*_period grain the server stats now use.
 *
 * Exact from roster items: mcred (credit), mdo/ydo (day-off day count), mal/yal (leave day count).
 * Proxy: mbh/ybh (block hours) — RosterItem carries no block minutes, so the flying duty's
 * credited minutes stand in (block ≈ credit at FT 1.0); the server reconciles the real
 * flight.blk_min sum on Save.
 */
export interface MandayKpiDelta {
  mcred: number // period credit (minutes)
  mbh: number   // period block (minutes, credit proxy)
  ybh: number   // year block (minutes, credit proxy)
  mdo: number   // period day-off count
  ydo: number   // year day-off count
  mal: number   // period leave count
  yal: number   // year leave count
}

const sumMap = (m: Map<string, number>): number => {
  let t = 0
  for (const v of m.values()) t += v
  return t
}

const rpOf = (rpItems: readonly RosterPeriodOption[], dateStr: string): string | null => {
  const ms = Date.parse(`${dateStr}T00:00:00.000Z`)
  return Number.isNaN(ms) ? null : (rpForTimestamp(rpItems, ms)?.rosterPeriod ?? null)
}

/** The seven KPI values for ONE crew's roster items, for the given roster period + its year. */
const kpisForCrew = (
  items: RosterItem[],
  rosterPeriod: string,
  rpItems: readonly RosterPeriodOption[],
): MandayKpiDelta => {
  const year = rosterPeriod.slice(0, 4)
  const flyRp = new Map<string, number>() // dedup flying credit by pairing:duty
  const flyYear = new Map<string, number>()
  const doRp = new Set<string>()
  const doYear = new Set<string>()
  const alRp = new Set<string>()
  const alYear = new Set<string>()
  for (const it of items) {
    const d = it.schStrDtUtc
    if (!d || d.slice(0, 4) !== year) continue
    const date = d.slice(0, 10)
    const inRp = rpOf(rpItems, date) === rosterPeriod
    if (it.pairingId != null) {
      const v = it.dutyActCreditedMinutes != null ? Math.round(Number(it.dutyActCreditedMinutes)) : 0
      if (!Number.isFinite(v)) continue
      const key = `${it.pairingId}:${it.dutySeq ?? 0}`
      flyYear.set(key, v)
      if (inRp) flyRp.set(key, v)
    } else {
      const code = (it.assignment ?? '').toUpperCase()
      if (code === 'DO') { doYear.add(date); if (inRp) doRp.add(date) }
      else if (code === 'VAC' || code === 'ILL') { alYear.add(date); if (inRp) alRp.add(date) }
    }
  }
  return {
    mcred: sumMap(flyRp),
    mbh: sumMap(flyRp),
    ybh: sumMap(flyYear),
    mdo: doRp.size,
    ydo: doYear.size,
    mal: alRp.size,
    yal: alYear.size,
  }
}

const bucketByCrew = (items: RosterItem[]): Map<string, RosterItem[]> => {
  const m = new Map<string, RosterItem[]>()
  for (const it of items) {
    const a = m.get(it.crewId)
    if (a) a.push(it)
    else m.set(it.crewId, [it])
  }
  return m
}

export const crewMandayDelta = (
  baseItems: RosterItem[],
  virtualItems: RosterItem[],
  rosterPeriod: string,
  rpItems: readonly RosterPeriodOption[],
): Map<string, MandayKpiDelta> => {
  const baseByCrew = bucketByCrew(baseItems)
  const virtByCrew = bucketByCrew(virtualItems)
  const out = new Map<string, MandayKpiDelta>()
  for (const cid of new Set<string>([...baseByCrew.keys(), ...virtByCrew.keys()])) {
    const b = kpisForCrew(baseByCrew.get(cid) ?? [], rosterPeriod, rpItems)
    const v = kpisForCrew(virtByCrew.get(cid) ?? [], rosterPeriod, rpItems)
    const d: MandayKpiDelta = {
      mcred: v.mcred - b.mcred,
      mbh: v.mbh - b.mbh,
      ybh: v.ybh - b.ybh,
      mdo: v.mdo - b.mdo,
      ydo: v.ydo - b.ydo,
      mal: v.mal - b.mal,
      yal: v.yal - b.yal,
    }
    if (d.mcred || d.mbh || d.ybh || d.mdo || d.ydo || d.mal || d.yal) out.set(cid, d)
  }
  return out
}
