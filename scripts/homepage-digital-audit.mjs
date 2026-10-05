import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base=process.env.PORTFOLIO_AUDIT_URL||'http://127.0.0.1:4173';
const out=process.env.HOMEPAGE_EVIDENCE_DIR||'ux-screenshots/homepage';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),evidence=[];
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));

async function open(options={}) {
  const context=await browser.newContext({colorScheme:'dark',...options});
  const page=await context.newPage(),errors=[];let engineRequests=0;
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().includes('three@0.186.1'))engineRequests++;});
  await page.goto(base,{waitUntil:'networkidle'});
  await expect.poll(()=>page.evaluate(()=>Boolean(window.PortfolioHomepageBackground))).toBe(true);
  return {context,page,errors,engineRequests:()=>engineRequests};
}
async function accessibility(page) {
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=1,'no horizontal document overflow');
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  assert.deepEqual(axe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
  const targets=await page.locator('button,input,select,summary,.actions a,.digital-next').evaluateAll(nodes=>nodes.filter(n=>n.checkVisibility()).map(n=>{
    const r=n.getBoundingClientRect();return {tag:n.tagName,text:n.textContent.slice(0,35),width:r.width,height:r.height};
  }));
  assert.ok(targets.every(item=>item.width>=44&&item.height>=44),JSON.stringify(targets.filter(item=>item.width<44||item.height<44)));
}
async function cinematic(page,{quiet=false}={}) {
  const background=page.locator('.digital-model-background'),video=page.locator('[data-homepage-model-loop]');
  await expect(background).toBeVisible();await expect(page.locator('.digital-machine-audit-surface')).toBeHidden();
  await expect(page.getByRole('button',{name:'Start interactive model'})).toBeHidden();
  const media=await video.evaluate(node=>({muted:node.muted,autoplay:node.autoplay,controls:node.controls,loop:node.loop,readyState:node.readyState}));
  assert.equal(media.muted,true);assert.equal(media.autoplay,true);assert.equal(media.controls,false);assert.equal(media.loop,false);
  const state=await page.evaluate(()=>PortfolioHomepageBackground.snapshot());
  assert.equal(state.audit,false);assert.equal(state.loopStart,1.8);assert.equal(state.loopEnd,8.4);
  if(quiet) {
    assert.equal(state.quiet,true);assert.equal(state.paused,true);
    await expect(video).toBeHidden();await expect(page.locator('.digital-model-loop-poster')).toBeVisible();
  } else {
    assert.equal(state.quiet,false);
    await expect.poll(()=>page.evaluate(()=>document.querySelector('[data-homepage-model-loop]').readyState)).toBeGreaterThan(0);
    await page.evaluate(()=>{
      const node=document.querySelector('[data-homepage-model-loop]');
      node.currentTime=8.35;node.dispatchEvent(new Event('timeupdate'));
    });
    await expect.poll(()=>page.evaluate(()=>document.querySelector('[data-homepage-model-loop]').currentTime)).toBeGreaterThanOrEqual(1.75);
    assert.ok((await page.evaluate(()=>document.querySelector('[data-homepage-model-loop]').currentTime))<2.25,'loop resumes after one-time ignition');
  }
}
async function palette(page) {
  const vars=await page.evaluate(()=>{
    const style=getComputedStyle(document.body);
    return Object.fromEntries(['--bg','--panel','--depth','--ink','--muted','--accent','--accent-strong','--line','--signal','--signal-soft'].map(key=>[key,style.getPropertyValue(key).trim()]));
  });
  assert.deepEqual(vars,{
    '--bg':'#00070d','--panel':'rgba(1,17,29,.78)','--depth':'#001827','--ink':'#f4fbff','--muted':'#9abbd1',
    '--accent':'#31a8ff','--accent-strong':'#69c6ff','--line':'rgba(91,190,255,.27)','--signal':'#29a7ff','--signal-soft':'rgba(41,167,255,.14)'
  });
  return vars;
}
async function scrollAndNavigate(page) {
  const background=page.locator('.digital-model-background');
  const before=await background.evaluate(node=>{const r=node.getBoundingClientRect();return {top:r.top,height:r.height};});
  await page.locator('#research-chapter').scrollIntoViewIfNeeded();await settle(page);
  const after=await background.evaluate(node=>{const r=node.getBoundingClientRect();return {top:r.top,height:r.height};});
  assert.ok(Math.abs(before.top-after.top)<1.5,'background stays fixed behind the argument while the page scrolls');
  assert.ok(Math.abs(before.height-after.height)<1.5);
  await page.evaluate(()=>scrollTo(0,0));await settle(page);
  await page.locator('.digital-next[href="#model-chapter"]').click();await expect(page).toHaveURL(base+'/#model-chapter');
  await page.goBack();await expect(page).toHaveURL(base+'/');
  await page.locator('.menu-toggle').click();await expect(page.locator('#site-menu')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('.menu-toggle')).toBeFocused();
  await page.locator('.skip-link').focus();await page.keyboard.press('Enter');await expect(page.locator('#main-content')).toBeFocused();
  return {backgroundBefore:before,backgroundAfter:after,hashNavigation:true,menuFocus:true,skipLink:true};
}
async function researchLabel(page) {
  await page.goto(base+'/research/',{waitUntil:'networkidle'});
  const heading=page.locator('#topology-heading');await expect(heading).toHaveText('Follow the argument');
  return await heading.textContent();
}
async function normalProfile(name,viewport) {
  const {context,page,errors,engineRequests}=await open({viewport});
  try {
    const manifest=await (await page.request.get(base+'/assets/homepage-model-loop.json')).json();
    assert.equal(manifest.topology,'unit_hypersphere_depth3');assert.equal(manifest.nodes,1668);assert.equal(manifest.displayRoutes,3601);
    assert.equal(manifest.loopStartSeconds,1.8);assert.equal(manifest.durationSeconds,8.4);assert.ok(manifest.bytes<=220000);
    await cinematic(page);const colors=await palette(page);await accessibility(page);
    const navigation=await scrollAndNavigate(page);assert.equal(engineRequests(),0,'normal homepage never requests Three.js');
    await page.goto(base,{waitUntil:'networkidle'});await page.screenshot({path:`${out}/${name}.png`,fullPage:false});
    const label=await researchLabel(page);assert.deepEqual(errors,[]);
    evidence.push({name,viewport,manifest,colors,navigation,label,engineRequests:engineRequests(),errors});
  } finally {await context.close();}
}
async function quietProfile(name,options) {
  const {context,page,errors,engineRequests}=await open({viewport:{width:360,height:800},...options});
  try {
    await cinematic(page,{quiet:true});await accessibility(page);assert.equal(engineRequests(),0);
    await page.screenshot({path:`${out}/${name}.png`,fullPage:false});assert.deepEqual(errors,[]);
    evidence.push({name,quiet:true,engineRequests:engineRequests(),errors});
  } finally {await context.close();}
}

try {
  await normalProfile('desktop-cinematic',{width:1366,height:900});
  await normalProfile('phone-360-cinematic',{width:360,height:800});
  await quietProfile('reduced-motion',{reducedMotion:'reduce'});
  await quietProfile('forced-colors',{forcedColors:'active'});
  await writeFile(`${out}/audit.json`,JSON.stringify({schemaVersion:2,evidence},null,2)+'\n');
  console.log('Homepage pass: pre-rendered ignition/loop, zero normal Three.js loads, sticky background, research-blue dark palette, navigation, accessibility and quiet fallbacks passed.');
} finally {await browser.close();}
