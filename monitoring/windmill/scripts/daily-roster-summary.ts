// monitoring/windmill/scripts/daily-roster-summary.ts
// This script runs in Windmill's Deno runtime.
// Deploy via Windmill UI: Workspace "rois" → Scripts → New Script → TypeScript (Deno)

// Variables set in Windmill workspace:
//   ROIS_DATABASE_URL: postgresql://<user>:<password>@<db-host>:5432/rois?options=-c%20search_path%3D<schema>
//   WECHAT_WEBHOOK_URL: https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...

export async function main(
  db_url: string,
  webhook_url: string,
) {
  // Query yesterday's roster stats
  const { Client } = await import("npm:pg@8")
  const client = new Client(db_url)
  await client.connect()

  const { rows } = await client.query<{ local_date: string; total: string; cancelled: string }>(`
    SELECT
      local_date::text,
      COUNT(*) AS total,
      SUM(CASE WHEN is_deleted = 1 THEN 1 ELSE 0 END) AS cancelled
    FROM roster_flight
    WHERE local_date = CURRENT_DATE - 1
    GROUP BY local_date
  `)
  await client.end()

  const stats = rows[0] ?? { local_date: 'N/A', total: '0', cancelled: '0' }
  const message = `[ROIS-AI] Roster Summary ${stats.local_date}: ${stats.total} flights, ${stats.cancelled} cancelled`

  // Push to WeChat Work webhook
  await fetch(webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'text', text: { content: message } }),
  })

  return { stats, message }
}
