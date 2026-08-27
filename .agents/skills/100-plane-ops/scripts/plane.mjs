// Reusable Plane (roiscloud) ops CLI driven by Playwright + the Plane REST API.
// Session is cached so you log in once. All writes go through the API with the CSRF cookie.
//
// Config via env (with sensible defaults for the flair workspace):
//   PLANE_BASE   default https://crew-f8-usva-tst.roiscloud.com
//   PLANE_SLUG   default flair
//   PLANE_EMAIL / PLANE_PASSWORD   (required for `login`)
//   PLANE_PW     path to the playwright module (default: repo e2e/node_modules)
//   PLANE_HOME   where to cache session/output (default: ./.plane next to cwd)
//
// Commands:
//   login                                  cache session -> $PLANE_HOME/state.json
//   projects                               list projects (name -> id)
//   list <projectId>                       list items: PBS-<seq>  <name>  <id>
//   get <projectId> <issueId>              print name + description_html
//   rename <projectId> <issueId> <name>    PATCH {name}
//   set-desc <projectId> <issueId> <file>  PATCH {description_html} from an HTML file
//
// Pattern note: to bilingualize, GET the description_html, rebuild the SAME element
// structure (keep every data-id/class), put English then <br> then original text per
// block, write it to a file, then `set-desc`.

import { fileURLToPath } from 'node:url'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const BASE = process.env.PLANE_BASE || 'https://crew-f8-usva-tst.roiscloud.com'
const SLUG = process.env.PLANE_SLUG || 'flair'
const PW_PATH = process.env.PLANE_PW ||
  '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/e2e/node_modules/playwright/index.js'
const HOME = process.env.PLANE_HOME || path.resolve(process.cwd(), '.plane')
mkdirSync(HOME, { recursive: true })
const STATE = path.join(HOME, 'state.json')

const pw = (await import(PW_PATH)).default // playwright is CommonJS -> default import
const { chromium } = pw

const api = (p) => `/api/workspaces/${SLUG}${p}`

async function withPage(fn, { needAuth = true } = {}) {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    ...(needAuth && existsSync(STATE) ? { storageState: STATE } : {}),
  })
  const page = await ctx.newPage()
  try { return await fn(page, ctx) } finally { await browser.close() }
}

// In-page fetch so cookies (incl. csrftoken) apply automatically.
async function call(page, pathStr, { method = 'GET', body } = {}) {
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
    return { status: res.status, json, text: text.slice(0, 500) }
  }, { pathStr, method, body })
}

const cmd = process.argv[2]
const a = process.argv.slice(3)

if (cmd === 'login') {
  const EMAIL = process.env.PLANE_EMAIL, PASSWORD = process.env.PLANE_PASSWORD
  if (!EMAIL || !PASSWORD) { console.error('set PLANE_EMAIL and PLANE_PASSWORD'); process.exit(1) }
  await withPage(async (page, ctx) => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForTimeout(1200)
    await page.fill('input#email, input[name="email"]', EMAIL)         // email-first flow
    await page.click('button[type="submit"]')
    await page.waitForSelector('input[type="password"]', { timeout: 20000 })
    await page.fill('input[type="password"]', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForTimeout(5000)
    await ctx.storageState({ path: STATE })
    console.log('logged in as', EMAIL, '-> session cached at', STATE)
  }, { needAuth: false })
} else if (cmd === 'projects') {
  await withPage(async (page) => {
    await page.goto(`${BASE}/${SLUG}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(1500)
    const r = await call(page, api('/projects/'))
    const list = r.json?.results || r.json || []
    for (const p of list) console.log(`${p.id}  ${p.name}`)
  })
} else if (cmd === 'list') {
  const [project] = a
  await withPage(async (page) => {
    await page.goto(`${BASE}/${SLUG}/projects/${project}/issues/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(1500)
    const r = await call(page, api(`/projects/${project}/issues/?per_page=300`))
    const list = (r.json?.results || []).sort((x, y) => x.sequence_id - y.sequence_id)
    writeFileSync(path.join(HOME, 'items.json'), JSON.stringify(list.map(i => ({ seq: i.sequence_id, name: i.name, id: i.id })), null, 2))
    for (const i of list) console.log(`PBS-${i.sequence_id}\t${i.id}\t${i.name}`)
    console.log(`\n${list.length} items (saved -> ${path.join(HOME, 'items.json')})`)
  })
} else if (cmd === 'get') {
  const [project, issue] = a
  await withPage(async (page) => {
    await page.goto(`${BASE}/${SLUG}/projects/${project}/issues/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(1200)
    const r = await call(page, api(`/projects/${project}/issues/${issue}/`))
    console.log('NAME:', r.json?.name)
    console.log('--- description_html ---')
    console.log(r.json?.description_html ?? '(none)')
  })
} else if (cmd === 'rename') {
  const [project, issue, ...rest] = a
  const name = rest.join(' ')
  await withPage(async (page) => {
    await page.goto(`${BASE}/${SLUG}/projects/${project}/issues/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(1200)
    const r = await call(page, api(`/projects/${project}/issues/${issue}/`), { method: 'PATCH', body: { name } })
    console.log(r.status, r.status === 204 || r.status === 200 ? 'OK' : r.text)
  })
} else if (cmd === 'set-desc') {
  const [project, issue, file] = a
  const html = readFileSync(file, 'utf8')
  await withPage(async (page) => {
    await page.goto(`${BASE}/${SLUG}/projects/${project}/issues/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(1200)
    const r = await call(page, api(`/projects/${project}/issues/${issue}/`), { method: 'PATCH', body: { description_html: html } })
    console.log(r.status, r.status === 204 || r.status === 200 ? 'OK' : r.text)
  })
} else if (cmd === 'create') {
  // create <projectId> <title> [--desc <file>] [--start YYYY-MM-DD] [--end YYYY-MM-DD]
  const [project, ...rest] = a
  const descIdx = rest.indexOf('--desc')
  const startIdx = rest.indexOf('--start')
  const endIdx = rest.indexOf('--end')
  const descFile = descIdx !== -1 ? rest[descIdx + 1] : null
  const startDate = startIdx !== -1 ? rest[startIdx + 1] : null
  const endDate = endIdx !== -1 ? rest[endIdx + 1] : null
  // title is everything before the first -- flag
  const firstFlag = Math.min(...[descIdx, startIdx, endIdx].filter(i => i !== -1), rest.length)
  const title = rest.slice(0, firstFlag).join(' ')
  const body = { name: title }
  if (descFile) body.description_html = readFileSync(descFile, 'utf8').trim()
  if (startDate) body.start_date = startDate
  if (endDate) body.target_date = endDate
  await withPage(async (page) => {
    await page.goto(`${BASE}/${SLUG}/projects/${project}/issues/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(1500)
    const r = await call(page, api(`/projects/${project}/issues/`), { method: 'POST', body })
    if (r.status === 201 || r.status === 200) {
      const id = r.json?.id
      const seq = r.json?.sequence_id
      console.log(`Created PBS-${seq} id=${id}`)
      writeFileSync(path.join(HOME, `created-${id}.json`), JSON.stringify(r.json, null, 2))
    } else {
      console.error('FAIL', r.status, r.text)
      process.exit(1)
    }
  })
} else {
  console.log('commands: login | projects | list <projectId> | get <projectId> <issueId> | rename <projectId> <issueId> <name> | set-desc <projectId> <issueId> <file> | create <projectId> <title> [--desc <file>] [--start YYYY-MM-DD] [--end YYYY-MM-DD]')
}
