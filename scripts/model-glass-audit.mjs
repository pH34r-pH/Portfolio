import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {articleHost} from './model-audit-host.mjs';

const base=process.env.PORTFOLIO_AUDIT_URL||'http://127.0.0.1:4174';
const host=await articleHost(base);
const out=process.env.GLASS_EVIDENCE_DIR||'ux-screenshots/glass';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),evidence=[];
async function open(options={},setup) {
  const context=await browser.newContext(options),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));if(setup)await setup(page);
  if(host.html)await page.route(host.url,route=>route.fulfill({contentType:'text/html',body:host.html}));
  await page.goto(host.url,{waitUntil:'networkidle'});const root=page.locator('[data-model-machine]').first();
  await root.locator('[data-machine-stage]').scrollIntoViewIfNeeded();
  await expect(root).toHaveAttribute('data-render',/webgl|fallback/,{timeout:30000});
  return {context,page,root,errors};
}
const diagnostics=root=>root.evaluate(node=>node.machine.diagnostics());
function assertNativeRender(diagnostics) {
  const resolution=diagnostics.resolution,limits=diagnostics.quality.limits;
  assert.equal(diagnostics.quality.contextAttributes.antialias,true);assert.ok(diagnostics.quality.sampleSupport.defaultFramebufferSamples>0);
  assert.equal(diagnostics.transmissionScale,1);assert.equal(resolution.canvasWidth,resolution.drawingBufferWidth);
  assert.equal(resolution.canvasHeight,resolution.drawingBufferHeight);assert.ok(resolution.effectiveDPR<=resolution.nativeDPR);
  assert.ok(resolution.canvasWidth<=limits.maxTargetDimension&&resolution.canvasHeight<=limits.maxTargetDimension);
  if(diagnostics.glass.visible>0&&diagnostics.glass.material.transmission>0) {
    assert.ok(resolution.transmissionTarget?.samples>0);
    assert.ok(Math.abs(resolution.transmissionTarget.width-resolution.canvasWidth)<=1);
    assert.ok(Math.abs(resolution.transmissionTarget.height-resolution.canvasHeight)<=1);
  }
}
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
  await root.evaluate(node=>{for(let i=0;i<8;i++)node.machineController.cameraAction('right');});
  await root.locator('.machine-depth-view').focus();await page.keyboard.press('Enter');
  const b=await diagnostics(root);assert.equal(b.glass.mode,'spatial');
  await expect(root.locator('.machine-depth-view')).toHaveAttribute('aria-pressed','true');
  await renderShot(page,root,`${out}/${name}-view-b.png`);
  const shifts=a.glass.panels.filter(panel=>panel.visible).map(panel=>{
    const next=b.glass.panels.find(item=>item.id===panel.id);return {id:panel.id,depth:panel.depth,delta:center(next).map((value,index)=>value-center(panel)[index])};
  });
  const graphShift=b.landmarks.map((point,index)=>point.map((value,axis)=>value-a.landmarks[index][axis]));
  assert.ok(Math.max(...graphShift.map(delta=>Math.hypot(...delta)))>4,`camera manipulation moves the model: ${JSON.stringify(graphShift)}`);
  assert.ok(shifts.every(panel=>Math.hypot(...panel.delta)<.6),'article panes stay pinned while the model camera moves');
  await page.keyboard.press('Enter');await expect(root.locator('.machine-depth-view')).toHaveAttribute('aria-pressed','false');
  return {a,b,alignment,shifts,graphShift};
}
async function independentPaneState(page,root,phone) {
  const cdp=await page.context().newCDPSession(page), canvas=await root.locator('canvas').boundingBox();
  const duration=await root.locator('[data-glass-panel]').first().evaluate(panel=>parseFloat(getComputedStyle(panel).transitionDuration));
  assert.ok(duration>=.7,'context highlight transitions use a longer ease-in/out');
  const before=await root.evaluate(node=>({camera:node.machine.diagnostics().camera,panels:[...node.querySelectorAll('[data-glass-panel]')].map(panel=>({id:panel.dataset.glassPanel,rect:panel.getBoundingClientRect().toJSON()}))}));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:canvas.x+canvas.width*.5,y:canvas.y+canvas.height*.5}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:canvas.x+canvas.width*.62,y:canvas.y+canvas.height*.57}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const after=await diagnostics(root);
  assert.ok(Math.abs(after.camera.yaw-before.camera.yaw)>.01||Math.abs(after.camera.pitch-before.camera.pitch)>.01,'touch orbit changes camera pose');
  assert.equal(after.glass.mode,'spatial');assert.equal(after.glass.visible,phone?1:3);
  const panels=await root.locator('[data-glass-panel]').evaluateAll(nodes=>nodes.map(panel=>({id:panel.dataset.glassPanel,rect:panel.getBoundingClientRect().toJSON()})));
  for(const panel of before.panels){const next=panels.find(item=>item.id===panel.id);assert.ok(Math.abs(next.rect.x-panel.rect.x)<.6&&Math.abs(next.rect.y-panel.rect.y)<.6,`pane ${panel.id} moved during touch orbit`);}
  await root.evaluate(node=>node.machine.focus('representation'));
  await expect(root.locator('[data-glass-panel="inspect"]')).toHaveAttribute('data-context-active','true');
  await expect(root.locator('[data-glass-panel="input"]')).toHaveAttribute('data-context-active','false');
  await expect(root.locator('[data-glass-panel="input"]')).toHaveAttribute('inert','');
  await page.waitForTimeout(120);
  await root.evaluate(node=>node.machine.focus('consumer'));
  await expect(root.locator('[data-glass-panel="output"]')).toHaveAttribute('data-context-active','true');
  await root.evaluate(node=>node.machine.focus('representation'));
  await expect(root.locator('[data-glass-panel="inspect"]')).toHaveAttribute('data-context-active','true');
  await root.evaluate(node=>node.machine.focus('all'));
  await expect.poll(async()=>root.locator('[data-glass-panel="input"]').evaluate(panel=>getComputedStyle(panel).opacity)).toBe('1');
  const zoom=async action=>root.evaluate((node,direction)=>direction>0?node.machineController.cameraAction('in'):node.machineController.cameraAction('out'),action);
  if(!phone) {
    for(let i=0;i<100;i++)await zoom(1);
    let deep=await diagnostics(root);assert.ok(Number.isFinite(deep.camera.zoom)&&deep.camera.zoom>1.8);assert.equal(deep.glass.visible,3);
    for(let i=0;i<200;i++)await zoom(-1);
    deep=await diagnostics(root);assert.ok(Number.isFinite(deep.camera.zoom)&&deep.camera.zoom<.75);assert.equal(deep.glass.visible,3);
    await root.evaluate(node=>node.querySelector('[data-machine-settings]').open=true);
    await root.locator('[data-camera="reset"]').click();assert.equal((await diagnostics(root)).camera.zoom,1);
    await root.evaluate(node=>node.querySelector('[data-machine-settings]').open=false);
  }
  await cdp.detach();
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
  assert.equal((await diagnostics(root)).glass.mode,'spatial','camera zoom does not reflow article panes');
  assert.equal((await diagnostics(root)).glass.visible,phone?1:3,'camera zoom preserves contextual pane selection');
  await root.locator('[data-camera="reset"]').click();assert.equal((await diagnostics(root)).glass.mode,'spatial');
  await root.evaluate(node=>node.querySelector('[data-machine-settings]').open=false);
}
async function profile(root) {
  return root.evaluate(async node=>{
    // Delivered browser-frame opportunities, no claimed physical GPU throughput.
    const frames=[],start=performance.now();let previous;
    for(let frame=0;frame<24;frame++) {
      await new Promise(resolve=>requestAnimationFrame(time=>{if(previous!==undefined)frames.push(time-previous);previous=time;resolve();}));
      node.machine.seek(frame*12);
    }
    return {elapsed:performance.now()-start,browserFrameIntervalsMs:frames,diagnostics:node.machine.diagnostics()};
  });
}
async function qualityChecks(page,root,name) {
  const automatic=await diagnostics(root);
  assert.equal(automatic.quality.effective,'refraction');assertNativeRender(automatic);
  await root.locator('[data-machine-settings] summary').click();
  await root.locator('[data-glass-quality]').selectOption('refraction');
  const full=await diagnostics(root);
  assertNativeRender(full);
  assert.equal(full.glass.material.transmission,.99);assert.equal(full.glass.material.tint,'ffffff');
  assert.equal(full.glass.material.opacity,1);assert.ok(full.drawCalls<=32);assert.ok(full.triangles<=180000);
  await root.locator('[data-glass-quality]').selectOption('lightweight');
  const low=await diagnostics(root);assert.equal(low.glass.material.transmission,0);
  assert.ok(low.drawCalls<=24);assert.ok(low.triangles<=30000);assert.equal(low.pixelRatio,full.pixelRatio);
  assert.equal(low.transmissionScale,1);assertNativeRender(low);
  assert.equal(low.nodes,1668);assert.equal(low.edges,3601);
  await expect(root.locator('.machine-render-hint')).toContainText('refraction off');
  await accessibility(page,root);await renderShot(page,root,`${out}/${name}-lightweight.png`);
  await root.locator('[data-glass-quality]').selectOption('refraction');
  await root.locator('[data-machine-settings] summary').click();
  return {automatic,full,low};
}
try {
  for(const [name,width,height] of [['desktop',1440,1100],['phone360',360,800],['phone320',320,780]]) {
    const phone=width<600,{context,page,root,errors}=await open({viewport:{width,height},deviceScaleFactor:phone?3:1,isMobile:phone,hasTouch:phone});
    await expect(root).toHaveAttribute('data-render','webgl');
    const qualities=await qualityChecks(page,root,name);
    const movement=await motion(page,root,name,phone);await independentPaneState(page,root,phone);await reflow(page,root,phone);
    for(const theme of ['light','dark']) {
      await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.themeMode=theme;},theme);
      await root.evaluate(node=>node.machine.seek(145));await accessibility(page,root);
      await renderShot(page,root,`${out}/${name}-${theme}.png`);
    }
    await root.locator('[data-machine-stage]').scrollIntoViewIfNeeded();
    const performance=await profile(root);assert.equal(performance.diagnostics.glass.pmremSize,128);
    assert.equal(performance.diagnostics.glass.lights,2);assert.ok(performance.diagnostics.drawCalls<=32);
    assert.ok(performance.diagnostics.triangles<=180000);
    assertNativeRender(performance.diagnostics);
    assert.deepEqual(errors,[]);evidence.push({name,width,height,qualities,movement,performance,errors});await context.close();
  }
  for(const mode of ['reduced-motion','webgl-unavailable','forced-colors']) {
    const options={viewport:{width:360,height:800},...(mode==='reduced-motion'?{reducedMotion:'reduce'}:{}),...(mode==='forced-colors'?{forcedColors:'active'}:{})};
    const {context,page,root,errors}=await open(options,async page=>{
      if(mode==='webgl-unavailable')await page.addInitScript(()=>{const native=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...rest){return type.startsWith('webgl')?null:native.call(this,type,...rest);};});
    });
    await expect(root).toHaveAttribute('data-render','fallback');await expect(root.locator('[data-instruments="flow"]')).toBeVisible();
    for(const panel of await root.locator('[data-glass-panel]').all())await expect(panel).toBeVisible();
    await root.evaluate(node=>node.machine.seek(145));await accessibility(page,root);
    if(mode==='reduced-motion') {
      const duration=await root.locator('[data-glass-panel]').first().evaluate(panel=>getComputedStyle(panel).transitionDuration);
      assert.match(duration,/^(?:0\.001s|1ms)(?:,|$)/,'context slides honor reduced motion');
      await root.evaluate(node=>node.machine.focus('representation'));
      await expect(root.locator('[data-glass-panel="inspect"]')).toHaveAttribute('data-context-active','true');
      await root.evaluate(node=>node.machine.focus('all'));
      await expect(root.locator('[data-glass-panel="input"]')).toHaveAttribute('data-context-active','true');
    }
    await root.screenshot({path:`${out}/${mode}.png`,style:'.topbar,.skip-link{visibility:hidden!important}'});
    assert.deepEqual(errors,[]);evidence.push({mode,errors});await context.close();
  }
  console.log('Shared-glass audit passed: three viewports, aligned panes, camera-independent touch/orbit, context reversals, unbounded finite zoom/reset, reduced motion, keyboard, axe and fallbacks.');
}catch(error){evidence.push({failure:error.message});throw error;}finally{await writeFile(`${out}/audit.json`,JSON.stringify(evidence,null,2));await browser.close();}
