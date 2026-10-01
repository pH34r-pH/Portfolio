import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base=process.env.PORTFOLIO_AUDIT_URL||'http://127.0.0.1:4173';
const out=process.env.STARTUP_EVIDENCE_DIR||'ux-screenshots/startup';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),evidence=[];
const manifest=await (await fetch(base+'/assets/model-posters/manifest.json')).json();
const snapshot=page=>page.evaluate(()=>PortfolioModelMachine.startup());
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function open(options={},setup,path='') {
  const context=await browser.newContext({colorScheme:'dark',...options}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));if(setup)await setup(page);
  await page.goto(base+path,{waitUntil:'domcontentloaded'});return {context,page,errors};
}
function matchPoster(state,asset) {
  const fit=Math.min(state.width/asset.view.width,state.height/asset.view.height);
  const dx=(state.width-asset.view.width*fit)/2,dy=(state.height-asset.view.height*fit)/2;
  state.landmarks.forEach(([x,y],index)=>{
    const [px,py]=asset.view.landmarks[index];
    assert.ok(Math.hypot(x-px*fit-dx,y-py*fit-dy)<.01,`Poster/live landmark ${index} shifts`);
  });
}
async function startup(name,width,height,change,options={}) {
  let release;const held=new Promise(resolve=>{release=resolve;});let requested=0;
  const {context,page,errors}=await open({viewport:{width,height},...options},async page=>{
    await page.route('**/vendor/three@0.186.1/three.module.js',async route=>{requested++;await held;await route.continue();});
    await page.addInitScript(()=>{const native=requestAnimationFrame;window.heldStartup=[];window.holdStartup=true;window.requestAnimationFrame=callback=>native(time=>{if(window.holdStartup&&callback.toString().includes('advanceStartup'))window.heldStartup.push(callback);else callback(time);});window.releaseStartup=()=>{window.holdStartup=false;window.heldStartup.splice(0).forEach(callback=>native(callback));};});
  });
  await expect.poll(()=>requested).toBe(1);await expect(page.locator('[data-model-boot]')).toContainText('booting');
  await expect(page.locator('.machine-poster')).toBeVisible();await page.screenshot({path:`${out}/${name}-powered-down.png`});
  if(change){await page.setViewportSize(change);await page.evaluate(()=>scrollTo(0,600));await settle(page);}
  release();await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-render','webgl',{timeout:30000});
  await expect.poll(()=>page.evaluate(()=>heldStartup.length)).toBe(1);
  const prepared=await snapshot(page);assert.equal(prepared.phase,'prepared');assert.equal(prepared.handoffs,0);
  const view=prepared.firstFrame,phone=page.viewportSize().width<=720;
  matchPoster(view,manifest.assets.find(a=>a.name===(phone?'phone':'desktop')&&a.theme==='dark'));
  await page.screenshot({path:`${out}/${name}-matched-off.png`});
  await page.evaluate(()=>{scrollTo(0,0);releaseStartup();});
  await expect.poll(async()=>(await snapshot(page)).phase).toBe('igniting');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  const hidden=await snapshot(page);await settle(page);
  assert.equal((await snapshot(page)).elapsed,hidden.elapsed);assert.equal(hidden.scheduled,false,'Hidden startup has no pending frame');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(async()=>(await snapshot(page)).phase,{timeout:10000}).toBe('ready');
  const ready=await snapshot(page);assert.equal(ready.handoffs,1);assert.equal(ready.completions,1);assert.equal(ready.scheduled,false);
  assert.ok(ready.elapsed>=900);await page.screenshot({path:`${out}/${name}-ready.png`});
  await page.evaluate(()=>{scrollTo(0,600);dispatchEvent(new Event('resize'));});await settle(page);
  assert.equal((await snapshot(page)).completions,1,'Startup does not repeat on native navigation');
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();assert.deepEqual(axe.violations,[]);
  assert.deepEqual(errors,[]);evidence.push({name,prepared,ready,requested,errors});await context.close();
}
async function fallback(mode,options={}) {
  let engines=0,release;const held=new Promise(resolve=>{release=resolve;});
  const {context,page,errors}=await open({viewport:{width:1366,height:768},...options},async page=>{
    page.on('request',request=>{if(request.url().includes('three@0.186.1'))engines++;});
    if(mode==='engine-failure')await page.route('**/vendor/three@0.186.1/**',route=>route.abort());
    if(mode==='module-failure')await page.route('**/assets/model-machine.js',route=>route.abort());
    if(mode==='timeout')await page.route('**/vendor/three@0.186.1/three.module.js',async route=>{await held;await route.continue();});
  });
  await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-startup','fallback',{timeout:18000});
  await expect(page.locator('[data-model-boot]')).toContainText('Static architecture');
  assert.ok(!await page.locator('[data-model-boot]').textContent().then(t=>t.includes('booting')));
  if(options.reducedMotion||options.forcedColors)assert.equal(engines,0);
  if(mode!=='module-failure')await expect(page.locator('[data-machine-fallback] svg')).toBeVisible();
  if(mode==='timeout') {
    release();const late=await page.evaluate(async()=>{await PortfolioModelMachine.run('late load');PortfolioModelMachine.pause();return PortfolioModelMachine.diagnostics();});
    assert.equal(late.rendering,'fallback','Late engine completion cannot revive a timed-out startup');
    assert.equal((await snapshot(page)).handoffs,0);
  }
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();assert.deepEqual(axe.violations,[]);
  assert.deepEqual(errors,[]);evidence.push({mode,engines,errors});await context.close();
}
async function noScript() {
  let engines=0;
  const {context,page,errors}=await open({viewport:{width:360,height:800},javaScriptEnabled:false},async page=>{
    page.on('request',request=>{if(request.url().includes('three@0.186.1'))engines++;});
  });
  await expect(page.locator('.machine-poster')).toBeVisible();
  await expect(page.locator('[data-model-boot]')).toBeHidden();
  await expect(page.getByText('Static architecture display',{exact:true})).toBeVisible();
  await page.locator('.digital-replay-disclosure summary').click();
  await expect(page.getByRole('link',{name:'Architecture and aggregation map',exact:true})).toHaveAttribute('href',/model-architecture/);
  assert.equal(engines,0);assert.deepEqual(errors,[]);evidence.push({mode:'no-script',engines,errors});await context.close();
}
async function contextLoss() {
  const {context,page,errors}=await open({viewport:{width:1440,height:1000}});
  await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-render','webgl',{timeout:30000});
  await expect.poll(async()=>(await snapshot(page)).phase).toBe('igniting');
  await page.evaluate(()=>document.querySelector('[data-machine-canvas]').dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
  await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-startup','fallback');
  await expect(page.locator('[data-model-boot]')).toContainText('Static architecture');
  const state=await snapshot(page);assert.equal(state.scheduled,false);assert.equal(state.completions,0);
  assert.deepEqual(errors,[]);evidence.push({mode:'context-loss-during-ignition',state,errors});await context.close();
}
async function restoredPosition() {
  let engines=0;
  const {context,page,errors}=await open({viewport:{width:1440,height:1000}},async page=>{
    page.on('request',request=>{if(request.url().endsWith('/three.module.js'))engines++;});
  },'/#about-contact');
  await expect.poll(()=>engines).toBe(1);
  await expect.poll(async()=>(await snapshot(page)).phase,{timeout:30000}).toBe('ready');
  const state=await snapshot(page);assert.equal(state.scheduled,false);assert.equal(state.completions,1);
  assert.deepEqual(errors,[]);evidence.push({mode:'restored-anchor-position',engines,state,errors});await context.close();
}
try {
  await startup('desktop',1440,1000);await startup('phone360',360,800);
  await startup('s23-ultra',412,915,null,{deviceScaleFactor:3});
  await startup('resize-to-phone',1366,768,{width:412,height:915});
  await startup('resize-to-desktop',360,800,{width:1280,height:900});
  await fallback('reduced-motion',{reducedMotion:'reduce'});await fallback('forced-colors',{forcedColors:'active'});
  await fallback('engine-failure');await fallback('module-failure');await fallback('timeout');
  await noScript();await contextLoss();await restoredPosition();
  console.log('Startup passed: automatic requests, matched off-state, resize/scroll races, hidden pause, one ignition, quiet/failure/timeout, NoJS and context loss.');
}catch(error){evidence.push({failure:error.message});throw error;}finally{await writeFile(`${out}/audit.json`,JSON.stringify(evidence,null,2));await browser.close();}
