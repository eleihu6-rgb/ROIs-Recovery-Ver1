import 'dotenv/config'
import pg from 'pg'
import { recompute } from '../src/services/manday/manday-tool.js'
import { liveMandayRefreshUsage, parseArgs, resolveWindow } from '../src/services/manday/live-manday-refresh-cli.js'
import { liveSchemaName } from '../src/utils/db-schema.js'

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const { startDt, endDt } = resolveWindow(args)
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required')

  const pool = new pg.Pool({ connectionString, max: 2 })
  try {
    const result = await recompute(pool, {
      schema: liveSchemaName(),
      startDt,
      endDt,
      updatedBy: 'cron:live-manday-refresh',
    })
    console.log(JSON.stringify({ startDt, endDt, ...result }))
  } finally {
    await pool.end()
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    console.error(liveMandayRefreshUsage())
    process.exit(1)
  })
}
