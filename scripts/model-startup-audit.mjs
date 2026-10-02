import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {IGNITION_DURATION_MS,STARTUP_SCHEMA_VERSION,STARTUP_STATE_KEY} from '../site/assets/model-startup.js';
import {articleHost} from './model-audit-host.mjs';

const base=process.env.PORTFOLIO_AUDIT_URL||'http://127.0.0.1:4173';
const out=process.env.STARTUP_EVIDENCE_DIR||'ux-screenshots/startup';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),evidence=[];
const manifest=await (await fetch(base+'/assets/model-posters/manifest.json')).json();
const snapshot=page=>page.evaluate(()=>PortfolioModelStartup.snapshot());
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function scrollAwayAndBack(page) {
  const top=await page.locator('#model-chapter').evaluate(node=>node.getBoundingClientRect().top+scrollY);
  await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await settle(page);
  await page.evaluate(y=>scrollTo(0,y),top);await settle(page);
}
const startupState=state=>({schemaVersion:STARTUP_SCHEMA_VERSION,started:state.started,
  ignitionComplete:state.ignitionComplete,elapsedActiveMs:state.elapsedActiveMs,
  topologyVersion:'unit_hypersphere_depth3',styleVersion:'leaf01-blue-horizontal-native-resolution'});

async function open(options={},setup,path='',browserInstance=browser) {
  const context=await browserInstance.newContext({colorScheme:'dark',viewport:{width:1440,height:1000},...options});
  const page=await context.newPage(),errors=[];
  await page.addInitScript(()=>{
    window.portfolioStartupPhases=[];window.portfolioStartupDeadlines=[];
    const phases=new MutationObserver(records=>records.forEach(record=>{
      if(record.target.matches?.('[data-model-startup]'))window.portfolioStartupPhases.push(record.target.dataset.startup);
    }));
    phases.observe(document,{subtree:true,attributes:true,attributeFilter:['data-startup']});
    const nativeTimeout=window.setTimeout.bind(window);
    window.setTimeout=(callback,delay,...args)=>{
      if(delay===15000)window.portfolioStartupDeadlines.push(callback);
      return nativeTimeout(callback,delay,...args);
    };
    const nativeContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){
      if(typeof type==='string'&&type.startsWith('webgl')) {
        const count=Number(sessionStorage.getItem('__portfolioAuditWebglContexts')||0)+1;
        sessionStorage.setItem('__portfolioAuditWebglContexts',String(count));
      }
      return nativeContext.call(this,type,...args);
    };
    addEventListener('pagehide',event=>sessionStorage.setItem('__portfolioAuditPageHidePersisted',String(event.persisted)));
    addEventListener('pageshow',event=>sessionStorage.setItem('__portfolioAuditPageShowPersisted',String(event.persisted)));
  });
  page.on('pageerror',error=>errors.push(error.message));if(setup)await setup(page);
  await page.goto(base+path,{waitUntil:'domcontentloaded'});
  if(options.javaScriptEnabled!==false)await expect.poll(()=>page.evaluate(()=>Boolean(window.PortfolioModelStartup))).toBe(true);
  return {context,page,errors};
}

function matchPoster(state,asset) {
  const fit=Math.min(state.width/asset.view.width,state.height/asset.view.height);
  const dx=(state.width-asset.view.width*fit)/2,dy=(state.height-asset.view.height*fit)/2;
  state.landmarks.forEach(([x,y],index)=>{
    const [px,py]=asset.view.landmarks[index];
    assert.ok(Math.hypot(x-px*fit-dx,y-py*fit-dy)<.01,`Poster/live landmark ${index} shifts`);
  });
}

async function assertFreshHome(page,engineRequests) {
  const state=await snapshot(page);
  assert.equal(state.phase,'idle');assert.equal(state.started,false);assert.equal(state.ignitionComplete,false);
  assert.equal(state.elapsedActiveMs,0);assert.equal(engineRequests(),0,'3D engine is not requested before Start');
  await expect(page.locator('.machine-poster')).toBeVisible();
  await expect(page.getByRole('button',{name:'Start interactive model'})).toBeVisible();
  await expect(page.locator('[data-model-boot]')).toContainText('Static architecture display');
}

