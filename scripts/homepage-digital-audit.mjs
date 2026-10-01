import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base=process.env.PORTFOLIO_AUDIT_URL||'http://127.0.0.1:4181';
const out=process.env.HOMEPAGE_EVIDENCE_DIR||'/workspace/scratch/dr-cho-homepage/audit';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),evidence=[];
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const snapshot=page=>page.evaluate(()=>window.PortfolioHomepage.snapshot());

async function open(options,setup) {
  const context=await browser.newContext({colorScheme:'dark',...options}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message)); if(setup)await setup(page);
  await page.goto(base,{waitUntil:'networkidle'});
  await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-render',/webgl|fallback/,{timeout:30000});
  await settle(page);return {context,page,errors};
}
async function readChecks(page) {
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=1,'no horizontal document overflow');
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  assert.deepEqual(axe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
  const targets=await page.locator('button,input,select,summary,.actions a,.digital-next').evaluateAll(nodes=>nodes.filter(n=>n.checkVisibility()).map(n=>{
    const r=n.getBoundingClientRect(); return {tag:n.tagName,text:n.textContent.slice(0,35),width:r.width,height:r.height};
  }));
  assert.ok(targets.every(r=>r.width>=44&&r.height>=44),JSON.stringify(targets.filter(r=>r.width<44||r.height<44)));
}
async function scrollTo(page,id) {
  await page.locator(`#${id}`).evaluate(node=>window.scrollTo({top:window.scrollY+node.getBoundingClientRect().top-innerHeight*.12,behavior:'instant'}));
  await settle(page);
}
async function sequence(page,name,phone) {
  const sequence=[];const origin=(await snapshot(page)).model.graphOrigin;
  for(const [label,id] of [['top','introduction'],['model-chapter','model-chapter'],['research','research-chapter'],['projects','projects'],['footer','about-contact']]) {
    if(label==='top')await page.evaluate(()=>scrollTo(0,0)); else await scrollTo(page,id);
    await settle(page);const state=await snapshot(page);
    await page.screenshot({path:`${out}/${name}-${label}.png`});
    assert.ok((state.model.glass?.visible||0)<=3,'at most three GPU display faces');
    if(!phone&&label!=='footer')assert.deepEqual(state.model.graphOrigin,origin,'model stays centered through native scroll');
    if(label==='footer')assert.ok(await page.locator('.digital-visual').evaluate(node=>node.getBoundingClientRect().bottom)<page.viewportSize().height*.65,'stage releases at end of journey');
    sequence.push({label,scrollY:await page.evaluate(()=>scrollY),state});
  }
  const transition=await page.evaluate(()=>{const a=document.querySelector('#model-chapter').getBoundingClientRect(),b=document.querySelector('#research-chapter').getBoundingClientRect();return scrollY+(a.bottom+b.top)/2-innerHeight*.5;});
  await page.evaluate(y=>window.scrollTo(0,y),transition);await settle(page);
  await page.screenshot({path:`${out}/${name}-content-transition.png`});
  sequence.push({label:'content-transition',state:await snapshot(page)});return sequence;
}
async function nativeNavigation(page) {
  await page.evaluate(()=>scrollTo(0,0));await settle(page);
  await page.mouse.move(page.viewportSize().width/2,200);await page.mouse.wheel(0,520);
  await page.waitForFunction(()=>scrollY>100);const wheelY=await page.evaluate(()=>scrollY);
  await page.evaluate(()=>scrollTo(0,0));await settle(page);
  await page.locator('.digital-next[href="#model-chapter"]').click();
  await expect(page).toHaveURL(base+'/#model-chapter');await settle(page);
  await page.goBack();await expect(page).toHaveURL(base+'/');
  await page.locator('.menu-toggle').click();await expect(page.locator('#site-menu')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('.menu-toggle')).toBeFocused();
  await page.locator('.skip-link').focus();await page.keyboard.press('Enter');await expect(page.locator('#main-content')).toBeFocused();
  await scrollTo(page,'research-chapter');
  await page.locator('#research-chapter .actions a').first().click();
  await expect(page).toHaveURL(base+'/articles/accessible-does-not-imply-used/');
  await expect(page.locator('h1').first()).toBeVisible();
  await page.goBack();await expect(page.locator('#research-heading')).toBeVisible();
  return {wheelY,articleBack:true,menuFocus:true,skipLink:true};
}
async function controls(page) {
  await scrollTo(page,'model-chapter');
  const disclosure=page.locator('.digital-replay-disclosure');await disclosure.locator(':scope>summary').click();
  await page.locator('[data-replay-timeline]').focus();await page.keyboard.press('End');
  assert.equal(await page.evaluate(()=>PortfolioModelMachine.snapshot().frame),360);
  await page.locator('[data-replay-rewind]').click();
  assert.equal(await page.evaluate(()=>PortfolioModelMachine.snapshot().frame),0);
  await page.locator('[data-replay-play]').click();
  await page.waitForFunction(()=>PortfolioModelMachine.snapshot().frame>0);
  await page.locator('[data-replay-play]').click();
  const frame=await page.evaluate(()=>PortfolioModelMachine.snapshot().frame);await settle(page);
  assert.equal(await page.evaluate(()=>PortfolioModelMachine.snapshot().frame),frame);
  await page.locator('[data-machine-settings]>summary').click();await page.locator('[data-probe-layer]').focus();
  await expect(page.locator('[data-probe-layer]')).toBeFocused();await page.keyboard.press('ArrowDown');
  await readChecks(page);await page.locator('[data-machine-settings]>summary').click();
  await disclosure.locator(':scope>summary').click();return {rewind:true,scrub:true,nativePlay:true,inspect:true};
}
async function quality(page,name) {
  await scrollTo(page,'model-chapter');const disclosure=page.locator('.digital-replay-disclosure');
  await disclosure.locator(':scope>summary').click();await page.locator('[data-machine-settings]>summary').click();
  await page.locator('[data-glass-quality]').selectOption('refraction');await settle(page);
  await page.locator('[data-machine-settings]>summary').click();await disclosure.locator(':scope>summary').click();
  await page.evaluate(()=>scrollTo(0,0));await settle(page);
  const full=await snapshot(page);assert.equal(full.model.quality.effective,'refraction');
  assert.ok(full.model.drawCalls<=20&&full.model.triangles<=20000);
  assert.equal(full.model.nodes,1668);assert.equal(full.model.edges,3601);
  await page.screenshot({path:`${out}/${name}-clear-refraction-top.png`});return full;
}
async function zoom(page) {
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});
  await settle(page);assert.equal((await snapshot(page)).mode,'native');
  assert.ok((await snapshot(page)).panes.every(p=>p.transform==='none'));
  await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await settle(page);
  await page.setViewportSize({width:720,height:800});await settle(page);await readChecks(page);
  return {pinchScale2:true,layoutWidth720:true};
}
async function profile(page) {
  const samples=[];
  for(let index=0;index<12;index++) {
    await page.evaluate(i=>window.scrollTo(0,500+i*35),index);
    samples.push(await page.evaluate(()=>new Promise(resolve=>{const start=performance.now();requestAnimationFrame(()=>resolve(performance.now()-start));})));
  }
  samples.sort((a,b)=>a-b);return {nativeRafGapMs:{p50:samples[6],p95:samples[11],samples:12},state:await snapshot(page),timingQualification:'Local software WebGL; CPU submission includes warm-up. GPU timer may be unavailable. Not a physical-phone performance estimate.'};
}
async function normal(name,width,height) {
  const {context,page,errors}=await open({viewport:{width,height},...(width<=720?{isMobile:true,hasTouch:true,deviceScaleFactor:3}:{})});
  await readChecks(page);const auto=await snapshot(page);
  if(auto.model.quality.detectedSoftware)assert.equal(auto.model.quality.effective,'lightweight');
  assert.equal(auto.model.nodes,1668);assert.equal(auto.model.edges,3601);
  const shots=await sequence(page,name,width<=720);
  const replay=await controls(page);const navigation=await nativeNavigation(page);
  const full=await quality(page,name);const performance=await profile(page);
  await page.evaluate(()=>{document.documentElement.dataset.theme='light';scrollTo(0,0);});await settle(page);
  await readChecks(page);await page.screenshot({path:`${out}/${name}-light-top.png`});
  const zoomChecks=width>720?await zoom(page):null;
  assert.deepEqual(errors,[]);evidence.push({name,width,height,auto,shots,replay,navigation,full,performance,zoomChecks,errors});await context.close();
}
async function fallback(mode) {
  const options={viewport:{width:360,height:800},...(mode==='reduced-motion'?{reducedMotion:'reduce'}:{}),...(mode==='forced-colors'?{forcedColors:'active'}:{})};
  const {context,page,errors}=await open(options,async page=>{
    if(mode==='webgl-unavailable')await page.addInitScript(()=>{const native=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:native.call(this,type,...args);};});
  });
  await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-render','fallback');
  await readChecks(page);await scrollTo(page,'research-chapter');await readChecks(page);
  assert.ok((await snapshot(page)).panes.every(p=>p.transform==='none'));
  await page.screenshot({path:`${out}/${mode}-research.png`});
  assert.deepEqual(errors,[]);evidence.push({mode,nativeReading:true,errors});await context.close();
}
try {
  await normal('desktop',1440,1000);await normal('phone360',360,800);await normal('phone320',320,780);
  for(const mode of ['reduced-motion','webgl-unavailable','forced-colors'])await fallback(mode);
  console.log('Homepage pass: native scroll, stable desktop model/release, controls, anchors/back/focus, zoom, axe and fallback checks passed.');
}catch(error){evidence.push({failure:error.message});throw error;}finally{await writeFile(`${out}/audit.json`,JSON.stringify(evidence,null,2));await browser.close();}
