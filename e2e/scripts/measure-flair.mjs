import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'https://flair.rois.cloud'
const LOGIN = process.env.LOGIN ?? `${BASE}/altair/live/api/auth/login`
const USER = process.env.U ?? 'Ryan'
const PASS = process.env.P ?? 'Our2027'

const run = async (label) => {
  // 1. login
  const res = await fetch(LOGIN, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userCode: USER, password: PASS }),
  })
  const { data } = await res.json()
  if (!data?.token) throw new Error('login failed')

  const browser = await chromium.launch()
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  // network breakdown for the data endpoints — capture decompressed body size + timing
  const net = []
  page.on('response', async (r) => {
    const u = new URL(r.url())
    if (/\/(crew|pairing|flight|roster|bootstrap)(\/|$|\?)/.test(u.pathname) && /\/(altair\/live|api)\//.test(u.pathname)) {
      const rec = { path: u.pathname.replace('/altair/live/api/', '') + (u.search ? u.search.slice(0, 30) : ''), status: r.status(), kb: null, ms: null }
      try { const b = await r.body(); rec.kb = +(b.length / 1024).toFixed(0) } catch {}
      try { const t = r.request().timing(); if (t) rec.ms = Math.round(t.responseEnd - t.requestStart) } catch {}
      net.push(rec)
    }
  })

  // 2. seed auth before first load
  await page.addInitScript((a) => {
    window.sessionStorage.setItem('rois-auth', JSON.stringify({
      user: { userCode: a.userCode, userName: a.userName, schema: a.schema }, token: a.token,
    }))
  }, data)

  // 3. open gantt (vite dev server over the tunnel = many module requests; be patient)
  await page.goto(`${BASE}/altair/`, { waitUntil: 'commit', timeout: 120000 })
  try {
    await page.waitForFunction(() => typeof window.__ganttTest !== 'undefined', undefined, { timeout: 120000 })
  } catch (e) {
    console.log('!! __ganttTest never appeared. url=', page.url(), 'title=', await page.title().catch(() => '?'))
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 300) ?? '').catch(() => '')
    console.log('body snippet:', body)
    throw e
  }

  // 4. into Live → open filter dialog
  await page.getByTestId('module-nav-live').click()
  const empty = page.getByTestId('live-empty-state')
  await empty.waitFor({ state: 'visible', timeout: 8000 })
  await empty.click()
  await page.getByTestId('filter-dialog').waitFor({ state: 'visible', timeout: 8000 })

  // 5. click Apply, then measure in-page (anchored to gantt:open mark)
  const navStart = Date.now()
  await page.getByTestId('filter-apply').click()
  const result = await page.evaluate(() => new Promise((resolve) => {
    const t = window.__ganttTest
    const out = {}
    const fallbackStart = performance.now()
    const iv = setInterval(() => {
      const open = (t.marks()['gantt:open']) ?? fallbackStart
      const c = t.counts()
      if (out.rosterMs == null && c.roster > 0) out.rosterMs = Math.round(performance.now() - open)
      if (out.pairingMs == null && c.pairing > 0) out.pairingMs = Math.round(performance.now() - open)
      if (out.rosterMs != null && out.pairingMs != null) {
        out.phases = t.phases(); out.counts = c; clearInterval(iv); resolve(out)
      }
    }, 15)
    setTimeout(() => { out.phases = t.phases(); out.counts = t.counts(); out.timedOut = true; clearInterval(iv); resolve(out) }, 60000)
  }))
  result.wallMsRosterPlusPairing = Date.now() - navStart
  await page.waitForTimeout(2500) // let pending response.body() captures (pairing list) finish

  console.log(`\n===== ${label} =====`)
  console.log('counts:', JSON.stringify(result.counts))
  console.log('roster visible :', result.rosterMs, 'ms after Apply')
  console.log('pairing visible:', result.pairingMs, 'ms after Apply')
  console.log('phases (ms from gantt:open):', JSON.stringify(result.phases))
  if (result.timedOut) console.log('** TIMED OUT before both visible **')
  console.log('data responses (decompressed size / wall time):')
  for (const n of net) console.log(`   ${n.status}  ${String(n.kb ?? '?').padStart(6)} KB  ${String(n.ms ?? '?').padStart(6)} ms  ${n.path}`)

  await browser.close()
  return result
}

await run('flair.rois.cloud — payload sizes')
