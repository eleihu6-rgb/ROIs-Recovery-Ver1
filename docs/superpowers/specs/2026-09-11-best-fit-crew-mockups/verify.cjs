/**
 * Best-Fit Crew mockups — verification.
 *
 * Model assertions run in plain node (no browser). Browser assertions run when a
 * Playwright install is resolvable; skip them with `--no-browser`.
 *
 *   node docs/superpowers/specs/2026-09-11-best-fit-crew-mockups/verify.cjs
 */
'use strict'
const fs = require('fs')
const path = require('path')

const DIR = __dirname
const model = require(path.join(DIR, 'model.js'))

let pass = 0
const failures = []
const check = (name, fn) => {
  try {
    const ok = fn()
    if (ok === false) throw new Error('assertion returned false')
    pass += 1
    process.stdout.write('  PASS  ' + name + '\n')
  } catch (err) {
    failures.push(name + ' — ' + err.message)
    process.stdout.write('  FAIL  ' + name + ' — ' + err.message + '\n')
  }
}

const checkAsync = async (name, fn) => {
  try {
    const ok = await fn()
    if (ok === false) throw new Error('assertion returned false')
    pass += 1
    process.stdout.write('  PASS  ' + name + '\n')
  } catch (err) {
    failures.push(name + ' — ' + err.message)
    process.stdout.write('  FAIL  ' + name + ' — ' + err.message + '\n')
  }
}

console.log('\nBest-Fit Crew mockup — model checks\n')

// ── formatting ───────────────────────────────────────────────────────────────
check('formatMinutes renders minutes as HH:MM', () => {
  if (model.formatMinutes(2430) !== '40:30') throw new Error('2430 → ' + model.formatMinutes(2430))
  if (model.formatMinutes(900) !== '15:00') throw new Error('900 → ' + model.formatMinutes(900))
  if (model.formatMinutes(3120) !== '52:00') throw new Error('3120 → ' + model.formatMinutes(3120))
})

check('formatMoney uses the revision currency', () => {
  const text = model.formatMoney(3240, 'CNY')
  if (!text.includes('3,240')) throw new Error('unexpected ' + text)
})

// ── Stage 1: basic eligibility ───────────────────────────────────────────────
const basic = model.basicMatch()

check('basicMatch() only returns crew matching base + fleet + division + rank + active + qualified', () => {
  for (const c of basic) {
    if (c.base !== model.pairing.base) throw new Error(c.crewId + ' base ' + c.base)
    if (!c.fleets.includes(model.pairing.fleet)) throw new Error(c.crewId + ' fleet ' + c.fleets.join('/'))
    if (c.division !== model.pairing.division) throw new Error(c.crewId + ' division ' + c.division)
    if (c.status !== 1) throw new Error(c.crewId + ' inactive')
    if (!c.qualOk) throw new Error(c.crewId + ' expired qualification')
    const slots = model.openSlots(model.pairing)
    const allowed = c.rank === 'CA' ? ['CA', 'FO'] : [c.rank]
    if (!slots.some((s) => allowed.includes(s))) throw new Error(c.crewId + ' cannot fill ' + slots.join('/'))
  }
  if (basic.length !== 12) throw new Error('expected 12 basic matches, got ' + basic.length)
})

check('every crew is accounted for by basic match or a named Stage-1 exclusion', () => {
  const f = model.funnel()
  const excluded = Object.values(f.excluded).reduce((a, b) => a + b, 0)
  if (f.basic + excluded !== f.universe) throw new Error(f.basic + ' + ' + excluded + ' !== ' + f.universe)
  if (f.universe !== model.crews.length) throw new Error('universe mismatch')
})

check('Stage-1 exclusions cover base, fleet, rank, division, qualification and inactive', () => {
  const e = model.funnel().excluded
  for (const reason of ['base', 'fleet', 'rank', 'division', 'qualification', 'inactive']) {
    if (!e[reason]) throw new Error('no fixture excluded for ' + reason)
  }
})

// ── Stage 2: legality classification ─────────────────────────────────────────
check('funnel splits the basic match into pass + soft + hard', () => {
  const f = model.funnel()
  if (f.basic !== f.pass + f.soft + f.hard) throw new Error(f.basic + ' !== ' + f.pass + '+' + f.soft + '+' + f.hard)
  if (!(f.soft >= 1 && f.hard >= 1)) throw new Error('need at least one soft and one hard fixture')
  if (!(f.pass >= 1)) throw new Error('need at least one clean fixture')
})

