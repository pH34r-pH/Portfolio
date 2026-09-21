import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const base='http://127.0.0.1:4173';
const pages=[['home','/'],['research','/research/'],['atlas','/atlas/'],['reproduce','/reproduce/']];
const views=[['s23-ultra',360,780,true],['desktop',1440,900,false]];
await fs.mkdir('ux-screenshots',{recursive:true});
const browser=await chromium.launch({headless:true});
for(const [view,width,height,mobile] of views){
  const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  for(const [name,path] of pages){
    const page=await context.newPage();
    await page.goto(base+path,{waitUntil:'networkidle'});
    await page.screenshot({path:`ux-screenshots/${view}--${name}.png`,fullPage:true});
    await page.close();
  }
  const manifestResponse=await context.request.get(base+'/publication.json');
  if(manifestResponse.ok()){
    const manifest=await manifestResponse.json();
    const notebook=manifest.notebooks?.find(n=>n.slug!=='visual_intuition_atlas');
    if(notebook){const page=await context.newPage();await page.goto(base+'/notebooks/'+encodeURIComponent(notebook.slug)+'/',{waitUntil:'networkidle'});await page.screenshot({path:`ux-screenshots/${view}--notebook.png`,fullPage:true});await page.close();}
  }
  await context.close();
}
await browser.close();
