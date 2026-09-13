// Read-only UI verification against an already authenticated, loaded Live tab.
// Does not create fixture data, Apply recovery, or Save.
const {chromium,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path');
(async()=>{
 const b=await chromium.connectOverCDP(process.env.S1_CDP_URL||'http://127.0.0.1:9227');
 const p=b.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('cr.rois.one/altair/live'));
 if(!p)throw Error('Open authenticated cr.rois.one Live tab and load ADD crews first');
 const shot=async(name)=>{let v=1;const dir='docs/assets/screenshots/crew-recovery';while(fs.existsSync(path.join(dir,`${name}-Ver${v}.png`)))v++;const file=path.join(dir,`${name}-Ver${v}.png`);await p.screenshot({path:file});console.log('SNAPSHOT',file)};
 const baseline=async()=>p.evaluate(()=>{const r=window.__ganttTest.roster();return {source:r.filter(x=>x.crewId==='J4002'&&x.pairingId===152056).map(x=>x.id).sort(),sl:r.filter(x=>x.id===1354958).length,sby:r.filter(x=>x.id===1355089&&x.crewId==='J4011').length,donor:r.filter(x=>x.crewId==='J4005'&&x.pairingId===152097).map(x=>x.id).sort(),draft:window.__ganttTest.draftState().opCount}});
 const expected={source:[1354952,1354953,1354954,1354955,1354956,1354957],sl:1,sby:1,donor:[1355090,1355091],draft:0};
 expect(await baseline()).toEqual(expected);
 for(const [method,crew] of [['standby','J4011'],['swap-duty','J4005']]){
  await p.getByTestId('violations-button').click();await p.locator('[data-crew-id="J4002"][data-recoverable="true"] input').check();await p.getByTestId('alert-recovery-selected').click();
  await p.getByTestId(`recovery-plan-filter-${method}`).click();const c=p.getByTestId(`recovery-crew-checkbox-${crew}`);await expect(c).toBeEnabled();await c.check();await expect(p.getByTestId('recovery-apply')).toBeEnabled();
  await shot(`s1-${method}-verified-selectable`);
  await p.getByTestId('recovery-violation-dialog').getByRole('button',{name:'Preview',exact:true}).click();await expect(p.getByTestId('recovery-return-to-options')).toBeVisible();await shot(`s1-${method}-verified-preview`);
  await p.getByTestId('recovery-violation-dialog-close').click();expect(await baseline()).toEqual(expected);console.log('PASS',method,'selectable + preview; no recovery applied');
 }
 await shot('s1-options-ready-baseline');await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