check('severity >= 3 is a hard block; severity < 3 is a soft warning', () => {
  for (const c of model.crews) {
    const l = model.legalityOf(c.crewId)
    if (c.hardRules.length && l.verdict !== 'hard') throw new Error(c.crewId + ' should be hard')
    if (!c.hardRules.length && l.verdict === 'hard') throw new Error(c.crewId + ' should not be hard')
    if (l.verdict === 'hard' && !l.violations.every((v) => v.severity >= 3)) throw new Error(c.crewId + ' hard without severity 3')
    if (l.verdict === 'soft' && !l.violations.every((v) => v.severity < 3)) throw new Error(c.crewId + ' soft with severity >= 3')
  }
})

// ── Stage 3: ranking ─────────────────────────────────────────────────────────
const fair = model.rankCrews('fairness')
const cost = model.rankCrews('cost')

check('fairness ranking is non-decreasing MBH, then MCred', () => {
  const legal = fair.filter((r) => !r.blocked)
  for (let i = 1; i < legal.length; i++) {
    const a = legal[i - 1], b = legal[i]
    if (a.crew.mbhMin > b.crew.mbhMin) throw new Error('MBH regressed at ' + b.crew.crewId)
    if (a.crew.mbhMin === b.crew.mbhMin && a.crew.mcredMin > b.crew.mcredMin) throw new Error('MCred tie-break regressed at ' + b.crew.crewId)
  }
})

check('cost ranking puts priced before unpriced and is non-decreasing within priced', () => {
  const legal = cost.filter((r) => !r.blocked)
  let seenUnpriced = false
  let last = -Infinity
  for (const r of legal) {
    if (r.cost.status === 'unpriced') { seenUnpriced = true; continue }
    if (seenUnpriced) throw new Error('priced candidate ' + r.crew.crewId + ' ranked after an unpriced one')
    if (r.cost.amount < last) throw new Error('cost regressed at ' + r.crew.crewId)
    last = r.cost.amount
  }
})

check('hard-blocked crew are excluded from the legal set and ranked last', () => {
  const blocked = fair.filter((r) => r.blocked)
  if (blocked.length !== 2) throw new Error('expected 2 blocked, got ' + blocked.length)
  const legalCount = fair.length - blocked.length
  if (!fair.slice(legalCount).every((r) => r.blocked)) throw new Error('blocked rows are not last')
  for (const r of blocked) {
    if (model.legalityOf(r.crew.crewId).verdict !== 'hard') throw new Error(r.crew.crewId + ' blocked without hard violation')
    if (!r.legality.violations.length) throw new Error(r.crew.crewId + ' blocked without a rule code')
  }
})

check('ranking is deterministic and rank numbers are contiguous', () => {
  const a = model.rankCrews('fairness').map((r) => r.crew.crewId).join(',')
  const b = model.rankCrews('fairness').map((r) => r.crew.crewId).join(',')
  if (a !== b) throw new Error('non-deterministic ordering')
  model.rankCrews('cost').forEach((r, i) => { if (r.rank !== i + 1) throw new Error('rank gap at ' + r.crew.crewId) })
})

check('ranking modes disagree, so the toggle is meaningful', () => {
  const topFair = fair.filter((r) => !r.blocked)[0].crew.crewId
  const topCost = cost.filter((r) => !r.blocked)[0].crew.crewId
  if (topFair === topCost) throw new Error('both bases pick ' + topFair)
  const fair3 = fair.filter((r) => !r.blocked).slice(0, 3).map((r) => r.crew.crewId).join(',')
  const cost3 = cost.filter((r) => !r.blocked).slice(0, 3).map((r) => r.crew.crewId).join(',')
  if (fair3 !== '20498,21109,21402') throw new Error('fairness top-3 changed: ' + fair3)
  if (cost3 !== '21551,21109,21187') throw new Error('cost top-3 changed: ' + cost3)
})

check('every row explains its position', () => {
  for (const r of fair.concat(cost)) {
    if (!r.why || typeof r.why !== 'string') throw new Error('missing why for ' + r.crew.crewId)
  }
})

