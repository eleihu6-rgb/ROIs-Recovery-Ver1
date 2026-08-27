// Explore the roiscloud portal login page so we can script login.
// Run: node project-operations/scripts/explore.mjs
import pw from '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/e2e/node_modules/playwright/index.js'
const { chromium } = pw
import { mkdirSync } from 'node:fs'

const OUT = new URL('../out/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const URL_ = 'https://crew-f8-usva-tst.roiscloud.com/fpqe/'

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
const page = await ctx.newPage()

console.log('goto', URL_)
await page.goto(URL_, { waitUntil: 'networkidle', timeout: 60000 }).catch(e => console.log('goto warn:', e.message))
await page.waitForTimeout(2500)

console.log('url after load:', page.url())
console.log('title:', await page.title())

await page.screenshot({ path: OUT + 'login.png', fullPage: true })

// Dump candidate form fields
const fields = await page.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('input, button, a[role="button"], textarea, select')) {
    out.push({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type'),
      name: el.getAttribute('name'),
      id: el.id || null,
      placeholder: el.getAttribute('placeholder'),
      testid: el.getAttribute('data-testid'),
      text: (el.innerText || el.value || '').slice(0, 40),
    })
  }
  return out
})
console.log('FIELDS:', JSON.stringify(fields, null, 2))
console.log('BODY_TEXT:', (await page.evaluate(() => document.body.innerText)).slice(0, 800))

await browser.close()
