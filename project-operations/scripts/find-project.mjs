// Using cached session, find the workspace + PBS Dev Team project.
import pw from '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/e2e/node_modules/playwright/index.js'
const { chromium } = pw
const BASE = 'https://crew-f8-usva-tst.roiscloud.com'
const AUTH = new URL('../.auth/state.json', import.meta.url).pathname
const OUT = new URL('../out/', import.meta.url).pathname

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true, storageState: AUTH })
const page = await ctx.newPage()

await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(3000)
console.log('home url:', page.url())
await page.screenshot({ path: OUT + 'home.png', fullPage: true })

// Collect all links (workspace + project navigation)
const links = await page.evaluate(() =>
  [...document.querySelectorAll('a[href]')].map(a => ({ href: a.getAttribute('href'), text: (a.innerText || '').trim().slice(0, 50) }))
    .filter(l => l.href && !l.href.startsWith('http'))
)
console.log('LINKS:', JSON.stringify(links, null, 2))
console.log('BODY:', (await page.evaluate(() => document.body.innerText)).slice(0, 1500))

await browser.close()
