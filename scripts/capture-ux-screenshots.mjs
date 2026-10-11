import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { NATIVE_SCREENSHOT_TIMEOUT_MS } from './model-audit-host.mjs';

const base=process.env.PORTFOLIO_AUDIT_URL||'http://127.0.0.1:4173';
const pages=[['home','/'],['research','/research/'],['atlas','/atlas/'],['about','/about/']];
const views=[['s23-ultra',360,780,true],['desktop',1440,900,false]];
const themes=['light','dark'];
await fs.mkdir('ux-screenshots',{recursive:true});
const browser=await chromium.launch({headless:true});
async function captureRoute(context,view,theme,path,name){
  const page=await context.newPage(),image=`ux-screenshots/${view}--${theme}--${name}.png`;
  const started=performance.now();
  console.log(`Capturing native screenshot: ${image}`);
  try{
    await page.goto(base+path,{waitUntil:'networkidle'});
    await page.evaluate((value)=>{
      document.documentElement.dataset.themeMode=value;
      document.documentElement.dataset.theme=value;
    },theme);
    await page.screenshot({path:image,fullPage:true,timeout:NATIVE_SCREENSHOT_TIMEOUT_MS});
    console.log(`Captured native screenshot: ${image} (${Math.round(performance.now()-started)}ms)`);
  }finally{await page.close();}
}

async function captureNotebook(context,view){
  const manifestResponse=await context.request.get(base+'/publication.json');
  if(!manifestResponse.ok())return;
  const manifest=await manifestResponse.json();
  const notebook=manifest.notebooks?.find(n=>n.slug!=='visual_intuition_atlas');
  if(!notebook)return;
  for(const theme of themes){
    await captureRoute(context,view,theme,'/notebooks/'+encodeURIComponent(notebook.slug)+'/','notebook');
  }
}

async function captureView([view,width,height,mobile]){
  const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  try{
    for(const theme of themes)for(const [name,path] of pages)await captureRoute(context,view,theme,path,name);
    await captureNotebook(context,view);
  }finally{await context.close();}
}

try{for(const view of views)await captureView(view);}
finally{await browser.close();}
