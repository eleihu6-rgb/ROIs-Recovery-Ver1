// Fetch description_html for every PBS Dev Team item and flag those with Chinese text.
import pw from '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/e2e/node_modules/playwright/index.js'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
const { chromium } = pw

const BASE = 'https://crew-f8-usva-tst.roiscloud.com'
const SLUG = 'flair'
const PROJECT = 'badd48f1-a48b-4457-95e0-e2cbf2941cb2'
const AUTH = fileURLToPath(new URL('../.auth/state.json', import.meta.url))
const OUT = fileURLToPath(new URL('../out/', import.meta.url))
const HAN = /[一-鿿]/

const items = JSON.parse(readFileSync(OUT + 'items.json', 'utf8'))

const browser = await pw.chromium.launch({ headless: true })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: AUTH })
const page = await ctx.newPage()
await page.goto(`${BASE}/${SLUG}/projects/${PROJECT}/issues/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(1500)

const results = []
for (const it of items) {
  const r = await page.evaluate(async ({ slug, project, id }) => {
    const res = await fetch(`/api/workspaces/${slug}/projects/${project}/issues/${id}/`, { headers: { accept: 'application/json' } })
    const j = await res.json()
    return { desc: j.description_html || '', status: res.status }
  }, { slug: SLUG, project: PROJECT, id: it.id })

  const hasZh = HAN.test(r.desc)
  const preview = r.desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
  if (hasZh) {
    console.log(`PBS-${it.seq} [HAS ZH] ${preview}`)
    results.push({ seq: it.seq, id: it.id, name: it.name, desc: r.desc })
  }
  process.stdout.write('.')
  await page.waitForTimeout(150)
}

writeFileSync(OUT + 'zh-descs.json', JSON.stringify(results, null, 2))
console.log(`\n\nFound ${results.length} items with Chinese descriptions -> out/zh-descs.json`)
await browser.close()