async function startup(name,width,height,change,options={}) {
  let release;const held=new Promise(resolve=>{release=resolve;});let requested=0;
  const {context,page,errors}=await open({viewport:{width,height},...options},async page=>{
    await page.route('**/vendor/three@0.186.1/three.module.js',async route=>{requested++;await held;await route.continue();});
    await page.addInitScript(()=>{
      const native=requestAnimationFrame;window.heldStartup=[];window.holdStartup=true;
      window.requestAnimationFrame=callback=>native(time=>{
        if(window.holdStartup&&callback.toString().includes('advanceStartup'))window.heldStartup.push(callback);
        else callback(time);
      });
      window.releaseStartup=()=>{window.holdStartup=false;window.heldStartup.splice(0).forEach(callback=>native(callback));};
    });
  });
  try {
    await assertFreshHome(page,()=>requested);
    const button=page.getByRole('button',{name:'Start interactive model'});
    await button.focus();await expect(button).toBeFocused();await page.keyboard.press('Enter');
    await expect.poll(()=>requested).toBe(1);
    const samePromise=await page.evaluate(()=>{
      const first=PortfolioModelStartup.start(),second=PortfolioModelStartup.start();
      return first===second;
    });
    assert.equal(samePromise,true,'Concurrent Start requests share the per-root promise');
    if(change){await page.setViewportSize(change);await page.evaluate(()=>scrollTo(0,600));await settle(page);}
    await expect(page.locator('.machine-poster')).toBeVisible();await page.screenshot({path:`${out}/${name}-powered-down.png`});
    release();
    await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-render','webgl',{timeout:30000});
    await expect.poll(()=>page.evaluate(()=>heldStartup.length)).toBe(1);
    const prepared=await snapshot(page);assert.equal(prepared.phase,'prepared');assert.equal(prepared.handoffs,0);
    const view=prepared.firstFrame,phone=page.viewportSize().width<=720;
    matchPoster(view,manifest.assets.find(asset=>asset.name===(phone?'phone':'desktop')&&asset.theme==='dark'));
    await page.screenshot({path:`${out}/${name}-matched-off.png`});

    await page.evaluate(()=>{scrollTo(0,0);releaseStartup();});
    await expect.poll(async()=>(await snapshot(page)).phase).toBe('igniting');
    await expect.poll(async()=>(await snapshot(page)).elapsedActiveMs).toBeGreaterThan(100);
    await page.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const hidden=await snapshot(page);assert.equal(hidden.scheduled,false,'Hidden startup has no pending frame');
    await page.waitForTimeout(120);assert.equal((await snapshot(page)).elapsedActiveMs,hidden.elapsedActiveMs,'Hidden time does not count toward ignition');
    await page.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
      document.dispatchEvent(new Event('visibilitychange'));
      document.querySelector('[data-machine-canvas]').style.transform='translateY(2000px)';
    });
    await expect.poll(()=>page.locator('[data-machine-canvas]').evaluate(canvas=>{
      const box=canvas.getBoundingClientRect();return box.bottom<=0||box.top>=innerHeight;
    })).toBe(true);
    const offscreen=await snapshot(page);assert.equal(offscreen.scheduled,false,'Offscreen startup has no pending frame');
    await page.waitForTimeout(120);assert.equal((await snapshot(page)).elapsedActiveMs,offscreen.elapsedActiveMs,'Offscreen time does not count toward ignition');
    await page.evaluate(()=>{
      document.querySelector('[data-machine-canvas]').style.transform='';
      dispatchEvent(new Event('scroll'));
    });
    await expect.poll(async()=>(await snapshot(page)).phase,{timeout:10000}).toBe('ready');
    const ready=await snapshot(page);
    assert.equal(ready.handoffs,1);assert.equal(ready.completions,1);assert.equal(ready.scheduled,false);
    assert.equal(ready.ignitionComplete,true);assert.equal(ready.elapsedActiveMs,IGNITION_DURATION_MS);
    assert.equal(ready.durationMs,1800);await page.screenshot({path:`${out}/${name}-ready.png`});
    await page.evaluate(()=>{scrollTo(0,600);dispatchEvent(new Event('resize'));});await settle(page);
    assert.equal((await snapshot(page)).completions,1,'Startup does not repeat on viewport changes');
    const saved=JSON.parse(await page.evaluate(key=>sessionStorage.getItem(key),STARTUP_STATE_KEY));
    assert.deepEqual(saved,startupState({started:true,ignitionComplete:true,elapsedActiveMs:1800}));
    const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
    assert.deepEqual(axe.violations,[]);assert.deepEqual(errors,[]);
    evidence.push({name,phase:'ready',prepared,ready,requested,concurrentStartDeduplicated:samePromise,
      hiddenPauseMs:120,offscreenPauseMs:120,keyboardStart:true,sessionState:saved,errors});
  } catch(error) {
    evidence.push({name,failure:error.message});throw error;
  } finally {release();await context.close();}
}

