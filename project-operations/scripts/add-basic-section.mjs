// add-basic-section.mjs
// Inserts a "Basic (June 2026)" section BEFORE "Things To-Do" in PBS-117..128.
// Data sourced live from the F8 remote DB (queried 2026-06-18):
//   - Crew counts by base & rank (crew_base × crew_rank, eff June 2026)
//   - FLY pairing count (pairing WHERE assignment='FLY', pairing_dt in June 2026)
//   - Avg credit: pilots from crew_manday_fd_monthly, CC from crew_manday_cc_am_monthly
//
// Run:
//   node scripts/add-basic-section.mjs

import { existsSync } from 'node:fs'
import path from 'node:path'

const BASE_URL = 'https://crew-f8-usva-tst.roiscloud.com'
const SLUG = 'flair'
const PROJECT = 'badd48f1-a48b-4457-95e0-e2cbf2941cb2'
const PW_PATH =
  '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/e2e/node_modules/playwright/index.js'
const HOME =
  process.env.PLANE_HOME ||
  '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/project-operations/.auth'
const STATE = path.join(HOME, 'state.json')

// ─── Live DB data (queried 2026-06-18, June 2026 period) ─────────────────────
// crew_base (is_prime_base=1, eff in June 2026) × crew_rank (eff in June 2026)
// pairing WHERE assignment='FLY', pairing_dt 2026-06-01..2026-06-30
// credit: fd_monthly for pilots (CA/FO), cc_am_monthly for cabin crew (FA/IFD)

const ITEMS = [
  {
    seq: 117, id: '8e848085-0a77-4982-a8df-22397433387e',
    base: 'YVR', crewType: 'Pilot', slug: 'YVR-Pilot',
    ranks: [{ rank: 'CA', count: 40 }, { rank: 'FO', count: 31 }],
    flyPairings: 424,
    avgCreditHrs: 67.5,
  },
  {
    seq: 118, id: '5cec9568-5639-42fb-86e2-40177e053206',
    base: 'YVR', crewType: 'Cabin Crew', slug: 'YVR-Cabin',
    ranks: [{ rank: 'FA', count: 113 }, { rank: 'IFD', count: 32 }],
    flyPairings: 424,
    avgCreditHrs: 74.7,
  },
  {
    seq: 119, id: '7ec3ced5-1302-4541-b3a7-be2c1d957b29',
    base: 'YYC', crewType: 'Pilot', slug: 'YYC-Pilot',
    ranks: [{ rank: 'CA', count: 29 }, { rank: 'FO', count: 18 }],
    flyPairings: 237,
    avgCreditHrs: 45.0,
  },
  {
    seq: 120, id: 'b883dca3-8f97-4cc4-a595-50d2911023a3',
    base: 'YYC', crewType: 'Cabin Crew', slug: 'YYC-Cabin',
    ranks: [{ rank: 'FA', count: 43 }, { rank: 'IFD', count: 14 }],
    flyPairings: 237,
    avgCreditHrs: 68.7,
  },
  {
    seq: 121, id: 'ba47d5f9-3ef7-4cb8-b174-5c81427132a2',
    base: 'YEG', crewType: 'Pilot', slug: 'YEG-Pilot',
    ranks: [{ rank: 'CA', count: 15 }, { rank: 'FO', count: 11 }],
    flyPairings: 243,
    avgCreditHrs: 12.6,
  },
  {
    seq: 122, id: '00032962-5b9a-458d-a8da-9e08056336ae',
    base: 'YEG', crewType: 'Cabin Crew', slug: 'YEG-Cabin',
    ranks: [{ rank: 'FA', count: 45 }, { rank: 'IFD', count: 17 }],
    flyPairings: 243,
    avgCreditHrs: 22.4,
  },
  {
    seq: 123, id: '2b4cd5e5-1938-4f68-bfd0-056e8bcf992e',
    base: 'YYZ', crewType: 'Pilot', slug: 'YYZ-Pilot',
    ranks: [{ rank: 'CA', count: 67 }, { rank: 'FO', count: 47 }],
    flyPairings: 855,
    avgCreditHrs: 70.3,
  },
  {
    seq: 124, id: 'ea6a5d05-0fd0-45e2-8af5-bc3a6ca52777',
    base: 'YYZ', crewType: 'Cabin Crew', slug: 'YYZ-Cabin',
    ranks: [{ rank: 'FA', count: 194 }, { rank: 'IFD', count: 61 }],
    flyPairings: 855,
    avgCreditHrs: 83.9,
  },
  {
    seq: 125, id: '429a0554-f5a7-4f53-b6fd-c83bf6392eab',
    base: 'YOW', crewType: 'Pilot', slug: 'YOW-Pilot',
    ranks: [{ rank: 'CA', count: 7 }, { rank: 'FO', count: 3 }],
    flyPairings: 16,
    avgCreditHrs: 67.9,
  },
  {
    seq: 126, id: 'c8d3e96c-1dda-40f8-b25c-3cc741ff7eb3',
    base: 'YOW', crewType: 'Cabin Crew', slug: 'YOW-Cabin',
    // No FA/IFD records for YOW in June 2026 live data
    ranks: [],
    flyPairings: 16,
    avgCreditHrs: null,
  },
  {
    seq: 127, id: '2d2ce0ae-3d32-4872-8b91-fd03393b9240',
    base: 'YUL', crewType: 'Pilot', slug: 'YUL-Pilot',
    ranks: [{ rank: 'CA', count: 9 }, { rank: 'FO', count: 4 }],
    flyPairings: 18,
    avgCreditHrs: 67.3,
  },
  {
    seq: 128, id: '6f1cd82c-fb4c-4287-a19c-b4c02d351cbb',
    base: 'YUL', crewType: 'Cabin Crew', slug: 'YUL-Cabin',
    // No FA/IFD records for YUL in June 2026 live data
    ranks: [],
    flyPairings: 18,
    avgCreditHrs: null,
  },
]

