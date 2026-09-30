import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const sizes=[['small-phone',320,568],['phone',360,800],['large-phone',430,932],['fold-cover',344,882],['fold-unfolded-portrait',768,1016],['fold-unfolded-landscape',1016,768],['tablet-portrait',820,1180],['tablet-landscape',1180,820],['laptop',1366,768],['desktop',1920,1080],['ultrawide',2560,1080]];
const modes=['light','dark']; const browser=await chromium.launch({headless:true}); const failures=[];
for(const [name,width,height] of sizes){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<900,reducedMotion:'reduce'});
  const page=await context.newPage(); await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
  const metrics=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
  if(metrics.scrollWidth>metrics.clientWidth+1) failures.push(`${name}: horizontal overflow ${JSON.stringify(metrics)}`);
  for(const mode of modes){
    await page.evaluate(value=>{document.documentElement.dataset.mode=value},mode);
    const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
    if(axe.violations.length) failures.push(`${name}/${mode}: axe ${axe.violations.map(v=>v.id).join(', ')}`);
  }
  const machine=page.locator('[data-model-machine]');
  if(await machine.count()){
    const box=await machine.boundingBox();
    if(!box || box.width>width+1) failures.push(`${name}: model machine exceeds viewport`);
  }
  await page.keyboard.press('Tab');
  const focus=await page.evaluate(()=>{const e=document.activeElement,s=e?getComputedStyle(e):null;return{tag:e?.tagName,outline:s?.outlineStyle,width:s?.outlineWidth}});
  if(!focus.tag||focus.outline==='none'||focus.width==='0px') failures.push(`${name}: missing visible keyboard focus`);
  await context.close();
}
await browser.close();
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log(`UX matrix passed: ${sizes.map(([n])=>n).join(', ')}`)