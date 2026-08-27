/**
 * Format a crew seniority value for display.
 *
 * `crew.seniority_num` is `numeric(10,2)`, returned by Drizzle as a string
 * (e.g. "1234.00"). Whole numbers are shown without the trailing ".00";
 * a meaningful fractional part is preserved.
 */
export const formatSeniority = (value: string | null | undefined): string => {
  if (value == null || value === '') return ''
  return value.replace(/\.0+$/, '')
}
