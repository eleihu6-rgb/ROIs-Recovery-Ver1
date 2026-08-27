/**
 * API-only completion of YVR+YYZ pilot PA-removal (stage 3). No browser — robust under
 * the saturated demo DB. Small batches + retries; loops until nothing remains.
 *   node e2e/scripts/deassign-complete-api.mjs
 */
import { readFileSync } from 'node:fs'
const API = 'http://localhost:3000'
const FROM = '2026-06-01T00:00:00Z', TO = '2026-07-01T00:00:00Z'
const BATCH = 5
const log = (...a) => console.log('[api]', ...a)

const login = async () => {
  for (let i = 0; i < 6; i++) {
    try {
      const j = await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userCode: 'admin', password: '123456' }), signal: AbortSignal.timeout(30_000) })).json()
      if (j?.data?.token) return j.data.token
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 3000))
  }
  throw new Error('login failed')
}
const token = await login()
const H = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

const execBatch = async (crewIds) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const j = await (await fetch(`${API}/api/crew-memo/pa-removal/execute`, { method: 'POST', headers: H,
        body: JSON.stringify({ crewIds, from: FROM, to: TO }), signal: AbortSignal.timeout(180_000) })).json()
      if (j && typeof j.data?.deassigned === 'number') return j.data.deassigned
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 2500))
  }
  return -1 // signal failure
}

let crew = JSON.parse(readFileSync('/tmp/yvr_yyz_remaining.json', 'utf8'))
let total = 0, round = 0
while (crew.length > 0 && round < 6) {
  round += 1
  log(`round ${round}: ${crew.length} crew remaining`)
  const failed = []
  for (let i = 0; i < crew.length; i += BATCH) {
    const chunk = crew.slice(i, i + BATCH)
    const n = await execBatch(chunk)
    if (n < 0) { failed.push(...chunk); log(`  batch @${i} FAILED — will retry next round`) }
    else { total += n; if ((i / BATCH) % 4 === 0) log(`  …${i + chunk.length}/${crew.length} crew, ${total} duties de-assigned`) }
  }
  crew = failed
}
log(`DONE rounds — de-assigned ${total} duties; ${crew.length} crew left unresolved`)
