// Log in to the Plane portal and cache the session to .auth/state.json
// Run: node project-operations/scripts/login.mjs
import pw from '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/e2e/node_modules/playwright/index.js'
import { mkdirSync } from 'node:fs'
const { chromium } = pw

const BASE = 'https://crew-f8-usva-tst.roiscloud.com'
const EMAIL = process.env.PLANE_EMAIL || 'ryan@rois.us'
const PASSWORD = process.env.PLANE_PASSWORD || 'R@iscrew2027'

const AUTH = new URL('../.auth/', import.meta.url).pathname
const OUT = new URL('../out/', import.meta.url).pathname
mkdirSync(AUTH, { recursive: true })
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
const page = await ctx.newPage()

await page.goto(BASE + '/fpqe/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(1500)

// Step 1: email
await page.fill('input#email, input[name="email"]', EMAIL)
await page.click('button[type="submit"]')
await page.waitForTimeout(2500)

// Step 2: password (field appears after Continue)
const pwSel = 'input[type="password"], input[name="password"], input#password'
await page.waitForSelector(pwSel, { timeout: 20000 })
await page.fill(pwSel, PASSWORD)
await page.screenshot({ path: OUT + 'before-submit.png' })
await page.click('button[type="submit"]')

await page.waitForTimeout(6000)
await page.waitForLoadState('networkidle').catch(() => {})

console.log('url after login:', page.url())
console.log('title:', await page.title())
await page.screenshot({ path: OUT + 'after-login.png', fullPage: true })

const body = (await page.evaluate(() => document.body.innerText)).slice(0, 1200)
console.log('BODY:', body)

await ctx.storageState({ path: AUTH + 'state.json' })
console.log('saved session ->', AUTH + 'state.json')

await browser.close()
