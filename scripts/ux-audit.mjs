import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const sizes = [
  ['small-phone',320,568], ['phone',360,800], ['large-phone',430,932],
  ['fold-cover',344,882], ['fold-unfolded-portrait',768,1016],
  ['fold-unfolded-landscape',1016,768], ['tablet-portrait',820,1180],
  ['tablet-landscape',1180,820], ['laptop',1366,768], ['desktop',1920,1080],
  ['ultrawide',2560,1080]
];
const browser=await chromium.launch({headless:true});
let failures=[];
for (const [name,width,height] of sizes) {
  const page=await browser.newPage({viewport:{width,height},isMobile:width<600,hasTouch:width<900});
  await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
  const metrics=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,bodyWidth:document.body.getBoundingClientRect().width}));
  if(metrics.scrollWidth>metrics.clientWidth+1) failures.push(name+': horizontal overflow '+JSON.stringify(metrics));
  for (const palette of ['nacre','oxide','violet','high-contrast']) {\n    await page.evaluate(p=>{document.documentElement.dataset.palette=p},palette);\n    const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();\n    if(axe.violations.length) failures.push(name+'/'+palette+': axe '+axe.violations.map(v=>v.id).join(','));\n  }\n  const axe={violations:[]};
  
  await page.keyboard.press('Tab');
  const focus=await page.evaluate(()=>{const e=document.activeElement,s=getComputedStyle(e);return {tag:e?.tagName,outline:s.outlineStyle,width:s.outlineWidth}});
  if(!focus.tag||focus.outline==='none'||focus.width==='0px') failures.push(name+': missing visible keyboard focus');
  await page.close();
}
await browser.close();
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('UX matrix passed: '+sizes.map(x=>x[0]).join(', '));
