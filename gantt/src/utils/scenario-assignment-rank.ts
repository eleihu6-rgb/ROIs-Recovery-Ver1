// gantt/src/utils/scenario-assignment-rank.ts
//
// Rank resolution for a scenario pairing assignment (drag pairing → crew).
//
// Rules (per product):
// 1. CrewRank 取任务日期当天有效的（eff_dt <= taskDate < exp_dt）；无 → block。
// 2. Pairing 需有 Open 槽位（plan > fill）；无 → block。
// 3. 多个有效 CrewRank：优先取与 Open 槽位 rank 匹配的（多个按 rank.display_order 最小）；
//    无匹配 → 取 eff_dt 最新的一条 → 跨职级。
// 4. 跨职级：actingRank = Open 槽位中 display_order 最小者的 rank。
import type { CrewRankRecord } from '@/types/crew'
import type { ScenarioCompositionSlot } from './scenario-composition-fill'

export type ResolvedRank =
  | { status: 'no-valid-rank' }
  | { status: 'no-open-position' }
  | { status: 'ok'; actingRank: string; crossRank: boolean }

export function resolveAssignmentRank(input: {
  crewRanks: CrewRankRecord[]
  openSlots: ScenarioCompositionSlot[]
  taskDate: Date
  rankOrder: Map<string, number>
}): ResolvedRank {
  const { crewRanks, openSlots, taskDate, rankOrder } = input
  const valid = crewRanks
    .filter((r) => {
      const eff = new Date(r.effDt).getTime()
      const exp = r.expDt ? new Date(r.expDt).getTime() : Number.POSITIVE_INFINITY
      return eff <= taskDate.getTime() && taskDate.getTime() < exp
    })
    .sort((a, b) => new Date(a.effDt).getTime() - new Date(b.effDt).getTime())
  if (valid.length === 0) return { status: 'no-valid-rank' }
  if (openSlots.length === 0) return { status: 'no-open-position' }

  const byOrder = (a: string, b: string): number =>
    (rankOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (rankOrder.get(b) ?? Number.MAX_SAFE_INTEGER)

  // 优先取与 Open 槽位匹配的 valid rank；多个匹配按 display_order 最小。
  const openRankSet = new Set(openSlots.map((s) => s.rank))
  const matched = valid.filter((r) => openRankSet.has(r.rank)).sort((a, b) => byOrder(a.rank, b.rank))
  if (matched.length > 0) return { status: 'ok', actingRank: matched[0].rank, crossRank: false }

  // 无匹配 → 跨职级，填 Open 槽位中 display_order 最小者（用户规则：ActingRank = Pairing Open 位置）。
  const target = [...openSlots].sort((a, b) => byOrder(a.rank, b.rank))[0].rank
  return { status: 'ok', actingRank: target, crossRank: true }
}
