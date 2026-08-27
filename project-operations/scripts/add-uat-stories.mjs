// add-uat-stories.mjs
// Appends "User Test Story" section (from PBS_UAT_Test_Scenarios - Jen.xlsx) to PBS-117..128.
// Each item covers one base × crew type; the UAT section is identical in content across all 12.
//
// Run:
//   PLANE_HOME=".auth" node scripts/add-uat-stories.mjs

import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const BASE = 'https://crew-f8-usva-tst.roiscloud.com'
const SLUG = 'flair'
const PROJECT = 'badd48f1-a48b-4457-95e0-e2cbf2941cb2'
const PW_PATH =
  '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/e2e/node_modules/playwright/index.js'
const HOME =
  process.env.PLANE_HOME ||
  '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/project-operations/.auth'
const STATE = path.join(HOME, 'state.json')

// ─── UAT data from Excel (PBS_UAT_Test_Scenarios - Jen.xlsx) ──────────────────
const UAT_SCENARIOS = [
  { num: 1,  cat: 'Seniority',          story: 'Most senior crew member receives first choice pairing',                       expected: 'Award goes to most senior bidder.' },
  { num: 2,  cat: 'Seniority',          story: 'Two crew members bid the exact same pairing',                                 expected: 'Award goes to senior bidder.' },
  { num: 3,  cat: 'Seniority',          story: 'Three crew members bid the same pairing',                                     expected: 'Awards follow seniority order.' },
  { num: 4,  cat: 'Seniority',          story: 'Junior employee bids a pairing left unawarded by senior employees',           expected: 'Pairing awarded to junior employee.' },
  { num: 5,  cat: 'Seniority',          story: 'Crew member receives lower-ranked preference because higher-ranked preference unavailable', expected: 'System follows bid priority sequence.' },
  { num: 6,  cat: 'Seniority',          story: 'Identical bids entered by employees at multiple seniority levels',            expected: 'Awards align with seniority.' },
  { num: 7,  cat: 'Pairing Award Logic', story: 'Crew member bids specific pairing',                                          expected: 'Pairing awarded if available and legal.' },
  { num: 8,  cat: 'Pairing Award Logic', story: 'Crew member bids multiple pairings in ranked order',                         expected: 'Highest available pairing awarded.' },
  { num: 9,  cat: 'Pairing Award Logic', story: 'Crew member bids avoid pairing',                                             expected: 'System avoids pairing where possible.' },
  { num: 10, cat: 'Pairing Award Logic', story: 'Crew member bids specific destination',                                      expected: 'Destination preference considered correctly.' },
  { num: 11, cat: 'Pairing Award Logic', story: 'Crew member bids specific credit range',                                     expected: 'Award falls within requested range when possible.' },
  { num: 12, cat: 'Pairing Award Logic', story: 'Crew member bids specific work pattern',                                     expected: 'Pattern preference evaluated correctly.' },
  { num: 13, cat: 'Legality',           story: 'Award creates FDP violation',                                                 expected: 'Pairing rejected.' },
  { num: 14, cat: 'Legality',           story: 'Award exceeds monthly credit limit',                                          expected: 'Pairing rejected.' },
  { num: 15, cat: 'Legality',           story: 'Award exceeds maximum duty days',                                             expected: 'Pairing rejected.' },
  { num: 16, cat: 'Legality',           story: 'Award violates minimum rest',                                                 expected: 'Pairing rejected.' },
  { num: 17, cat: 'Legality',           story: 'Award violates consecutive work day limits',                                  expected: 'Pairing rejected.' },
  { num: 18, cat: 'Legality',           story: 'Crew member bids an illegal schedule',                                        expected: 'System skips illegal options and continues processing.' },
  { num: 19, cat: 'Reserve',            story: 'Crew member bids reserve only',                                               expected: 'Reserve awarded.' },
  { num: 20, cat: 'Reserve',            story: 'Crew member bids AM reserve preference',                                      expected: 'AM reserve awarded when available.' },
  { num: 21, cat: 'Reserve',            story: 'Crew member bids PM reserve preference',                                      expected: 'PM reserve awarded when available.' },
  { num: 22, cat: 'Reserve',            story: 'Reserve demand exceeds availability',                                         expected: 'Allocation follows seniority and bid rules.' },
  { num: 23, cat: 'Reserve',            story: 'Crew member bids to avoid reserve',                                           expected: 'Reserve avoided when possible.' },
  { num: 24, cat: 'Reserve',            story: 'Mixed reserve and pairing bids',                                              expected: 'System follows configured priority rules.' },
  { num: 25, cat: 'Failure & Recovery', story: 'Crew member cannot receive any requested award',                              expected: 'System assigns according to default logic.' },
  { num: 26, cat: 'Failure & Recovery', story: 'Crew member submits no bid',                                                  expected: 'System awards according to default rules.' },
  { num: 27, cat: 'Failure & Recovery', story: 'Insufficient pairings available',                                             expected: 'System completes award without errors.' },
  { num: 28, cat: 'Failure & Recovery', story: 'Insufficient reserve positions available',                                    expected: 'System follows fallback rules.' },
  { num: 29, cat: 'Failure & Recovery', story: 'Entire month cannot be covered through preferences',                          expected: 'System maintains operational coverage.' },
  { num: 30, cat: 'Failure & Recovery', story: 'Open time remains after award',                                               expected: 'Open time report generated correctly.' },
  { num: 31, cat: 'Flair Specific',     story: '55-hour red-eye separation rule',                                             expected: 'No prohibited red-eye sequence awarded.' },
  { num: 32, cat: 'Flair Specific',     story: 'Maximum two WOCL pairings rule',                                              expected: 'Rule respected.' },
  { num: 33, cat: 'Flair Specific',     story: 'Pilot 18-day maximum',                                                       expected: 'Cannot exceed 18 days.' },
  { num: 34, cat: 'Flair Specific',     story: 'FA 85-hour maximum',                                                         expected: 'Cannot exceed 85 hours.' },
  { num: 35, cat: 'Flair Specific',     story: 'Reserve staffing target maintained by base',                                  expected: 'Required reserve coverage remains.' },
  { num: 36, cat: 'Flair Specific',     story: 'Base-specific staffing minimum maintained',                                   expected: 'Coverage preserved.' },
  { num: 37, cat: 'Flair Specific',     story: 'Pairing award creates uncovered critical flying',                             expected: 'Coverage protection logic applies.' },
  { num: 38, cat: 'Flair Specific',     story: 'Award month using actual Flair pairings and headcount',                      expected: 'Operationally viable roster produced.' },
  { num: 39, cat: 'Critical Acceptance', story: 'Explainability Test',                                                       expected: 'Complete explanation and audit trail available.' },
]

