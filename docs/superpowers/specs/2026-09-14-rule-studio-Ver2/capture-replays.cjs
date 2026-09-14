// Capture animated documentation-prototype walkthroughs; no product tests or API calls.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const {pathToFileURL}=require('url');
(async()=>{
 const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1080,height:760}});
 await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
 const dir=path.join(__dirname,'replays');
 for(let i=1;i<=12;i++)for(const pair of ['A','B']){
  const id=String(i).padStart(2,'0')+pair;
  for(let frame=0;frame<3;frame++){
   await page.evaluate(({id,frame})=>window.recordCase(id,frame),{id,frame});
   await page.locator('#record-panel').screenshot({path:path.join(dir,`${id}-frame${frame}.png`)});
  }
 }
 await browser.close();console.log('PASS: 24 prototype case replays captured, 3 browser frames each.');
})().catch(e=>{console.error(e);process.exit(1)});