// ── cost library shape ───────────────────────────────────────────────────────
check('cost payload mirrors the cost library CostCalculation contract', () => {
  // live-server/src/services/cost/cost-calculator.ts:
  // { amount, currencyCode, status: 'priced'|'unpriced'|'disabled', breakdown:[{label,value}], formula }
  for (const r of cost) {
    const c = r.cost
    if (!['priced', 'unpriced', 'disabled'].includes(c.status)) throw new Error('bad status for ' + r.crew.crewId)
    if (!c.currency || c.currency !== 'CNY') throw new Error('bad currency for ' + r.crew.crewId)
    if (typeof c.formula !== 'string' || !c.formula) throw new Error('missing formula for ' + r.crew.crewId)
    if (!Array.isArray(c.breakdown)) throw new Error('missing breakdown for ' + r.crew.crewId)
    if (c.status === 'priced') {
      if (typeof c.amount !== 'number') throw new Error('priced without amount for ' + r.crew.crewId)
      const sum = c.breakdown.reduce((n, b) => n + Number(String(b.value).replace(/[^0-9.]/g, '')), 0)
      if (Math.abs(sum - c.amount) > 1) throw new Error('breakdown ' + sum + ' !== amount ' + c.amount + ' for ' + r.crew.crewId)
    } else if (c.amount !== null) {
      throw new Error('unpriced with an amount for ' + r.crew.crewId)
    }
  }
  const unpriced = cost.filter((r) => r.cost.status === 'unpriced')
  if (unpriced.length < 2) throw new Error('expected >= 2 unpriced fixtures')
  if (!model.COST_SET_LABEL.includes('rev')) throw new Error('cost set label must be revision labelled')
})

// ── queue (Entry 2) ──────────────────────────────────────────────────────────
const queue = model.queueRows()

check('open-pairing queue has >= 5 rows, all open/partial, with non-empty open slots', () => {
  if (queue.length < 5) throw new Error('only ' + queue.length + ' queue rows')
  for (const p of queue) {
    if (!['open', 'partial'].includes(p.coverage)) throw new Error(p.label + ' coverage ' + p.coverage)
    if (!p.openSlots.length) throw new Error(p.label + ' has no open slots')
    if (!p.openSlots.every((s) => s.count > 0)) throw new Error(p.label + ' open slot with count <= 0')
    for (const s of p.openSlots) {
      const slot = p.composition.find((x) => x.rank === s.rank)
      if (!slot || (slot.plan || 0) - (slot.fill || 0) !== s.count) throw new Error(p.label + ' slot mismatch for ' + s.rank)
    }
  }
})

check('queue defaults to earliest departure first and reports urgency', () => {
  for (let i = 1; i < queue.length; i++) {
    if (queue[i - 1].daysUntil > queue[i].daysUntil) throw new Error('queue not sorted by departure at ' + queue[i].label)
  }
  if (queue[0].daysUntil !== 1) throw new Error('expected the demo date to be 1 day before the first departure')
})

check('queue "legal crew" counts come from the same pipeline as the panel', () => {
  for (const p of queue) {
    const f = model.funnel(p)
    if (p.legalCount !== f.pass + f.soft) throw new Error(p.label + ' legal count mismatch')
    if (p.hardCount !== f.hard) throw new Error(p.label + ' hard count mismatch')
  }
  const target = queue.find((p) => p.id === 41287)
  if (!target || target.legalCount !== 10 || target.hardCount !== 2) throw new Error('PA-41287 queue counts changed')
})

