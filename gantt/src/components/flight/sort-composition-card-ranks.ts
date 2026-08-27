/** Display order for Flight Composition cards (cockpit → cabin lead → cabin). */
export const COMPOSITION_CARD_RANK_ORDER = ['CA', 'FO', 'IFD', 'FA'] as const

/**
 * Sort composition rank keys: CA, FO, IFD, FA, then any other ranks A–Z.
 */
export const sortCompositionCardRanks = (ranks: string[]): string[] => {
  const order = new Map<string, number>(
    COMPOSITION_CARD_RANK_ORDER.map((r, i) => [r, i]),
  )
  return [...ranks].sort((a, b) => {
    const ai = order.get(a)
    const bi = order.get(b)
    if (ai !== undefined && bi !== undefined) return ai - bi
    if (ai !== undefined) return -1
    if (bi !== undefined) return 1
    return a.localeCompare(b)
  })
}
