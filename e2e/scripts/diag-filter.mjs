import { chromium } from 'playwright'
const GANTT='http://localhost:5173', API='http://localhost:3000'
const browser=await chromium.launch({headless:false,args:['--start-maximized']})
const ctx=await browser.newContext({viewport:null})
const page=await ctx.newPage()
page.on('response',r=>{ if(/\/api\/(base|rank)\b/.test(r.url())) console.log('[net]',r.status(),r.url()) })
const auth=(await(await ctx.request.post(`${API}/api/auth/login`,{data:{userCode:'admin',password:'123456'}})).json()).data
await page.addInitScript(a=>window.sessionStorage.setItem('rois-auth',JSON.stringify({user:{userCode:a.userCode,userName:a.userName,schema:a.schema,isAdmin:a.isAdmin??0},token:a.token})),auth)
await page.goto(`${GANTT}/altair/`)
await page.waitForFunction(()=>typeof window.__ganttTest!=='undefined',undefined,{timeout:30000})
await page.getByTestId('module-nav-live').click()
const empty=page.getByTestId('live-empty-state')
try{await empty.waitFor({state:'visible',timeout:5000}); await empty.click()}catch{await page.getByTestId('filter-btn').click()}
await page.getByTestId('filter-dialog').waitFor({state:'visible'})
await page.getByTestId('filter-tab-crew').click().catch(()=>{})
await page.getByTestId('filter-crew-base-trigger').click()
await page.waitForTimeout(8000)
const opts=await page.locator('[data-testid^="filter-crew-base-opt-"]').count()
console.log('[diag] base option count after 8s:', opts)
const yvr=await page.getByTestId('filter-crew-base-opt-YVR').count()
console.log('[diag] YVR option present:', yvr)
await browser.close()