// ─── 12 target items ──────────────────────────────────────────────────────────
const ITEMS = [
  { seq: 117, id: '8e848085-0a77-4982-a8df-22397433387e', base: 'YVR', crew: 'Pilot',      slug: 'YVR-Pilot' },
  { seq: 118, id: '5cec9568-5639-42fb-86e2-40177e053206', base: 'YVR', crew: 'Cabin Crew', slug: 'YVR-Cabin' },
  { seq: 119, id: '7ec3ced5-1302-4541-b3a7-be2c1d957b29', base: 'YYC', crew: 'Pilot',      slug: 'YYC-Pilot' },
  { seq: 120, id: 'b883dca3-8f97-4cc4-a595-50d2911023a3', base: 'YYC', crew: 'Cabin Crew', slug: 'YYC-Cabin' },
  { seq: 121, id: 'ba47d5f9-3ef7-4cb8-b174-5c81427132a2', base: 'YEG', crew: 'Pilot',      slug: 'YEG-Pilot' },
  { seq: 122, id: '00032962-5b9a-458d-a8da-9e08056336ae', base: 'YEG', crew: 'Cabin Crew', slug: 'YEG-Cabin' },
  { seq: 123, id: '2b4cd5e5-1938-4f68-bfd0-056e8bcf992e', base: 'YYZ', crew: 'Pilot',      slug: 'YYZ-Pilot' },
  { seq: 124, id: 'ea6a5d05-0fd0-45e2-8af5-bc3a6ca52777', base: 'YYZ', crew: 'Cabin Crew', slug: 'YYZ-Cabin' },
  { seq: 125, id: '429a0554-f5a7-4f53-b6fd-c83bf6392eab', base: 'YOW', crew: 'Pilot',      slug: 'YOW-Pilot' },
  { seq: 126, id: 'c8d3e96c-1dda-40f8-b25c-3cc741ff7eb3', base: 'YOW', crew: 'Cabin Crew', slug: 'YOW-Cabin' },
  { seq: 127, id: '2d2ce0ae-3d32-4872-8b91-fd03393b9240', base: 'YUL', crew: 'Pilot',      slug: 'YUL-Pilot' },
  { seq: 128, id: '6f1cd82c-fb4c-4287-a19c-b4c02d351cbb', base: 'YUL', crew: 'Cabin Crew', slug: 'YUL-Cabin' },
]