async function quietFallback(mode,options) {
  let engines=0;
  const {context,page,errors}=await open({viewport:{width:1366,height:768},...options},async page=>{
    page.on('request',request=>{if(request.url().includes('three@0.186.1'))engines++;});
  });
  try {
    await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-startup','quiet');
    await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-render','fallback');
    await expect(page.locator('[data-machine-fallback] svg')).toBeVisible();
    await expect(page.getByRole('button',{name:/interactive model/})).toBeHidden();
    assert.equal(engines,0);assert.deepEqual(errors,[]);
    const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
    assert.deepEqual(axe.violations,[]);
    await page.emulateMedia(mode==='reduced-motion'?{reducedMotion:'no-preference'}:{forcedColors:'none'});
    await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-startup','idle');
    await expect(page.getByRole('button',{name:'Start interactive model'})).toBeVisible();
    assert.equal(engines,0,'Clearing quiet mode does not bypass Home startup intent');
    await page.getByRole('button',{name:'Start interactive model'}).click();
    await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-render','webgl',{timeout:15000});
    await expect.poll(async()=>(await snapshot(page)).phase).toBe('ready');
    assert.ok(engines>0);assert.deepEqual(errors,[]);
    evidence.push({mode,phase:'quiet then explicit Home startup',engines,errors});
  } finally {await context.close();}
}

async function noScript() {
  let engines=0;
  const {context,page,errors}=await open({viewport:{width:360,height:800},javaScriptEnabled:false},async page=>{
    page.on('request',request=>{if(request.url().includes('three@0.186.1'))engines++;});
  });
  try {
    await expect(page.locator('.machine-poster')).toBeVisible();
    await expect(page.locator('[data-model-boot]')).toBeHidden();
    await expect(page.locator('.digital-startup-static')).toBeVisible();
    await expect(page.getByRole('button',{name:'Start interactive model'})).toBeHidden();
    await page.locator('.digital-replay-disclosure summary').click();
    await expect(page.getByRole('link',{name:'Architecture and aggregation map',exact:true})).toHaveAttribute('href',/model-architecture/);
    assert.equal(engines,0);assert.deepEqual(errors,[]);
    evidence.push({mode:'no-script',posterVisible:true,staticDescription:true,engines,errors});
  } finally {await context.close();}
}

