// Fetch ALL work items of PBS Dev Team via Plane API (in-page fetch so cookies apply).
import pw from '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/e2e/node_modules/playwright/index.js'
import { writeFileSync } from 'node:fs'
const { chromium } = pw
const BASE = 'https://crew-f8-usva-tst.roiscloud.com'
const SLUG = 'flair'
const PROJECT = 'badd48f1-a48b-4457-95e0-e2cbf2941cb2'
const AUTH = new URL('../.auth/state.json', import.meta.url).pathname
const OUT = new URL('../out/', import.meta.url).pathname

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: AUTH })
const page = await ctx.newPage()
await page.goto(`${BASE}/${SLUG}/projects/${PROJECT}/issues/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2000)

const candidates = [
  `/api/workspaces/${SLUG}/projects/${PROJECT}/issues/?per_page=200`,
  `/api/v1/workspaces/${SLUG}/projects/${PROJECT}/issues/?per_page=200`,
]

let data = null
for (const path of candidates) {
  const res = await page.evaluate(async (p) => {
    try {
      const r = await fetch(p, { headers: { 'accept': 'application/json' } })
      const text = await r.text()
      return { status: r.status, ok: r.ok, body: text.slice(0, 200000) }
    } catch (e) { return { error: String(e) } }
  }, path)
  console.log('TRY', path, '->', res.status || res.error)
  if (res.ok) {
    try { data = JSON.parse(res.body); data.__path = path; break } catch { console.log('parse fail, head:', res.body.slice(0, 300)) }
  } else if (res.body) {
    console.log('  head:', res.body.slice(0, 200))
  }
}

if (data) {
  writeFileSync(OUT + 'items-raw.json', JSON.stringify(data, null, 2))
  const list = data.results || data.issues || (Array.isArray(data) ? data : [])
  console.log('count:', list.length, 'total_count:', data.total_count, 'next:', data.next_cursor || data.next)
  for (const it of list.slice(0, 5)) console.log('SAMPLE KEYS:', Object.keys(it))
} else {
  console.log('No JSON from API. Falling back: dumping issue links from DOM.')
}
await browser.close()
