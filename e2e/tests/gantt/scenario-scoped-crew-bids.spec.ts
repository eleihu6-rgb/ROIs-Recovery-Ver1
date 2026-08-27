/**
 * Scenario-scoped crew-bid package — proves the solver's preference CSVs are
 * generated PER SCENARIO SCOPE at run kick-off, not from the fixed YEG-14 list.
 *
 * Background: apart from `ro_input.txt`, the RO/PBS solver consumes a crew-bid
 * package — DAYSOFF.csv / PAIRING_SCORE.csv / RESERVE_SCORE.csv / LINE_RULES.csv.
 * Those CSVs used to come from pbs-server's hardcoded `yeg-test-package`
 * (YEG_14_TEST_CREW_IDS). This feature adds a scenario-scoped package
 * (`POST /api/admin/algorithm-export/scenario-package` with the exact crew set a
 * scenario covers — the SAME set `ro_input_builder.scenario_crew_ids` derives), so
 * the bid CSVs match the optimized roster crew. At kick-off the engine-server
 * computes the scenario crew scope and fetches this package instead of YEG-14.
 *
 * Observed in the backend: this spec drives pbs-server directly (the server the
 * engine fetches from) and inspects the actual generated package bytes.
 *
 * Scenario 537 ("RO-2026-06 YEG Test", Jun 2026, YEG/737) covers 26 crew — a
 * SUPERSET of the 14 YEG test crew. Crew 274 and 499 are IN scenario scope and
 * HAVE bids, but are NOT in the YEG-14 list — so a scenario package contains them
 * and a YEG-14 package never can. That is the deterministic discriminator.
 *
 * The 26-crew scope below is scenario 537's `filter.crew` (base/fleet/division)
 * resolved over the period window. Regenerate with:
 *   cd engine-server && LEGACY_RO_DB_URL=<dsn> .venv/bin/python -c \
 *     "from F8.ro_input_builder import cli; print(cli.scenario_crew_ids('f8',537))"
 *
 * Run (pbs-server must serve the new code; see env below):
 *   cd e2e && PBS_SERVER_URL=http://127.0.0.1:3099 npx playwright test \
 *     --config=config/playwright.config.ts --project=gantt \
 *     tests/gantt/scenario-scoped-crew-bids.spec.ts --reporter=list --no-deps
 */
import zlib from 'node:zlib'
import { test, expect } from '@playwright/test'
import { loginToPbsApi } from '../../utils/pbs/auth'

type Req = import('@playwright/test').APIRequestContext

const PBS_API = process.env.PBS_SERVER_URL ?? 'http://127.0.0.1:3099'
const PBS_ADMIN_USER = process.env.PBS_ADMIN_USER ?? 'admin'
const PBS_ADMIN_PASS = process.env.PBS_ADMIN_PASSWORD ?? '123456'
const PERIOD_CODE = 'Jun 2026'

// Scenario 537's crew scope (26) — see header for how to regenerate.
const SCENARIO_537_CREW = [
  '247', '274', '383', '499', '536', '572', '813', '996', '1427', '1475',
  '1568', '2126', '2224', '2227', '2229', '2368', '2377', '2427', '2440',
  '2564', '2696', '2697', '2903', '8888', '13030', '13697',
]

// The fixed list the legacy `yeg-test-package` is hardcoded to.
const YEG_14_TEST_CREW = [
  '8888', '13697', '2697', '2696', '2440', '2377', '2229',
  '2227', '2224', '996', '572', '536', '383', '247',
]

// Crew that are IN scenario scope and HAVE bids, but are NOT in the YEG-14 list.
// 274 → LINE_RULES, 499 → PAIRING_SCORE + RESERVE_SCORE.
const PROOF_CREW = ['274', '499']

const BID_CSV_FILES = ['DAYSOFF.csv', 'PAIRING_SCORE.csv', 'RESERVE_SCORE.csv', 'LINE_RULES.csv']

// Package build over the remote WAN PG is heavy (PAIRING_SCORE dominates, ~2-3 min).
const PACKAGE_TIMEOUT_MS = 300_000

const login = async (request: Req): Promise<string> => {
  const { token } = await loginToPbsApi(request, PBS_API, PBS_ADMIN_USER, PBS_ADMIN_PASS)
  return token
}

/** Minimal ustar extractor: name[0..100), octal size[124..136), data padded to 512. */
const untar = (buf: Buffer): Map<string, string> => {
  const files = new Map<string, string>()
  let off = 0
  while (off + 512 <= buf.length) {
    const name = buf.toString('utf8', off, off + 100).replace(/\0.*$/, '')
    if (name === '') break // first zero block marks the end of the archive
    const size = parseInt(buf.toString('utf8', off + 124, off + 136).replace(/[^0-7]/g, '') || '0', 8)
    const type = buf[off + 156]
    const dataStart = off + 512
    if (type === 0x30 || type === 0x00) {
      files.set(name.split('/').pop() as string, buf.toString('utf8', dataStart, dataStart + size))
    }
    off = dataStart + Math.ceil(size / 512) * 512
  }
  return files
}

