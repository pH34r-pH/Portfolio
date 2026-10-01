import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base=process.env.PORTFOLIO_AUDIT_URL||'http://127.0.0.1:4174';
const out=process.env.GLASS_EVIDENCE_DIR||'ux-screenshots/glass';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),evidence=[];
async function open(options={},setup) {
  const context=await browser.newContext(options),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));if(setup)await setup(page);
  await page.goto(base,{waitUntil:'networkidle'});const root=page.locator('[data-model-machine]').first();
  await root.locator('[data-machine-stage]').scrollIntoViewIfNeeded();
  await expect(root).toHaveAttribute('data-render',/webgl|fallback/,{timeout:30000});
  return {context,page,root,errors};
}
const diagnostics=root=>root.evaluate(node=>node.machine.diagnostics());
const center=panel=>[0,1].map(axis=>panel.corners.reduce((sum,point)=>sum+point[axis],0)*.25);
async function align(root) {
  const result=await root.evaluate(node=>{
    const canvas=node.querySelector('canvas').getBoundingClientRect();
    return node.machine.diagnostics().glass.panels.filter(panel=>panel.visible).map(panel=>{
      const rect=node.querySelector(`[data-glass-panel="${panel.id}"]`).getBoundingClientRect();
      const x=panel.corners.map(point=>point[0]),y=panel.corners.map(point=>point[1]);
      return {id:panel.id,error:Math.max(Math.abs(rect.left-canvas.left-Math.min(...x)),Math.abs(rect.top-canvas.top-Math.min(...y)),Math.abs(rect.width-Math.max(...x)+Math.min(...x)),Math.abs(rect.height-Math.max(...y)+Math.min(...y)))};
    });
  });
  assert.ok(result.every(panel=>panel.error<.6),`GPU/DOM front-plane alignment ${JSON.stringify(result)}`);return result;
}
async function accessibility(page,root) {
  const result=await new AxeBuilder({page}).include('[data-model-machine]').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  assert.deepEqual(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[]);
  const targets=await root.locator('button,input,select,summary').evaluateAll(nodes=>nodes.filter(node=>node.checkVisibility()).map(node=>{const r=node.getBoundingClientRect();return {width:r.width,height:r.height};}));
  assert.ok(targets.every(target=>target.width>=44&&target.height>=44),`targets: ${JSON.stringify(targets)}`);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=1);
}
async function renderShot(page,root,path) {
  await root.locator('[data-machine-stage]').screenshot({path,style:'.topbar,.skip-link{visibility:hidden!important}'});
}
async function motion(page,root,name,phone) {
  await root.evaluate(node=>node.machine.seek(145));const a=await diagnostics(root);
  assert.equal(a.glass.mode,'spatial');assert.equal(a.glass.visible,phone?1:3);
  const alignment=await align(root);await renderShot(page,root,`${out}/${name}-view-a.png`);
  await root.locator('.machine-depth-view').focus();await page.keyboard.press('Enter');
  const b=await diagnostics(root);assert.equal(b.glass.mode,'spatial');
  await expect(root.locator('.machine-depth-view')).toHaveAttribute('aria-pressed','true');
  await align(root);await renderShot(page,root,`${out}/${name}-view-b.png`);
  const shifts=a.glass.panels.filter(panel=>panel.visible).map(panel=>{
    const next=b.glass.panels.find(item=>item.id===panel.id);return {id:panel.id,depth:panel.depth,delta:center(next).map((value,index)=>value-center(panel)[index])};
  });
  const graphShift=b.graphOrigin.map((value,index)=>value-a.graphOrigin[index]);
  if(phone)assert.ok(Math.abs(shifts[0].delta[0]-graphShift[0])>4,'visible phone parallax relative to graph');
  else {
    assert.equal(new Set(shifts.map(panel=>panel.depth)).size,3);
    assert.ok(Math.abs(shifts[2].delta[0]-shifts[0].delta[0])>25,'visibly different relative depth motion');
  }
  await page.keyboard.press('Enter');await expect(root.locator('.machine-depth-view')).toHaveAttribute('aria-pressed','false');
  return {a,b,alignment,shifts,graphShift};
}
async function reflow(page,root,phone) {
  if(phone)for(const id of ['inspect','output','input']) {
    await root.locator(`[data-instrument="${id}"]`).click();
    const d=await diagnostics(root);assert.equal(d.glass.mode,'spatial');assert.equal(d.glass.visible,1);
    await expect(root.locator(`[data-glass-panel="${id}"]`)).toBeVisible();await align(root);
  }
  if(phone)await root.locator('[data-instrument="inspect"]').click();
  await root.locator('[data-glass-panel="inspect"] button').click();
  await expect(root.locator('[data-probe-layer]')).toBeFocused();
  await page.keyboard.press('Escape');
  const client=await page.context().newCDPSession(page);
  await client.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});
  await expect.poll(async()=>(await diagnostics(root)).glass.mode).toBe('flow');
  await expect(root.locator('[data-glass-panel]')).toHaveCount(3);
  for(const panel of await root.locator('[data-glass-panel]').all())await expect(panel).toBeVisible();
  await root.locator('[data-machine-form] input').focus();await expect(root.locator('[data-machine-form] input')).toBeFocused();
  await client.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await client.detach();
  await expect.poll(async()=>(await diagnostics(root)).glass.mode).toBe('spatial');
  await root.evaluate(node=>node.querySelector('[data-machine-settings]').open=true);
  await root.locator('[data-camera="in"]').click();await root.locator('[data-camera="in"]').click();
  assert.equal((await diagnostics(root)).glass.mode,'flow','unsafe camera zoom reflows native reading');
  await root.locator('[data-camera="reset"]').click();assert.equal((await diagnostics(root)).glass.mode,'spatial');
  await root.evaluate(node=>node.querySelector('[data-machine-settings]').open=false);
}
async function profile(root) {
  return root.evaluate(async node=>{
    // Delivered browser-frame opportunities, no claimed physical GPU throughput.
    const frames=[],start=performance.now();let previous;
    for(let frame=0;frame<48;frame++) {
      await new Promise(resolve=>requestAnimationFrame(time=>{if(previous!==undefined)frames.push(time-previous);previous=time;resolve();}));
      node.machine.seek(frame*6);
    }
    return {elapsed:performance.now()-start,browserFrameIntervalsMs:frames,diagnostics:node.machine.diagnostics()};
  });
}
try {
  for(const [name,width,height] of [['desktop',1440,1100],['phone360',360,800],['phone320',320,780]]) {
    const phone=width<600,{context,page,root,errors}=await open({viewport:{width,height},deviceScaleFactor:phone?3:1,isMobile:phone,hasTouch:phone});
    await expect(root).toHaveAttribute('data-render','webgl');
    const movement=await motion(page,root,name,phone);await reflow(page,root,phone);
    for(const theme of ['light','dark']) {
      await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.themeMode=theme;},theme);
      await root.evaluate(node=>node.machine.seek(145));await accessibility(page,root);
      await renderShot(page,root,`${out}/${name}-${theme}.png`);
    }
    await root.locator('[data-machine-stage]').scrollIntoViewIfNeeded();
    const performance=await profile(root);assert.equal(performance.diagnostics.glass.pmremSize,128);
    assert.equal(performance.diagnostics.glass.lights,2);assert.ok(performance.diagnostics.drawCalls<=(phone?78:84));
    if(phone){assert.ok(performance.diagnostics.pixelRatio<=1.25);assert.equal(performance.diagnostics.transmissionScale,.5);}
    assert.deepEqual(errors,[]);evidence.push({name,width,height,movement,performance,errors});await context.close();
  }
  for(const mode of ['reduced-motion','webgl-unavailable','forced-colors']) {
    const options={viewport:{width:360,height:800},...(mode==='reduced-motion'?{reducedMotion:'reduce'}:{}),...(mode==='forced-colors'?{forcedColors:'active'}:{})};
    const {context,page,root,errors}=await open(options,async page=>{
      if(mode==='webgl-unavailable')await page.addInitScript(()=>{const native=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...rest){return type.startsWith('webgl')?null:native.call(this,type,...rest);};});
    });
    await expect(root).toHaveAttribute('data-render','fallback');await expect(root.locator('[data-instruments="flow"]')).toBeVisible();
    for(const panel of await root.locator('[data-glass-panel]').all())await expect(panel).toBeVisible();
    await root.evaluate(node=>node.machine.seek(145));await accessibility(page,root);
    await root.screenshot({path:`${out}/${mode}.png`,style:'.topbar,.skip-link{visibility:hidden!important}'});
    assert.deepEqual(errors,[]);evidence.push({mode,errors});await context.close();
  }
  console.log('Shared-glass audit passed: three viewports, aligned planes, relative motion, zoom/reflow, keyboard, axe and fallbacks.');
}catch(error){evidence.push({failure:error.message});throw error;}finally{await writeFile(`${out}/audit.json`,JSON.stringify(evidence,null,2));await browser.close();}
