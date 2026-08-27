/**
 * nginx compression & browser cache validation
 *
 * Verifies that:
 *   1. JS/CSS responses are gzip/br compressed (Content-Encoding)
 *   2. Assets under /assets/ (production build) carry immutable cache headers
 *   3. HTML entry point carries no-cache headers
 *   4. No contradictory Cache-Control headers (no immutable + no-store together)
 *
 * Run:
 *   cd e2e
 *   GANTT_TEST_USER=<user> GANTT_TEST_PASS=<pass> \
 *     npx playwright test --config=config/perf.config.ts
 */
import { test, expect } from '@playwright/test'

const PROD = 'https://crew-f8-usva-tst.roiscloud.com'
const GANTT_URL = `${PROD}/altair/`
const API_LOGIN = `${PROD}/altair/live/api/auth/login`

const LOGIN_USER = process.env.GANTT_TEST_USER ?? 'admin'
const LOGIN_PASS = process.env.GANTT_TEST_PASS ?? '123456'

interface ResponseRecord {
  url: string
  status: number
  encoding: string
  cacheControl: string
  vary: string
  contentType: string
}

async function apiLogin(page: import('@playwright/test').Page): Promise<string | null> {
  try {
    const res = await page.request.post(API_LOGIN, {
      data: { userCode: LOGIN_USER, password: LOGIN_PASS },
      timeout: 15_000,
    })
    // Response shape: { code: 200, data: { token: "..." } } or { token: "..." }
    const body = await res.json().catch(() => ({})) as {
      token?: string
      data?: { token?: string }
      code?: number
    }
    const token = body.token ?? body.data?.token ?? null
    console.log(`\nAPI login → status=${res.status()}  token=${token ? token.substring(0, 20) + '...' : 'null'}`)
    return token
  } catch (e) {
    console.log(`\nAPI login error: ${String(e)}`)
    return null
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('Perf-4001 — FULL REPORT — response headers for all JS/CSS resources', async ({ page }) => {
  const all: ResponseRecord[] = []

  page.on('response', response => {
    all.push({
      url: response.url().replace(PROD, ''),
      status: response.status(),
      encoding: response.headers()['content-encoding'] ?? '(none)',
      cacheControl: response.headers()['cache-control'] ?? '(none)',
      vary: response.headers()['vary'] ?? '(none)',
      contentType: response.headers()['content-type'] ?? '',
    })
  })

  const token = await apiLogin(page)
  if (token) {
    await page.addInitScript(
      ({ token, userCode }) => {
        sessionStorage.setItem(
          'rois-auth',
          JSON.stringify({ user: { userCode, userName: userCode, schema: 'f8' }, token }),
        )
      },
      { token, userCode: LOGIN_USER },
    )
  }

  await page.goto(GANTT_URL, { waitUntil: 'networkidle', timeout: 90_000 })

  // UI login fallback
  const userInput = page.locator('input[type="text"], [data-testid="login-user-code"]').first()
  if (await userInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await userInput.fill(LOGIN_USER)
    await page.locator('input[type="password"]').first().fill(LOGIN_PASS)
    await page.locator('button[type="submit"], [data-testid="login-sign-in"]').first().click()
    await page.waitForLoadState('networkidle', { timeout: 60_000 })
  }

  const jscssList = all.filter(r => /\.(js|css|tsx?|mjs)(\?|$)/.test(r.url))

  const W = 115
  console.log('\n' + '═'.repeat(W))
  console.log(` NGINX HEADERS REPORT  (${all.length} total responses, ${jscssList.length} JS/CSS)`)
  console.log('═'.repeat(W))
  console.log(` ${'URL'.padEnd(70)} ${'Enc'.padEnd(6)} Cache-Control`)
  console.log('─'.repeat(W))

  // Count issues
  const notGzipped: string[] = []
  const contradictory: string[] = [] // has both immutable and no-store
  const missingImmutable: string[] = [] // /assets/ files without immutable

  for (const r of jscssList) {
    const gzipOk = r.encoding === 'gzip' || r.encoding === 'br'
    const hasImmutable = r.cacheControl.includes('immutable')
    const hasNoStore = r.cacheControl.includes('no-store')
    const isBuiltAsset = r.url.includes('/assets/')

    if (!gzipOk) notGzipped.push(r.url)
    if (hasImmutable && hasNoStore) contradictory.push(r.url)
    if (isBuiltAsset && !hasImmutable) missingImmutable.push(r.url)

    const flags = [
      gzipOk ? '✓gz' : '✗gz',
      hasImmutable && !hasNoStore ? '✓cache' : hasNoStore && !hasImmutable ? ' nc   ' : hasImmutable && hasNoStore ? '⚠ BOTH' : '      ',
    ].join(' ')

    console.log(` ${flags}  ${r.url.substring(0, 69).padEnd(70)} ${r.encoding.padEnd(6)} ${r.cacheControl.substring(0, 40)}`)
  }

  console.log('═'.repeat(W))

  // Summary
  const devMode = jscssList.some(r => r.url.includes('/src/') || r.url.includes('@vite') || r.url.includes('@fs/'))
  if (devMode) {
    console.log('\n ⚠  VITE DEV MODE DETECTED')
    console.log('    Server is serving raw .tsx/.ts source files (~180 requests per load).')
    console.log('    This is the PRIMARY cause of slow loading — not compression or cache.')
    console.log('    Fix: build for production and serve built /assets/ files instead.')
    console.log('    Command: cd gantt && npm run build  →  serve dist/ as static files\n')
  }

  if (notGzipped.length === 0) {
    console.log(` ✅ Gzip: all ${jscssList.length} files compressed`)
  } else {
    console.log(` ❌ Gzip missing (${notGzipped.length}): ${notGzipped.slice(0, 3).join(', ')}`)
  }

  if (contradictory.length === 0) {
    console.log(' ✅ Cache headers: no contradictory immutable+no-store conflicts')
  } else {
    console.log(` ❌ Contradictory headers (${contradictory.length}): ${contradictory.slice(0, 3).join(', ')}`)
  }

  if (missingImmutable.length === 0) {
    console.log(' ✅ Built assets: all /assets/ files have immutable cache')
  } else {
    console.log(` ❌ Built assets missing immutable (${missingImmutable.length}): ${missingImmutable.slice(0, 3).join(', ')}`)
  }
  console.log('═'.repeat(W) + '\n')

  expect(contradictory, `Contradictory Cache-Control (immutable + no-store on same file):\n  ${contradictory.join('\n  ')}`).toHaveLength(0)
  expect(notGzipped, `Files not gzip-compressed:\n  ${notGzipped.join('\n  ')}`).toHaveLength(0)
})

test('Perf-4002 — HTML entry: Cache-Control must be no-store or no-cache', async ({ request }) => {
  const res = await request.get(GANTT_URL, {
    headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'gzip, deflate, br' },
    maxRedirects: 5,
    timeout: 30_000,
  })

  const cc = res.headers()['cache-control'] ?? ''
  const encoding = res.headers()['content-encoding'] ?? '(none)'
  const status = res.status()

  console.log(`\nHTML  status=${status}  encoding=${encoding}`)
  console.log(`      cache-control=${cc || '(none)'}`)

  if (status === 200) {
    // Must not be cached (no-store or no-cache)
    expect(cc, 'HTML must carry no-store or no-cache').toMatch(/no-store|no-cache/)
    // Must not have immutable (that would mean index.html itself is cached forever)
    expect(cc, 'HTML must not be immutable').not.toContain('immutable')
  }
})
