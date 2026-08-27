import { eq, or, isNull } from 'drizzle-orm'
import type { Column } from 'drizzle-orm'

/**
 * Match rows where a smallint column is 0 or NULL.
 *
 * Use in place of `eq(col, 0)` for is_deleted columns — handles data
 * imported directly into the DB without an explicit default value.
 *
 * Example:
 *   .where(and(notDeleted(flight.isDeleted), between(...)))
 */
export const notDeleted = (col: Column) => or(eq(col, 0), isNull(col))!
