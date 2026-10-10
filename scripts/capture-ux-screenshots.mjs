import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const base=process.env.PORTFOLIO_AUDIT_URL||'http://127.0.0.1:4173';
const output=process.env.PORTFOLIO_SCREENSHOT_DIR||'ux-screenshots';
const pages=[['home','/'],['research','/research/'],['atlas','/atlas/'],['about','/about/']];
const views=[['s23-ultra',360,780,true],['desktop',1440,900,false]];
const themes=['light','dark'];
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
for(const [view,width,height,mobile] of views){
  const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  for(const theme of themes){
    for(const [name,path] of pages){
      const page=await context.newPage();
      await page.goto(base+path,{waitUntil:'networkidle'});
      await page.evaluate((value)=>{
        document.documentElement.dataset.themeMode=value;
        document.documentElement.dataset.theme=value;
      },theme);
      await page.screenshot({path:`${output}/${view}--${theme}--${name}.png`,fullPage:true});
      await page.close();
    }
  }
  const manifestResponse=await context.request.get(base+'/publication.json');
  if(manifestResponse.ok()){
    const manifest=await manifestResponse.json();
    const notebook=manifest.notebooks?.find(n=>n.slug!=='visual_intuition_atlas');
    if(notebook){
      for(const theme of themes){
        const page=await context.newPage();
        await page.goto(base+'/notebooks/'+encodeURIComponent(notebook.slug)+'/',{waitUntil:'networkidle'});
        await page.evaluate((value)=>{
          document.documentElement.dataset.themeMode=value;
          document.documentElement.dataset.theme=value;
        },theme);
        await page.screenshot({path:`${output}/${view}--${theme}--notebook.png`,fullPage:true});
        await page.close();
      }
    }
  }
  await context.close();
}
await browser.close();
