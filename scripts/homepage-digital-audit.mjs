import './homepage-presentation-audit.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {homepageLifecycle,nativeFingerScroll} from './homepage-lifecycle-audit.mjs';
import {auditPlayback} from './model-playback-audit.mjs';

const base=process.env.PORTFOLIO_AUDIT_URL||'http://127.0.0.1:4173';
const out=process.env.HOMEPAGE_EVIDENCE_DIR||'ux-screenshots/homepage';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),evidence=[];
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const snapshot=page=>page.evaluate(()=>window.PortfolioHomepage.snapshot());
const manifestResponse=await fetch(base+'/publication.json');
const published=manifestResponse.ok&&(manifestResponse.headers.get('content-type')||'').includes('json');
if(process.env.PORTFOLIO_PUBLICATION_BUNDLE==='1')assert.ok(published,'Exact-bundle audit requires publication manifest');

async function open(options,setup) {
  const context=await browser.newContext({colorScheme:'dark',...options}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message)); if(setup)await setup(page);
  await page.goto(base,{waitUntil:'networkidle'});
  const quiet=options.reducedMotion==='reduce'||options.forcedColors==='active';
  if(!quiet)await page.getByRole('button',{name:'Start interactive model'}).click();
  await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-render',/webgl|fallback/,{timeout:30000});
  if (!quiet) await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-startup',/ready|fallback/,{timeout:30000});
  await page.evaluate(()=>PortfolioModelMachine.pause());
  await settle(page);return {context,page,root:page.locator('[data-model-machine]').first(),errors};
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
  const camera=(await snapshot(page)).model.camera;
  await page.mouse.move(page.viewportSize().width/2,200);await page.mouse.wheel(0,520);
  await page.waitForFunction(()=>scrollY>100);const wheelY=await page.evaluate(()=>scrollY);
  assert.deepEqual((await snapshot(page)).model.camera,camera,'Native wheel does not orbit the graph');
  await page.evaluate(()=>scrollTo(0,0));await settle(page);
  await page.locator('.digital-next[href="#model-chapter"]').click();
  await expect(page).toHaveURL(base+'/#model-chapter');await settle(page);
  await page.goBack();await expect(page).toHaveURL(base+'/');
  await page.locator('.menu-toggle').click();await expect(page.locator('#site-menu')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('.menu-toggle')).toBeFocused();
  await page.locator('.skip-link').focus();await page.keyboard.press('Enter');await expect(page.locator('#main-content')).toBeFocused();
  await scrollTo(page,'research-chapter');
  const article=page.locator('#research-chapter .actions a').first();
  await expect(article).toHaveAttribute('href','/articles/accessible-does-not-imply-used/');
  if(published) {
    await article.click();await expect(page).toHaveURL(base+'/articles/accessible-does-not-imply-used/');
    await expect(page.locator('h1').first()).toBeVisible();
    await page.goBack();await expect(page.locator('#research-heading')).toBeVisible();
  }
  return {wheelY,articleBack:published?'passed':'Finished bundle exercises the canonical article; source surface checks its link.',menuFocus:true,skipLink:true};
}
async function controls(page) {
  await scrollTo(page,'model-chapter');
  const disclosure=page.locator('.digital-replay-disclosure');await disclosure.locator(':scope>summary').focus();await page.keyboard.press('Enter');
  await page.locator('[data-replay-timeline]').focus();await page.keyboard.press('End');
  assert.equal(await page.evaluate(()=>PortfolioModelMachine.snapshot().frame),360);
  await expect(page.locator('[data-machine-output]')).toContainText('the model le');
  await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>PortfolioModelMachine.snapshot().frame),1);
  await page.locator('[data-replay-rewind]').click();
  assert.equal(await page.evaluate(()=>PortfolioModelMachine.snapshot().frame),0);
  await page.locator('[data-replay-play]').click();
  await page.waitForFunction(()=>PortfolioModelMachine.snapshot().frame>0);
  await page.locator('[data-replay-play]').click();
  const paused=await page.evaluate(()=>({state:PortfolioModelMachine.snapshot(),clock:PortfolioModelMachine.clock()}));
  assert.equal(paused.state.playing,false,'Pause control clears playback state');
  assert.equal(paused.clock.scheduled,false,'Pause control cancels the pending animation frame');
  const frame=paused.state.frame;await settle(page);
  const settled=await page.evaluate(()=>({state:PortfolioModelMachine.snapshot(),clock:PortfolioModelMachine.clock()}));
  assert.equal(settled.state.playing,false,'Replay stays paused after two animation frames');
  assert.equal(settled.clock.scheduled,false,'Paused replay does not reschedule animation work');
  assert.equal(settled.state.frame,frame);
  await page.locator('[data-machine-settings]>summary').focus();await page.keyboard.press('Enter');
  await page.locator('[data-probe-layer]').focus();await expect(page.locator('[data-probe-layer]')).toBeFocused();
  await page.locator('[data-probe-layer]').selectOption('1');await page.locator('[data-probe-node]').selectOption('129');
  await expect(page.locator('[data-probe-readout]')).toContainText('L1-001');
  await expect(page.locator('[data-probe-readout]')).toContainText('16 incoming / 1 outgoing display routes');
  await page.evaluate(()=>PortfolioModelMachine.seek(145));const first=await page.evaluate(()=>PortfolioModelMachine.snapshot());
  const light=await page.evaluate(()=>PortfolioModelMachine.light());
  await page.evaluate(()=>{PortfolioModelMachine.seek(0);PortfolioModelMachine.seek(145);});
  assert.deepEqual(await page.evaluate(()=>PortfolioModelMachine.snapshot()),first,'Deterministic rewind');
  assert.deepEqual(await page.evaluate(()=>PortfolioModelMachine.light()),light,'Deterministic illustrative lighting');
  if(await page.locator('[data-model-machine]').getAttribute('data-render')==='webgl') {
    await page.locator('[data-camera="right"]').focus();await page.keyboard.press('Enter');
    await page.locator('[data-camera="in"]').click();
    assert.equal(await page.evaluate(()=>PortfolioModelMachine.snapshot().frame),145,'Explicit camera controls preserve replay');
    await page.locator('[data-camera="reset"]').click();
  } else await expect(page.locator('[data-camera="right"]')).toBeDisabled();
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
  assert.equal(full.model.quality.contextAttributes.antialias,true);assert.ok(full.model.quality.sampleSupport.defaultFramebufferSamples>0);
  assert.equal(full.model.transmissionScale,1);
  assert.ok(full.model.drawCalls<=20&&full.model.triangles<=20000);
  assert.equal(full.model.nodes,1668);assert.equal(full.model.edges,3601);
  await page.screenshot({path:`${out}/${name}-clear-refraction-top.png`});return full;
}
async function zoom(page) {
  const before=(await snapshot(page)).model.camera;
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});
  await settle(page);assert.equal((await snapshot(page)).mode,'native');
  assert.ok((await snapshot(page)).panes.every(p=>p.transform==='none'));
  assert.deepEqual((await snapshot(page)).model.camera,before,'Browser zoom does not zoom the graph camera');
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
  const {context,page,root,errors}=await open({viewport:{width,height},...(width<=720?{isMobile:true,hasTouch:true,deviceScaleFactor:3}:{})});
  await expect(root).toHaveAttribute('data-render','webgl');
  await readChecks(page);const auto=await snapshot(page);
  assert.equal(auto.model.quality.effective,'refraction','Auto stays full quality on software-observed hosts');
  assert.equal(auto.model.nodes,1668);assert.equal(auto.model.edges,3601);
  const shots=await sequence(page,name,width<=720);
  const replay=await controls(page);const navigation=await nativeNavigation(page);
  const finger=width<=720?await nativeFingerScroll(page,root):null;
  const playback=await auditPlayback(page,root,name);
  const full=await quality(page,name);const performance=await profile(page);
  await page.evaluate(()=>{document.documentElement.dataset.theme='light';scrollTo(0,0);});await settle(page);
  await readChecks(page);await page.screenshot({path:`${out}/${name}-light-top.png`});
  const zoomChecks=width>720?await zoom(page):null;
  assert.deepEqual(errors,[]);evidence.push({name,width,height,auto,shots,replay,navigation,finger,playback,full,performance,zoomChecks,errors});await context.close();
}
async function fallback(mode) {
  const options={viewport:{width:360,height:800},...(mode==='reduced-motion'?{reducedMotion:'reduce'}:{}),...(mode==='forced-colors'?{forcedColors:'active'}:{})};
  const engine=[];
  const {context,page,root,errors}=await open(options,async page=>{
    page.on('request',request=>{if(request.url().includes('three@0.186.1'))engine.push(request.url());});
    if(mode==='webgl-unavailable')await page.addInitScript(()=>{const native=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:native.call(this,type,...args);};});
    if(mode==='engine-unavailable')await page.route('**/vendor/three@0.186.1/**',route=>route.abort());
  });
  await expect(page.locator('[data-model-machine]')).toHaveAttribute('data-render','fallback');
  if(mode==='reduced-motion'||mode==='forced-colors')assert.equal(engine.length,0,'Static reading loads no WebGL engine');
  await expect(root.locator('[data-machine-fallback] svg')).toBeVisible();
  assert.ok(await root.locator('[data-machine-fallback] svg').evaluate(node=>node.getBoundingClientRect().height<=node.closest('.machine-stage').getBoundingClientRect().height),'Static graph stays within stage');
  await root.evaluate(node=>node.machine.seek(145));const first=await root.evaluate(node=>node.machine.snapshot());
  await root.evaluate(node=>{node.machine.seek(360);node.machine.seek(145);});
  assert.deepEqual(await root.evaluate(node=>node.machine.snapshot()),first,'Fallback deterministic replay');
  await controls(page);
  await readChecks(page);await scrollTo(page,'research-chapter');await readChecks(page);
  assert.ok((await snapshot(page)).panes.every(p=>p.transform==='none'));
  await page.screenshot({path:`${out}/${mode}-research.png`});
  assert.deepEqual(errors,[]);evidence.push({mode,nativeReading:true,engineRequests:engine.length,errors});await context.close();
}
try {
  await normal('desktop',1440,1000);await normal('phone360',360,800);await normal('s23-ultra',412,915);await normal('phone320',320,780);
  for(const mode of ['reduced-motion','webgl-unavailable','engine-unavailable','forced-colors'])await fallback(mode);
  evidence.push(...await homepageLifecycle(open));
  console.log('Homepage pass: native scroll, stable desktop model/release, controls, anchors/back/focus, zoom, axe and fallback checks passed.');
}catch(error){evidence.push({failure:error.message});throw error;}finally{await writeFile(`${out}/audit.json`,JSON.stringify(evidence,null,2));await browser.close();}