// ── fixture files exist and stay self-contained ──────────────────────────────
check('both option files exist and load only local assets', () => {
  for (const name of ['option-a.html', 'option-b.html']) {
    const html = fs.readFileSync(path.join(DIR, name), 'utf8')
    if (!html.includes('Best-fit queue')) throw new Error(name + ' does not mention the queue entry')
    if (!html.includes('Find best-fit crew')) throw new Error(name + ' does not mention the context-menu entry')
    if (/https?:\/\//.test(html.replace(/<a href="https?:\/\/[^"]*"/g, ''))) throw new Error(name + ' loads a remote asset')
    if (!/src="model\.js"/.test(html)) throw new Error(name + ' does not load model.js')
  }
})

// ── optional browser pass ────────────────────────────────────────────────────
const wantBrowser = !process.argv.includes('--no-browser')
function resolvePlaywright() {
  const candidates = [
    path.join(__dirname, '../../../../e2e/node_modules/playwright'),
    path.join(__dirname, '../../../../node_modules/playwright'),
  ]
  for (const c of candidates) { try { return require(c) } catch { /* keep looking */ } }
  try { return require('playwright') } catch { return null }
}

async function browserChecks() {
  const pw = resolvePlaywright()
  if (!pw) { console.log('\n  SKIP  browser checks (playwright not resolvable)'); return }
  console.log('\nBest-Fit Crew mockup — browser checks\n')
  let browser
  try {
    browser = await pw.chromium.launch()
  } catch (err) {
    console.log('  SKIP  browser checks (no installed chromium: ' + err.message.split('\n')[0] + ')')
    return
  }
  for (const option of ['option-a', 'option-b']) {
    const errors = [], failed = []
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
    page.on('requestfailed', (r) => failed.push(r.url()))
    await page.goto('file://' + path.join(DIR, option + '.html'))
    await page.waitForTimeout(200)
    await checkAsync(option + ': toolbar badge matches the queue length', async () => {
      const n = Number(await page.textContent('#queue-n'))
      if (n !== queue.length) throw new Error('badge ' + n + ' !== ' + queue.length)
    })
    await page.click('[data-testid=btn-queue]')
    await page.waitForTimeout(200)
    if (option === 'option-a') {
      await checkAsync('option-a: queue dialog lists every open pairing', async () => {
        const rows = await page.locator('[data-testid=queue] tbody tr').count()
        if (rows !== queue.length) throw new Error(rows + ' rows')
      })
      await page.click('#overlay .queue-row[data-pairing-id="41287"] [data-testid=queue-row-action]')
    } else {
      await checkAsync('option-b: queue screen lists every open pairing', async () => {
        const rows = await page.locator('[data-testid=queue-card]').count()
        if (rows !== queue.length) throw new Error(rows + ' cards')
      })
      await page.click('[data-testid=queue-card-action][data-pairing-id="41287"]')
      await page.waitForTimeout(150)
      await page.click('[data-testid=dock-next]')  // step 1 → 2
      await page.waitForTimeout(150)
      await page.click('[data-testid=dock-next]')  // step 2 → 3 (starts simulation)
      await page.waitForTimeout(1800)
      await page.click('[data-testid=dock-next]')  // step 3 → 4
    }
    await page.waitForTimeout(1200)
    await checkAsync(option + ': candidate order matches the model (fairness)', async () => {
      const sel = option === 'option-a' ? '[data-testid=cand-row]' : '[data-testid=card]'
      const got = (await page.locator(sel).evaluateAll((els) => els.map((e) => e.dataset.crewId))).join(',')
      const want = fair.map((r) => r.crew.crewId).join(',')
      if (got !== want) throw new Error('got ' + got + ' want ' + want)
    })
    await checkAsync(option + ': "only fully legal" removes every hard-blocked row', async () => {
      const box = option === 'option-a' ? '#f-legal' : '#b-legal'
      await page.click(box)
      await page.waitForTimeout(200)
      const blocked = await page.locator('[data-blocked="true"]').count()
      if (blocked !== 0) throw new Error(blocked + ' blocked rows remain')
      await page.click(box)
      await page.waitForTimeout(200)
    })
    await checkAsync(option + ': cost ranking re-orders to the model order', async () => {
      await page.click('[data-testid=basis-cost]')
      await page.waitForTimeout(200)
      const sel = option === 'option-a' ? '[data-testid=cand-row]' : '[data-testid=card]'
      const got = (await page.locator(sel).evaluateAll((els) => els.map((e) => e.dataset.crewId))).join(',')
      const want = cost.map((r) => r.crew.crewId).join(',')
      if (got !== want) throw new Error('got ' + got + ' want ' + want)
    })
    await checkAsync(option + ': zero console errors and zero failed requests', async () => {
      if (errors.length) throw new Error(errors.join(' | '))
      if (failed.length) throw new Error('failed requests: ' + failed.join(', '))
    })
    await page.close()
  }
  await browser.close()
}

;(async () => {
  if (wantBrowser) await browserChecks()
  console.log('\n' + pass + ' checks passed, ' + failures.length + ' failed')
  if (failures.length) {
    failures.forEach((f) => console.log('  · ' + f))
    process.exit(1)
  }
})()
