/** 分批并发的进度序列：N 批完成时依次为 100/N, 200/N, ..., 100。 */
export const batchProgresses = (batchCount: number, totalItems: number): number[] => {
  if (totalItems <= 0 || batchCount <= 0) return []
  return Array.from({ length: batchCount }, (_, i) => Math.round(((i + 1) / batchCount) * 100))
}