async function lateLoadTimeout(retryBeforeSettle=false) {
  let release;const held=new Promise(resolve=>{release=resolve;});let requests=0;
  const {context,page,errors}=await open({},async page=>{
    await page.route('**/vendor/three@0.186.1/three.module.js',async route=>{
      requests++;if(requests===1)await held;await route.continue();
    });
  });
  try {
    await assertFreshHome(page,()=>requests);
    assert.equal(await page.evaluate(()=>portfolioStartupDeadlines.length),0,'No timeout runs before user intent');
    await page.getByRole('button',{name:'Start interactive model'}).click();
    if(retryBeforeSettle)await page.evaluate(()=>{window.firstStartupAttempt=PortfolioModelStartup.start();});
    await expect.poll(()=>requests).toBe(1);
    await expect.poll(()=>page.evaluate(()=>portfolioStartupDeadlines.length)).toBe(1);
    await page.evaluate(()=>portfolioStartupDeadlines[0]());
    await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-startup','fallback');
    const timedOut=await snapshot(page);assert.equal(timedOut.started,true);assert.equal(timedOut.handoffs,0);
    assert.equal((await snapshot(page)).phase,'fallback','Timed-out startup retains its static fallback');
    assert.equal(await page.locator('[data-model-machine]').getAttribute('data-render'),'fallback');
    if(retryBeforeSettle) {
      await scrollAwayAndBack(page);
      await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-startup','fallback');
      await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-render','fallback');
      await expect(page.locator('[data-machine-fallback] svg')).toBeVisible();
      await page.getByRole('button',{name:'Retry interactive model'}).click();
      const reusedFailedPromise=await page.evaluate(()=>PortfolioModelStartup.start()===window.firstStartupAttempt);
      assert.equal(reusedFailedPromise,false,'Retry during an unsettled import owns a fresh startup promise');
      release();
      await expect.poll(async()=>(await snapshot(page)).phase,{timeout:12000}).toBe('ready');
      const retried=await snapshot(page);
      assert.equal(retried.ignitionComplete,true);assert.equal(retried.handoffs,1);assert.equal(retried.completions,1);
      assert.deepEqual(errors,[]);
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('__portfolioAuditWebglContexts')),'1',
        'The held import completes only the valid retry generation');
      evidence.push({mode:'timeout-and-retry-before-import-settles',requests,deadlinesBeforeStart:0,deadlinesAfterStart:1,timedOut,
        retryPhase:retried.phase,retried,errors});
    } else {
      release();await page.waitForTimeout(150);
      assert.equal((await snapshot(page)).phase,'fallback','Late module completion cannot revive a failed startup');
      await scrollAwayAndBack(page);
      await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-startup','fallback');
      await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-render','fallback');
      await expect(page.locator('[data-machine-fallback] svg')).toBeVisible();
      assert.deepEqual(errors,[]);
      evidence.push({mode:'late-import-after-timeout',requests,deadlinesBeforeStart:0,deadlinesAfterStart:1,timedOut,lateCompletionIgnored:true,errors});
    }
  } finally {release();await context.close();}
}

async function restoredVisit() {
  const {context,page,errors}=await open();let engineRequests=0;
  page.on('request',request=>{if(request.url().includes('three@0.186.1'))engineRequests++;});
  try {
    await assertFreshHome(page,()=>engineRequests);
    await page.getByRole('button',{name:'Start interactive model'}).click();
    await expect.poll(async()=>(await snapshot(page)).phase,{timeout:10000}).toBe('ready');
    const first=await snapshot(page);
    assert.equal(first.elapsedActiveMs,IGNITION_DURATION_MS);assert.equal(first.completions,1);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('__portfolioAuditWebglContexts')),'1');

    await page.goto(base+'/about/',{waitUntil:'domcontentloaded'});
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    await expect.poll(async()=>(await snapshot(page)).phase,{timeout:20000}).toBe('ready');
    const second=await snapshot(page);
    assert.equal(second.started,true);assert.equal(second.ignitionComplete,true);
    assert.equal(second.elapsedActiveMs,IGNITION_DURATION_MS);assert.equal(second.completions,0,'Completed ignition is not replayed after full navigation');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('__portfolioAuditWebglContexts')),'2',
      'Ordinary full navigation creates a new page-owned WebGL context');
    const phases=await page.evaluate(()=>portfolioStartupPhases);
    assert.equal(phases.includes('igniting'),false,'A completed retained start resumes without ignition');
    assert.deepEqual(errors,[]);evidence.push({mode:'retained-full-navigation',first,second,webglContexts:2,
      noFreshClick:true,noSecondIgnition:true,note:'Full navigation recreates the page and WebGL context; session intent is retained.',errors});
  } finally {await context.close();}
}

