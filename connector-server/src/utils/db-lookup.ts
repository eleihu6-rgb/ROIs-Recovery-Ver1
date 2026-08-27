import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

export async function loadCrewSet(
  db: NodePgDatabase<Record<string, unknown>>,
): Promise<Set<string>> {
  const result = await db.execute(sql`SELECT crew_id FROM crew`)
  const rows = result.rows as Array<{ crew_id: string }>
  return new Set(rows.map(r => String(r.crew_id)))
}
