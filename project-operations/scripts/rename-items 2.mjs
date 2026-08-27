// Rename Chinese-titled PBS Dev Team items to "English (original Chinese)".
// Usage:
//   node rename-items.mjs           -> test the FIRST item only (dry verify)
//   node rename-items.mjs --all     -> rename all 44
import pw from '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/e2e/node_modules/playwright/index.js'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const { chromium } = pw

const BASE = 'https://crew-f8-usva-tst.roiscloud.com'
const SLUG = 'flair'
const PROJECT = 'badd48f1-a48b-4457-95e0-e2cbf2941cb2'
const AUTH = fileURLToPath(new URL('../.auth/state.json', import.meta.url))
const OUT = fileURLToPath(new URL('../out/', import.meta.url))
const ALL = process.argv.includes('--all')
mkdirSync(OUT, { recursive: true })

// English translations keyed by sequence_id. Original Chinese is appended at runtime.
const EN = {
  40: 'Imported data shows no flight duties with pairings — only ground duties',
  41: 'UI layout improvement: merge toolbars to reduce vertical space usage',
  42: "Create a dev/test environment on the cloud server, separate from the user's environment, with automated build & deployment",
  43: 'Rule integration and rule development',
  44: 'Integrate with the optimizer: invoke optimization and get the flow working end-to-end',
  45: 'Import pbs_user data manually first; later, once the interface syncs crew data, the pbs_user table must be updated in sync',
  46: 'After the interface code updates Crew data, update the pbs_user table in sync',
  47: 'Scenario can open the Gantt from a file',
  48: 'Provide the optimizer with an ro_input.gz file that includes reserve data',
  49: 'Initialize June reserve data for PBS',
  70: 'Get the old Gantt + optimizer working end-to-end; temporary rule checking used for optimization',
  72: '[UI] May 5 customer usage feedback',
  74: '[UI] Load S3 pairing into Scenario — import S3 pairings into Scenario',
  75: '[Rule] Next-generation rule engine design and migration',
  80: 'Integrate with the optimizer: provide PBS bidding CSV data and tzdata',
  84: 'Line — condition modification',
  85: 'RO Scenario: KPI RESULTS should not be randomly generated',
  86: 'Scenario is missing some features compared to Live',
  87: 'Flight flt_num displays incorrectly — found to be an interface data issue; flight data needs re-importing',
  88: 'Credit was added to RosterGround; need to re-import Credit — both old and new',
  89: 'Pairing Filter not working',
  90: 'Roster: show how many credit hours and how many days off (DO) each person has',
  91: 'Flight: finding the pairing from a flight is broken',
  92: 'Scenario: want to see uncovered hours for pairings',
  93: 'What is the "model" inside Scenario?',
  94: 'Rule Set page: UI feedback V1',
  95: 'Rule Edit page, Configure rule: some option input methods need improvement',
  96: 'The max open-pane count hint — should the wording be unified?',
  97: 'Pairing Info: when timezone is set to Airport, is the time the same as UTC?',
  98: 'Should "Optimisation" be standardized to "Optimization"?',
  99: 'Live Gantt segmented/incremental loading rework',
  100: 'ESC has no effect on the left header area?',
  101: 'Header area: when multi-selecting with Ctrl, should the right-click menu pop up automatically?',
  103: 'For cross-month duties, how should Credit Hours be attributed to the right month?',
  104: 'Export API: add filter conditions',
  105: 'API speed/performance optimization',
  106: 'Write test cases',
  107: 'Help / user manual',
  108: 'Admin side: roster period settings',
  110: 'Add the "most flying hours in least flying day" condition',
  111: 'Add test cases',
  112: 'Stress / load testing',
  113: 'Run the playbook on the portal',
  114: 'Write-back / publish API',
}

const items = JSON.parse(readFileSync(OUT + 'items.json', 'utf8')) // [{seq,name,id,zh}]
let targets = items.filter(i => EN[i.seq])
// Don't double-translate: skip if name already contains its english part.
targets = targets.filter(i => !i.name.startsWith(EN[i.seq].slice(0, 12)))
if (!ALL) targets = targets.slice(0, 1)
console.log(`renaming ${targets.length} item(s)${ALL ? '' : ' (TEST: first only)'}`)

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: AUTH })
const page = await ctx.newPage()
await page.goto(`${BASE}/${SLUG}/projects/${PROJECT}/issues/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(1500)

const results = []
for (const it of targets) {
  const newName = `${EN[it.seq]} (${it.name})`
  const r = await page.evaluate(async ({ slug, project, id, newName }) => {
    const csrf = document.cookie.split('; ').find(c => c.startsWith('csrftoken='))?.split('=')[1]
    const url = `/api/workspaces/${slug}/projects/${project}/issues/${id}/`
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'accept': 'application/json', 'x-csrftoken': csrf || '' },
        credentials: 'same-origin',
        body: JSON.stringify({ name: newName }),
      })
      const text = await res.text()
      return { status: res.status, body: text.slice(0, 300) }
    } catch (e) { return { error: String(e) } }
  }, { slug: SLUG, project: PROJECT, id: it.id, newName })
  const ok = r.status >= 200 && r.status < 300
  console.log(`PBS-${it.seq}: ${r.status || r.error} ${ok ? 'OK' : '!! ' + (r.body || '')}`)
  results.push({ seq: it.seq, id: it.id, newName, status: r.status, ok, body: r.body, error: r.error })
  await page.waitForTimeout(300)
}

writeFileSync(OUT + 'rename-results.json', JSON.stringify(results, null, 2))
const okCount = results.filter(r => r.ok).length
console.log(`\nDONE: ${okCount}/${results.length} succeeded`)
await browser.close()