async function holdPartialIgnitionFrame(page) {
  await page.addInitScript(()=>{
    // Freeze after partial progress so runner speed cannot turn this into completion.
    const native=requestAnimationFrame.bind(window);window.heldStartup=[];window.holdStartup=true;
    window.requestAnimationFrame=callback=>native(time=>{
      const elapsed=window.PortfolioModelStartup?.snapshot?.().elapsedActiveMs||0;
      if(window.holdStartup&&callback.toString().includes('advanceStartup')&&elapsed>=150)window.heldStartup.push(callback);
      else callback(time);
    });
    window.releaseStartup=()=>{window.holdStartup=false;window.heldStartup.splice(0).forEach(callback=>native(callback));};
    addEventListener('pagehide',()=>window.heldStartup.splice(0));
  });
}

async function bfcache() {
  // Playwright disables BFCache and its headless shell uses a separate cache
  // policy. Use full Chromium's new headless mode and remove only that switch.
  const cacheBrowser=await chromium.launch({headless:false,args:['--headless=new'],
    ignoreDefaultArgs:['--disable-back-forward-cache']});
  const {context,page,errors}=await open({},holdPartialIgnitionFrame,'',cacheBrowser);
  try {
    await page.getByRole('button',{name:'Start interactive model'}).click();
    await expect.poll(async()=>(await snapshot(page)).phase,{timeout:10000}).toBe('igniting');
    await expect.poll(async()=>(await snapshot(page)).elapsedActiveMs).toBeGreaterThan(150);
    await expect.poll(()=>page.evaluate(()=>window.heldStartup.length)).toBe(1);
    const before=await snapshot(page);
    assert.equal(before.ignitionComplete,false,'BFCache case captures partial ignition');
    assert.ok(before.elapsedActiveMs<IGNITION_DURATION_MS);
    await page.getByRole('link',{name:'About',exact:true}).first().click();
    await expect(page).toHaveURL(/\/about\/$/);
    await page.waitForTimeout(16000);
    await page.goBack({waitUntil:'commit'});await expect(page).toHaveURL(base+'/');
    await page.evaluate(()=>window.releaseStartup());
    await expect.poll(async()=>(await snapshot(page)).phase,{timeout:10000}).toBe('ready');
    const persisted=await page.evaluate(()=>sessionStorage.getItem('__portfolioAuditPageShowPersisted'));
    assert.equal(persisted,'true','Browser restores the healthy homepage from BFCache');
    const after=await snapshot(page);
    assert.equal(after.ignitionComplete,true);assert.equal(after.completions,before.completions+1);
    assert.ok(after.elapsedActiveMs>=before.elapsedActiveMs,'BFCache resumes the retained partial ignition progress');
    assert.equal(after.handoffs,before.handoffs,'BFCache does not hand off the scene a second time');
    assert.equal(await page.evaluate(()=>portfolioStartupPhases.filter(phase=>phase==='igniting').length),1,
      'BFCache does not restart the ignition phase');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('__portfolioAuditWebglContexts')),'1',
      'BFCache resumes the existing WebGL context without creating another one');
    assert.deepEqual(errors,[]);evidence.push({mode:'bfcache',before,after,persisted:true,webglContexts:1,noReignition:true,errors});
  } finally {await context.close();await cacheBrowser.close();}
}

