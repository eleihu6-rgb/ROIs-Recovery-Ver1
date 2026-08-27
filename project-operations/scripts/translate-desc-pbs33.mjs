// Translate PBS-33 description to "English + original Chinese", preserving TipTap structure.
import pw from '/Users/kimi/Library/Mobile Documents/com~apple~CloudDocs/DevOps/ROIs-Crew-Ver4-PBS/e2e/node_modules/playwright/index.js'
import { fileURLToPath } from 'node:url'
import { writeFileSync, mkdirSync } from 'node:fs'
const { chromium } = pw

const BASE = 'https://crew-f8-usva-tst.roiscloud.com'
const SLUG = 'flair'
const PROJECT = 'badd48f1-a48b-4457-95e0-e2cbf2941cb2'
const ISSUE = 'b8763fca-f2ac-4334-aac2-8a53f839b062' // PBS-33
const AUTH = fileURLToPath(new URL('../.auth/state.json', import.meta.url))
const OUT = fileURLToPath(new URL('../out/', import.meta.url))
mkdirSync(OUT, { recursive: true })

// Same element structure / data-ids / classes as the original; English line <br> original Chinese line.
const html = [
  '<p class="editor-paragraph-block" data-id="52becffe-e844-4fd0-8099-79f8a0bd9d90">Jen suggests that, to refine the optimization results, we first run a simple scenario based on the YEG base, while also preparing a larger scenario,<br>Jen 建议, 为了打磨优化结果, 目前先采用YEG基地简单的场景来运行, 同时需要准备更大的场景,</p>',
  '<p class="editor-paragraph-block" data-id="78cdcdfe-ad50-4fac-9675-efca7918efeb"></p>',
  '<p class="editor-paragraph-block" data-id="67d2d19a-1945-4c45-9fa5-aed0e7290cf0">So we are considering importing the customer\'s official crew bids into the system (although there are many conceptual differences)<br>所以考虑将客户正式的crew bid 导入到系统内 (虽然有很多概念上的不同)</p>',
  '<p class="editor-paragraph-block" data-id="d01d3e68-1fc6-48ba-817a-591ac284d52c">Import one full month of crew bids:<br><br>- Target month: June 2026<br><br>导入一个月完整的crew bids:<br>- 目标月份2026年6月</p>',
  '<p class="editor-paragraph-block" data-id="af720bf0-e7c6-400d-981a-9837ad4adbae"></p>',
  '<ul class="list-disc pl-7 space-y-(--list-spacing-y) tight" data-id="1a0dfa59-9a0b-426c-b359-869b4f7dac97" data-tight="true">',
  '<li class="not-prose space-y-2" data-id="c52ed3fd-3ad9-486c-8df2-50c39d2c1e87"><p class="editor-paragraph-block" data-id="15f5f304-c36e-464c-bbcf-d13d632f34f1">If a crew has no current bid, import the default directly<br>如果crew没有current bid, 就直接导入defult</p></li>',
  '<li class="not-prose space-y-2" data-id="a66a0365-acb6-4c93-92c0-67c34cd72c9f"><p class="editor-paragraph-block" data-id="c0a4ca61-bba3-4abc-aac6-4708cfb1f2d1">If there are current bids (multiple), import the first group (ignore the other groups)<br>如果有current bid(多个), 导入第一个group(忽略其它group)</p></li>',
  '<li class="not-prose space-y-2" data-id="0f5b6469-8f02-4b5c-b4eb-19766a8a6ccd"><p class="editor-paragraph-block" data-id="ddc73fab-ea2e-43c6-98de-fdbcea29d896">Map the various properties in the customer\'s txt file onto ours<br>将客户txt文件内的各种property 对照到我们的上面</p></li>',
  '<li class="not-prose space-y-2" data-id="7b0b93f9-92d8-4b79-b0d2-e23fcd1a62ac"><p class="editor-paragraph-block" data-id="99819f79-19ef-429e-a71e-46a9d9276156">Because our properties are designed based on NPBS, 95%+ should map successfully<br>因为我们的property 是根据NPBS 设计的,所以应该是95+能对照上</p></li>',
  '</ul>',
  '<p class="editor-paragraph-block" data-id="15b4bc58-8066-4cbb-80e6-f8aab4da026c"></p>',
  '<p class="editor-paragraph-block" data-id="df4f0f81-725f-4b33-a75f-26ee276d43f9"></p>',
  '<p class="editor-paragraph-block" data-id="d62c8049-6b05-4301-92f7-d24b699fdb82"></p>',
  '<p class="editor-paragraph-block" data-id="6abc8b8c-a08d-4354-b5f9-202d341ddaec"></p>',
].join('')

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, storageState: AUTH })
const page = await ctx.newPage()
await page.goto(`${BASE}/${SLUG}/projects/${PROJECT}/issues/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(1500)

const patch = await page.evaluate(async ({ slug, project, id, html }) => {
  const csrf = document.cookie.split('; ').find(c => c.startsWith('csrftoken='))?.split('=')[1]
  const res = await fetch(`/api/workspaces/${slug}/projects/${project}/issues/${id}/`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'x-csrftoken': csrf || '' },
    credentials: 'same-origin',
    body: JSON.stringify({ description_html: html }),
  })
  return { status: res.status, body: (await res.text()).slice(0, 300) }
}, { slug: SLUG, project: PROJECT, id: ISSUE, html })
console.log('PATCH status:', patch.status, patch.status === 204 || patch.status === 200 ? 'OK' : patch.body)

// Verify
const after = await page.evaluate(async ({ slug, project, id }) => {
  const res = await fetch(`/api/workspaces/${slug}/projects/${project}/issues/${id}/`, { headers: { accept: 'application/json' } })
  const j = await res.json()
  return j.description_html
}, { slug: SLUG, project: PROJECT, id: ISSUE })
writeFileSync(OUT + 'pbs33-desc-after.html', after)
console.log('contains English "Jen suggests":', after.includes('Jen suggests'))
console.log('still contains original Chinese:', after.includes('打磨优化结果'))

// Screenshot the rendered issue detail
await page.goto(`${BASE}/${SLUG}/browse/PBS-33/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(4000)
await page.screenshot({ path: OUT + 'pbs33-detail.png', fullPage: true })
console.log('screenshot -> out/pbs33-detail.png')

await browser.close()