// ─── Build Basic HTML block ───────────────────────────────────────────────────
function buildBasicSection(item) {
  const { slug, base, crewType, ranks, flyPairings, avgCreditHrs } = item
  const totalCrew = ranks.reduce((s, r) => s + r.count, 0)
  const rankBreakdown = ranks.length
    ? ranks.map(r => `${r.rank}: ${r.count}`).join(', ')
    : 'no data in live DB for June 2026'
  const crewLine = totalCrew > 0
    ? `${totalCrew} (${rankBreakdown})`
    : rankBreakdown
  const creditLine = avgCreditHrs !== null
    ? `${avgCreditHrs} h (June 2026 actuals, sourced from live manday table)`
    : 'n/a — no cabin crew records at this base in June 2026 live data'

  let html = ''
  html += `<h2 class="editor-heading-block" data-id="h2-basic-${slug}">Basic (June 2026)</h2>`
  html += `<ul class="list-disc pl-7 space-y-(--list-spacing-y)" data-id="ul-basic-${slug}">`
  html += `<li class="not-prose space-y-2" data-id="li-basic-crew-${slug}"><p class="editor-paragraph-block" data-id="p-basic-crew-${slug}"><strong>Total ${crewType} crew at ${base}:</strong> ${crewLine}</p></li>`
  html += `<li class="not-prose space-y-2" data-id="li-basic-pairing-${slug}"><p class="editor-paragraph-block" data-id="p-basic-pairing-${slug}"><strong>FLY pairings available (${base}, June 2026):</strong> ${flyPairings} (fly only — SBY and GRD pairings excluded)</p></li>`
  html += `<li class="not-prose space-y-2" data-id="li-basic-credit-${slug}"><p class="editor-paragraph-block" data-id="p-basic-credit-${slug}"><strong>Average crew credit (June 2026):</strong> ${creditLine}</p></li>`
  html += `</ul>`
  return html
}

// ─── Playwright helpers ────────────────────────────────────────────────────────
const pw = (await import(PW_PATH)).default
const { chromium } = pw
const api = (p) => `/api/workspaces/${SLUG}${p}`

async function withPage(fn) {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    ...(existsSync(STATE) ? { storageState: STATE } : {}),
  })
  const page = await ctx.newPage()
  try { return await fn(page) } finally { await browser.close() }
}

async function apiCall(page, pathStr, { method = 'GET', body } = {}) {
  return page.evaluate(async ({ pathStr, method, body }) => {
    const csrf = document.cookie.split('; ').find(c => c.startsWith('csrftoken='))?.split('=')[1]
    const res = await fetch(pathStr, {
      method,
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-csrftoken': csrf || '' },
      credentials: 'same-origin',
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const text = await res.text()
    let json = null; try { json = JSON.parse(text) } catch {}
    return { status: res.status, json, text: text.slice(0, 300) }
  }, { pathStr, method, body })
}

// ─── Main ─────────────────────────────────────────────────────────────────────
await withPage(async (page) => {
  await page.goto(`${BASE_URL}/${SLUG}/projects/${PROJECT}/issues/`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })
  await page.waitForTimeout(1500)

  for (const item of ITEMS) {
    console.log(`\n── PBS-${item.seq} (${item.base} ${item.crewType}) ──`)

    // 1. Fetch current description
    const getR = await apiCall(page, api(`/projects/${PROJECT}/issues/${item.id}/`))
    if (!getR.json) { console.error('  GET failed:', getR.status, getR.text); continue }
    const existing = getR.json.description_html || ''

    // 2. Skip if already has the section
    if (existing.includes(`data-id="h2-basic-${item.slug}"`)) {
      console.log('  Already has Basic section — skipping')
      continue
    }

    // 3. Find insertion point: before the "Things To-Do" h2
    // The h2-todo-SLUG tag marks the start of Things To-Do
    const todoMarker = `data-id="h2-todo-${item.slug}"`
    const insertIdx = existing.indexOf(`<h2 class="editor-heading-block" ${todoMarker}`)
    if (insertIdx === -1) {
      console.error(`  Cannot find Things To-Do marker (${todoMarker}) — skipping`)
      continue
    }

    // 4. Build new description: [before todo] + Basic section + [from todo onwards]
    const basicHtml = buildBasicSection(item)
    const newDesc = existing.slice(0, insertIdx) + basicHtml + existing.slice(insertIdx)

    // 5. PATCH
    const patchR = await apiCall(page, api(`/projects/${PROJECT}/issues/${item.id}/`), {
      method: 'PATCH',
      body: { description_html: newDesc },
    })
    if (patchR.status === 204 || patchR.status === 200) {
      console.log(`  PATCH OK (${patchR.status})`)
    } else {
      console.error(`  PATCH FAILED ${patchR.status}:`, patchR.text)
      continue
    }

    // 6. Verify
    const verR = await apiCall(page, api(`/projects/${PROJECT}/issues/${item.id}/`))
    const verified = verR.json?.description_html?.includes(`data-id="h2-basic-${item.slug}"`)
    console.log(`  Verify: ${verified ? '✓ section present' : '✗ NOT found'}`)

    await page.waitForTimeout(400)
  }

  console.log('\nDone.')
})
