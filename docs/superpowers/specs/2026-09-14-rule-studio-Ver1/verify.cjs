// Verifies documentation prototype interactions, never the real rule engine.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const shots=path.resolve(__dirname,'../../../assets/screenshots/rule-studio');
 const receipt={scope:'HTML design prototypes only; no product/engine validation',screenshots:[],checks:[]};
 const capture=async(page,name)=>{let v=1,file;do{file=path.join(shots,`${name}-Ver${v++}.png`)}while(fs.existsSync(file));await page.screenshot({path:file,fullPage:true});receipt.screenshots.push(path.relative(process.cwd(),file));};
 const has=async(p,txt)=>assert((await p.locator('body').innerText()).includes(txt),`Missing text: ${txt}`);
 for(const concept of ['workbench','dossier','lab']){
  const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(__dirname,concept+'.html')).href);
  await has(page,'Draft v1');
  await capture(page,concept+(concept==='dossier'?'-evidence':'-definition'));
  const step=async(i)=>page.locator(`[data-step="${i}"]`).first().click();
  const act=async(a)=>page.locator(`[data-action="${a}"]`).first().click();
  await step(5);
  assert(await page.locator('[data-action="individual"]').isDisabled());
  assert(await page.locator('[data-action="optimizer"]').isDisabled());
  await step(2);
  await page.locator('[name="mode"]').selectOption('consecutive');
  await page.getByRole('button',{name:'Save as new revision',exact:true}).click();
  await has(page,'Draft v2');await has(page,'consecutive days');await has(page,'previous revisions are preserved');
  await page.locator('[name="message"]').fill('Does a flight after midnight interrupt the off day?');
  await page.getByRole('button',{name:'Add note',exact:true}).click();
  await has(page,'Does a flight after midnight interrupt the off day?');
  await step(3);assert(!(await page.locator('.chatbody').innerText()).includes('Does a flight after midnight'));
  await step(2);await has(page,'Does a flight after midnight interrupt the off day?');
  await act('approve');await step(3);await act('approve');await step(4);await act('build');
  await step(5);await act('individual');await has(page,'6/6');await act('optimizer');await has(page,'candidate 103s (+3%)');
  await step(6);await act('packet');await has(page,'Demo packet prepared.');
  await capture(page,concept+'-review');
  await step(3);await act('fault');await has(page,'Draft v3');
  await act('approve');await step(3);await act('approve');await step(4);await act('build');await step(5);await act('individual');
  await has(page,'5 PASS, 1 FAIL');assert(await page.locator('[data-action="optimizer"]').isDisabled());
  await has(page,'Incorrectly legal');
  if(concept==='workbench')await capture(page,'workbench-failure');
  await act('fix');await page.locator('[name="history"]').check();await page.getByRole('button',{name:'Save as new revision',exact:true}).click();
  await has(page,'Draft v4');await act('approve');await step(3);await act('approve');await step(4);await act('build');await step(5);await act('individual');await act('optimizer');
  await step(2);await page.locator('[name="y"]').fill('3');await page.getByRole('button',{name:'Save as new revision',exact:true}).click();
  await has(page,'Draft v5');await step(6);assert(await page.locator('[data-action="packet"]').isDisabled());await has(page,'Missing / stale');
  await act('history');await page.locator('[data-restore="1"]').click();await has(page,'Draft v6');await has(page,'separate days');
  await step(2);await page.locator('[name="x"]').fill('7');await page.locator('[name="y"]').fill('8');await page.getByRole('button',{name:'Save as new revision',exact:true}).click();await has(page,'Invalid parameters');await has(page,'Draft v6');
  if(concept==='lab'){await page.locator('[data-day="0"]').click();await has(page,'Example roster changed only.');}
  await page.setViewportSize({width:760,height:1000});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),concept+' viewport overflow');
  assert.deepEqual(errors,[]);
  receipt.checks.push(concept+': PASS — revision, stage chat, gates, pass/fail/revise/rerun, stale lock, restore, invalid input, responsive layout, no JS errors');
  await page.close();
 }
 const page=await browser.newPage({viewport:{width:1600,height:1000}});await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);assert.equal(await page.locator('a.open').count(),3);await capture(page,'design-overview');await browser.close();
 fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
