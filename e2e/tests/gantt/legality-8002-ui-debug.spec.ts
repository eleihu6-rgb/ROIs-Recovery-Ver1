import { test } from '@playwright/test'
import { seedGanttAuth, gotoGantt } from '../../utils/gantt-hook'

test('Legal-6006 — observe gantt violations request after YYZ filter', async ({ page, request }) => {
  await seedGanttAuth(page, request)

  const reqs: string[] = []
  const resp: number[] = []
  page.on('request', (r) => { if (r.url().includes('/api/violations')) reqs.push(r.url()) })
  page.on('response', async (r) => {
    if (r.url().includes('/api/violations')) { try { resp.push(((await r.json()).data ?? []).length) } catch { /* */ } }
  })

  await gotoGantt(page)
  await page.evaluate(async () => {
    const t = (window as unknown as { __ganttTest?: { applyCrewFilter?: (f: { bases: string[] }) => Promise<void> } }).__ganttTest
    await t?.applyCrewFilter?.({ bases: ['YYZ'] })
  })
  await page.waitForTimeout(5000)

  const fs = await import('node:fs')
  for (const u of reqs) {
    const q = new URL(u).searchParams
    const crew = (q.get('crewIds') ?? '').split(',').filter(Boolean)
    console.log('REQ group=%s start=%s end=%s crewCount=%d has998=%s',
      q.get('groupCode'), q.get('start'), q.get('end'), crew.length, crew.includes('998'))
    if (crew.includes('998')) fs.writeFileSync('/tmp/gantt_viol_req.txt', u)
  }
  console.log('responses (item counts):', JSON.stringify(resp))

  const info = await page.evaluate(() => {
    const t = (window as unknown as { __ganttTest?: { roster?: () => Array<{ crewId?: string }>; liveViolations?: () => unknown[] } }).__ganttTest
    const roster = t?.roster?.() ?? []
    const crew = Array.from(new Set(roster.map((r) => r.crewId).filter(Boolean)))
    return { crewLoaded: crew.length, has998: crew.includes('998'), liveViol: (t?.liveViolations?.() ?? []).length }
  })
  console.log('ROSTER:', JSON.stringify(info))
})
