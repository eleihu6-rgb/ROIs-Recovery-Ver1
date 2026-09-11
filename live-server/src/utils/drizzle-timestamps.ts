/**
 * Drizzle's `timestamp` columns require a real `Date`: their driver mapper calls
 * `value.toISOString()`, so handing it the ISO **string** that arrives over JSON
 * (draft ops, REST bodies) throws `TypeError: value.toISOString is not a function`.
 *
 * Any date that survives the HTTP boundary therefore has to be revived before it
 * reaches a Drizzle `.set(...)` / `.values(...)`.
 */

/** Revive ISO date strings for the given fields; leaves Date/null/undefined untouched. */
export const coerceTimestampFields = <T extends Record<string, unknown>>(
  data: T,
  fields: readonly (keyof T & string)[],
): T => {
  const next: Record<string, unknown> = { ...data }
  for (const field of fields) {
    const value = next[field]
    if (typeof value !== 'string') continue
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) next[field] = parsed
  }
  return next as T
}