async function contextLossRetry() {
  const {context,page,errors}=await open();
  try {
    await page.getByRole('button',{name:'Start interactive model'}).click();
    await expect.poll(async()=>(await snapshot(page)).phase,{timeout:10000}).toBe('ready');
    await page.evaluate(()=>document.querySelector('[data-machine-canvas]').dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
    await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-startup','fallback');
    await expect(page.getByRole('button',{name:'Retry interactive model'})).toBeVisible();
    const failed=await snapshot(page);assert.equal(failed.ignitionComplete,true);
    const ignitionsBeforeRetry=await page.evaluate(()=>portfolioStartupPhases.filter(phase=>phase==='igniting').length);
    await page.getByRole('button',{name:'Retry interactive model'}).click();
    await expect.poll(async()=>(await snapshot(page)).phase,{timeout:12000}).toBe('ready');
    const retried=await snapshot(page);
    assert.equal(retried.ignitionComplete,true);assert.equal(retried.completions,failed.completions);
    assert.equal(await page.evaluate(()=>portfolioStartupPhases.filter(phase=>phase==='igniting').length),ignitionsBeforeRetry,
      'Retry after completed ignition does not repeat the ignition phase');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('__portfolioAuditWebglContexts')),'2',
      'Context-loss retry replaces the terminal canvas and creates one fresh context');
    assert.deepEqual(errors,[]);evidence.push({mode:'context-loss-retry',failed,retried,webglContexts:2,noReignition:true,errors});
  } finally {await context.close();}
}

async function directStartupFailure(mode) {
  let failedResourceRequests=0,engineRequests=0;
  const {context,page,errors}=await open({},async page=>{
    page.on('request',request=>{if(request.url().includes('three@0.186.1'))engineRequests++;});
    if(mode==='engine-failure')await page.route('**/vendor/three@0.186.1/**',async route=>{failedResourceRequests++;await route.abort();});
    if(mode==='module-failure')await page.route('**/assets/model-machine.js',async route=>{failedResourceRequests++;await route.abort();});
  });
  try {
    await assertFreshHome(page,()=>engineRequests);
    await page.getByRole('button',{name:'Start interactive model'}).click();
    await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-startup','fallback',{timeout:15000});
    await expect(page.getByRole('button',{name:'Retry interactive model'})).toBeVisible();
    await expect(page.locator('[data-model-boot]')).toContainText('Interactive model unavailable');
    assert.equal(failedResourceRequests,1,`${mode} exercises the requested failed resource`);
    if(mode==='engine-failure') {
      assert.ok(engineRequests>0);await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-render','fallback');
      await expect(page.locator('[data-machine-fallback] svg')).toBeVisible();
      await scrollAwayAndBack(page);
      await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-startup','fallback');
      await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-render','fallback');
      await expect(page.locator('[data-machine-fallback] svg')).toBeVisible();
    } else {
      assert.equal(engineRequests,0,'A failed machine-controller module never requests the 3D engine');
      await expect(page.locator('.machine-poster')).toBeVisible();
    }
    assert.deepEqual(errors,[]);
    evidence.push({mode,failedResourceRequests,engineRequests,staticFallbackRetained:true,errors});
  } finally {await context.close();}
}

async function articleIsolation() {
  const host=await articleHost(base),context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  if(host.html)await page.route(host.url,route=>route.fulfill({contentType:'text/html',body:host.html}));
  try {
    await page.goto(host.url,{waitUntil:'networkidle'});
    const root=page.locator('[data-model-machine]').first();await expect(root).toHaveCount(1);
    assert.equal(await root.getAttribute('data-digital-home'),null,'Article root has no Home marker');
    assert.equal(await root.getAttribute('data-model-startup'),null,'Article lifecycle remains independent');
    await expect(root.locator('[data-model-start]')).toHaveCount(0,'Home Start control is not attached to article roots');
    assert.deepEqual(errors,[]);
    evidence.push({mode:'article-isolation',articleEvidence:host.kind,slug:host.slug||null,
      homeMarker:false,homeStartControl:false,note:host.kind==='published-article'
        ? 'Finished MyST article route used.' : 'Canonical source fixture used because no finished publication bundle is served.'});
  } finally {await context.close();}
}