// ─── Build UAT HTML block for a given slug ────────────────────────────────────
function buildUATSection(slug, base, crew) {
  // Group scenarios by category
  const cats = []
  const seen = {}
  for (const s of UAT_SCENARIOS) {
    if (!seen[s.cat]) { seen[s.cat] = []; cats.push(s.cat) }
    seen[s.cat].push(s)
  }

  let html = ''
  html += `<h2 class="editor-heading-block" data-id="h2-uts-${slug}">User Test Story</h2>`
  html += `<p class="editor-paragraph-block" data-id="p-uts-intro-${slug}">The following UAT test scenarios (provided by Jen, client UAT lead) must be validated for <strong>${base} ${crew}</strong> crew. Scenarios cover seniority logic, pairing award, legality checks, reserve handling, failure &amp; recovery, Flair-specific rules, and critical acceptance.</p>`

  for (const cat of cats) {
    const catKey = cat.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
    html += `<p class="editor-paragraph-block" data-id="p-uts-cat-${catKey}-${slug}"><strong>Category: ${cat}</strong></p>`
    html += `<ol class="list-decimal pl-7 space-y-(--list-spacing-y)" data-id="ol-uts-${catKey}-${slug}">`
    for (const s of seen[cat]) {
      html += `<li class="not-prose space-y-2" data-id="li-uts-${catKey}-${s.num}-${slug}">`
      html += `<p class="editor-paragraph-block" data-id="p-uts-${catKey}-${s.num}-${slug}"><strong>${s.story}</strong> — Expected result: ${s.expected}</p>`
      html += `</li>`
    }
    html += `</ol>`
  }
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
  await page.goto(`${BASE}/${SLUG}/projects/${PROJECT}/issues/`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })
  await page.waitForTimeout(1500)

  for (const item of ITEMS) {
    console.log(`\n── PBS-${item.seq} (${item.base} ${item.crew}) ──`)

    // 1. Fetch current description
    const getR = await apiCall(page, api(`/projects/${PROJECT}/issues/${item.id}/`))
    if (!getR.json) { console.error('  GET failed:', getR.status, getR.text); continue }
    const existing = getR.json.description_html || ''

    // 2. Skip if already has the section
    if (existing.includes(`data-id="h2-uts-${item.slug}"`)) {
      console.log('  Already has User Test Story section — skipping')
      continue
    }

    // 3. Build new description: existing + UAT section
    const uatHtml = buildUATSection(item.slug, item.base, item.crew)
    const newDesc = existing + uatHtml

    // 4. PATCH
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

    // 5. Verify
    const verR = await apiCall(page, api(`/projects/${PROJECT}/issues/${item.id}/`))
    const verified = verR.json?.description_html?.includes(`data-id="h2-uts-${item.slug}"`)
    console.log(`  Verify: ${verified ? '✓ section present' : '✗ NOT found in response'}`)

    await page.waitForTimeout(400) // brief pause between writes
  }

  console.log('\nDone.')
})
