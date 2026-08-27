/**
 * Legality rules whose findings are crew/period-level and should light the roster
 * crew-row bell (and Alert Center) but must NOT paint roster/pairing puck “!” badges
 * or appear in puck-hover tooltips.
 *
 * Persistence may still attach an anchor pairing_id so Live keeps the row; only the
 * puck severity maps / puck-mode tooltip filter these codes out.
 */
export const CREW_BELL_ONLY_RULES = new Set(['7505', '7507', '7508'])

export const isCrewBellOnlyRule = (ruleCode: string): boolean =>
  CREW_BELL_ONLY_RULES.has(ruleCode)
