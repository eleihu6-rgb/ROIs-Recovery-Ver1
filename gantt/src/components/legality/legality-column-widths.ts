/** Defaults / clamps for Legality Rule Sets three-column layout. */
export const LEGALITY_CATALOG_WIDTH_DEFAULT = 160
export const LEGALITY_SETS_WIDTH_DEFAULT = 256

export const LEGALITY_CATALOG_WIDTH_MIN = 160
export const LEGALITY_CATALOG_WIDTH_MAX = 420
export const LEGALITY_SETS_WIDTH_MIN = 180
export const LEGALITY_SETS_WIDTH_MAX = 480

export const clampLegalityCatalogWidth = (width: number): number =>
  Math.min(LEGALITY_CATALOG_WIDTH_MAX, Math.max(LEGALITY_CATALOG_WIDTH_MIN, Math.round(width)))

export const clampLegalitySetsWidth = (width: number): number =>
  Math.min(LEGALITY_SETS_WIDTH_MAX, Math.max(LEGALITY_SETS_WIDTH_MIN, Math.round(width)))

/** Apply a horizontal drag delta to a column width with clamp. */
export const applyLegalityColumnDrag = (
  current: number,
  dx: number,
  clamp: (width: number) => number,
): number => clamp(current + dx)
