/**
 * Normalizes rank codes from F8 format to standard ROIS format.
 * CAP/CP → CA (Captain)
 * FO remains FO (First Officer)
 */
export const normalizeRank = (rank: string): string => {
  if (rank === 'CAP' || rank === 'CP') return 'CA'
  return rank
}