async function articleQuietModeRestore(mode,initial,cleared) {
  const host=await articleHost(base),context=await browser.newContext({viewport:{width:1366,height:900},...initial}),page=await context.newPage(),errors=[];
  let engines=0;page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().includes('three@0.186.1'))engines++;});
  if(host.html)await page.route(host.url,route=>route.fulfill({contentType:'text/html',body:host.html}));
  try {
    await page.goto(host.url,{waitUntil:'networkidle'});
    const root=page.locator('[data-model-machine]').first();await root.scrollIntoViewIfNeeded();
    await expect(root).toHaveAttribute('data-render','fallback');
    assert.equal(await root.getAttribute('data-model-startup'),null,'Article retains independent startup ownership');
    assert.equal(engines,0,`${mode} article remains static before the preference clears`);
    await page.emulateMedia(cleared);
    await expect(root).toHaveAttribute('data-render','webgl',{timeout:15000});
    assert.equal(await root.getAttribute('data-model-startup'),null,'Preference restoration does not attach Home startup state');
    assert.ok(engines>0,`${mode} article boots again when its visible quiet preference clears`);
    assert.deepEqual(errors,[]);
    evidence.push({mode:`article-${mode}-restoration`,articleEvidence:host.kind,engines,visibleRestore:true,errors});
  } finally {await context.close();}
}

try {
  await startup('desktop',1440,1000);
  await startup('phone360',360,800);
  await startup('resize-to-phone',1366,768,{width:412,height:915});
  await quietFallback('reduced-motion',{reducedMotion:'reduce'});
  await quietFallback('forced-colors',{forcedColors:'active'});
  await noScript();
  await directStartupFailure('engine-failure');
  await directStartupFailure('module-failure');
  await lateLoadTimeout();
  await lateLoadTimeout(true);
  await restoredVisit();
  await bfcache();
  await contextLossDuringIgnition();
  await contextLossRetry();
  await articleIsolation();
  await articleQuietModeRestore('reduced-motion',{reducedMotion:'reduce'},{reducedMotion:'no-preference'});
  await articleQuietModeRestore('forced-colors',{forcedColors:'active'},{forcedColors:'none'});
  console.log('Manual startup passed: no pre-intent engine request, deduplicated Start, 1.8s active-visible ignition, session restore, BFCache, retry, quiet/static fallback, NoJS and article isolation.');
} catch(error) {
  evidence.push({failure:error.message});throw error;
} finally {
  await writeFile(`${out}/audit.json`,JSON.stringify(evidence,null,2));await browser.close();
}

async function failContextDuringIgnition(page) {
  await page.getByRole('button',{name:'Start interactive model'}).click();
  await expect.poll(async()=>(await snapshot(page)).phase,{timeout:10000}).toBe('igniting');
  await expect.poll(async()=>(await snapshot(page)).elapsedActiveMs).toBeGreaterThan(150);
  if(await page.evaluate(()=>Array.isArray(window.heldStartup)))
    await expect.poll(()=>page.evaluate(()=>window.heldStartup.length)).toBe(1);
  await page.evaluate(()=>document.querySelector('[data-machine-canvas]').dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
  const failed=await snapshot(page);
  assert.equal(failed.ignitionComplete,false);assert.ok(failed.elapsedActiveMs>0&&failed.elapsedActiveMs<IGNITION_DURATION_MS);
  assert.equal(failed.scheduled,false);assert.equal(failed.completions,0);
  return failed;
}

async function assertStaticHomeFallback(page) {
  await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-startup','fallback');
  await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-render','fallback');
  await expect(page.locator('[data-machine-fallback] svg')).toBeVisible();
}

async function contextLossDuringIgnition() {
  const {context,page,errors}=await open({},holdPartialIgnitionFrame);
  try {
    const failed=await failContextDuringIgnition(page);
    await assertStaticHomeFallback(page);
    await scrollAwayAndBack(page);
    await assertStaticHomeFallback(page);
    assert.deepEqual(errors,[]);
    evidence.push({mode:'context-loss-during-ignition-and-scrollback',failed,fallbackRetained:true,errors});
  } finally {await context.close();}
}