/** Distinct crew ids appearing in column 0 of a bid CSV (skipping the header). */
const crewIdsInCsv = (csv: string): Set<string> => {
  const ids = new Set<string>()
  const lines = csv.split(/\r?\n/)
  for (const line of lines.slice(1)) {
    const first = line.split(',')[0]?.trim()
    if (first) ids.add(first)
  }
  return ids
}

const crewUnionAcrossPackage = (files: Map<string, string>): Set<string> => {
  const union = new Set<string>()
  for (const name of BID_CSV_FILES) {
    const csv = files.get(name)
    expect(csv, `package is missing ${name}`).toBeTruthy()
    for (const id of crewIdsInCsv(csv as string)) union.add(id)
  }
  return union
}

test.describe.configure({ mode: 'serial' })
// Pure pbs-server API test — opt out of the gantt browser storageState.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Scenario-scoped crew-bid package (pbs-server algorithm export)', () => {
  test('PBS-3401 — scenario-package crew set is the scenario scope, not YEG-14', async ({ request }) => {
    test.setTimeout(PACKAGE_TIMEOUT_MS + 60_000)
    const token = await login(request)

    const res = await request.post(
      `${PBS_API}/api/admin/algorithm-export/scenario-package`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { periodCode: PERIOD_CODE, crewIds: SCENARIO_537_CREW },
        timeout: PACKAGE_TIMEOUT_MS,
      },
    )
    expect(res.ok(), `scenario-package → ${res.status()}`).toBeTruthy()
    expect(res.headers()['content-type']).toContain('gzip')

    const files = untar(zlib.gunzipSync(Buffer.from(await res.body())))
    // All five solver files (4 CSVs + readme) must be present.
    for (const name of [...BID_CSV_FILES, 'LINE_RULES_README.md']) {
      expect(files.has(name), `package is missing ${name}`).toBeTruthy()
    }

    const union = crewUnionAcrossPackage(files)
    // eslint-disable-next-line no-console
    console.log(`[PBS-3401] scenario package crew (${union.size}): ${[...union].sort((a, b) => +a - +b).join(' ')}`)

    // 1) Every crew in the package is within the scenario's crew scope (no leakage).
    const scope = new Set(SCENARIO_537_CREW)
    const outOfScope = [...union].filter((id) => !scope.has(id))
    expect(outOfScope, `crew outside scenario scope leaked into the package: ${outOfScope}`).toEqual([])

    // 2) The package carries scenario crew that the YEG-14 list does NOT contain —
    //    proof it is scenario-scoped, not the hardcoded test package.
    for (const crew of PROOF_CREW) {
      expect(union.has(crew), `scenario package must contain in-scope crew ${crew}`).toBeTruthy()
      expect(YEG_14_TEST_CREW).not.toContain(crew)
    }

    // 3) Non-trivial output.
    expect(union.size, 'scenario package should contain bids for several crew').toBeGreaterThan(1)
  })

  test('PBS-3402 — the legacy YEG-14 package excludes the scenario-only crew', async ({ request }) => {
    test.setTimeout(PACKAGE_TIMEOUT_MS + 60_000)
    const token = await login(request)

    const res = await request.get(
      `${PBS_API}/api/admin/algorithm-export/yeg-test-package?periodCode=${encodeURIComponent(PERIOD_CODE)}`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: PACKAGE_TIMEOUT_MS },
    )
    expect(res.ok(), `yeg-test-package → ${res.status()}`).toBeTruthy()

    const files = untar(zlib.gunzipSync(Buffer.from(await res.body())))
    const union = crewUnionAcrossPackage(files)
    // eslint-disable-next-line no-console
    console.log(`[PBS-3402] yeg-14 package crew (${union.size}): ${[...union].sort((a, b) => +a - +b).join(' ')}`)

    // The YEG-14 package is confined to the 14 test crew, so the scenario-only
    // proof crew (274/499) must be absent — the discriminator the engine relies on.
    const yeg = new Set(YEG_14_TEST_CREW)
    const outsideYeg = [...union].filter((id) => !yeg.has(id))
    expect(outsideYeg, `yeg-14 package must stay within the 14 test crew: ${outsideYeg}`).toEqual([])
    for (const crew of PROOF_CREW) {
      expect(union.has(crew), `yeg-14 package must NOT contain scenario-only crew ${crew}`).toBeFalsy()
    }
  })
})
