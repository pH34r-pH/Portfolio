import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {eligible,advance,frozenAcrossFrames,auditPlayback,auditDelayedClock} from './model-playback-audit.mjs';
import {articleHost,prepareArticleModel,startThenQuietArticle,screenshotModel,assertEncasedRender,RENDERER_OBSERVATION_TIMEOUT_MS} from './model-audit-host.mjs';
const base = process.env.PORTFOLIO_AUDIT_URL || 'http://127.0.0.1:4173';
const host=await articleHost(base,{componentFixture:true});
const out = process.env.MODEL_EVIDENCE_DIR || 'ux-screenshots/model';
await mkdir(out, {recursive:true});
const browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const evidence = [];
async function open(options={}, setup) {
  const context = await browser.newContext(options); const page = await context.newPage();
  if(host.html)await page.route(host.url,route=>route.fulfill({contentType:'text/html',body:host.html}));
  if (setup) await setup(page);
  const errors=[]; page.on('pageerror', error => errors.push(error.message));
  const initialEngine=[];page.on('request',request=>{if(request.url().includes('three@0.186.1'))initialEngine.push(request.url());});
  await page.goto(host.url, {waitUntil:'networkidle'});
  if(host.html)assert.equal(initialEngine.length,0,'Below-fold embedded viewer defers its engine');
  const root=page.locator('[data-model-machine]').first();
  const startup=await prepareArticleModel(page,root,host);
  if(host.manualStart&&startup.unstarted)assert.equal(initialEngine.length,0,'Quiet article defers its engine');
  return {context,page,root,errors};
}
async function snapshot(root) { return root.evaluate(node=>node.machine.snapshot()); }
async function seek(root, frame) { await root.evaluate((node,value)=>node.machine.seek(value), frame); }
async function settledFramingDiagnostics(root) {
  let diagnostics;
  // DOM dimensions update before ResizeObserver applies the camera/glass layout.
  // Observe that real handoff; do not force a resize or substitute fit bounds.
  await expect.poll(async()=>{
    diagnostics=await root.evaluate(node=>node.machine.diagnostics());
    const {viewport}=diagnostics.graphGeometryBounds,resolution=diagnostics.resolution;
    return viewport.width===resolution.cssWidth&&viewport.height===resolution.cssHeight;
  },{timeout:RENDERER_OBSERVATION_TIMEOUT_MS}).toBe(true);
  return diagnostics;
}
function assertInspectionPose(actual,expected,label,{layoutUnchanged=true}={}) {
  const controls=pose=>({yaw:pose.yaw,pitch:pose.pitch,zoom:pose.zoom,pan:pose.pan});
  assert.deepEqual(controls(actual),controls(expected),`${label}: stored orbit/zoom/pan controls`);
  assert.equal(actual.quaternion.length,expected.quaternion.length,`${label}: camera quaternion length`);
  actual.quaternion.forEach((value,index)=>assert.ok(Math.abs(value-expected.quaternion[index])<1e-10,
    `${label}: rendered camera quaternion component ${index} drifted (${value} vs ${expected.quaternion[index]})`));
  if(layoutUnchanged) {
    assert.equal(actual.distance,expected.distance,`${label}: same-size base camera distance`);
    assert.deepEqual(actual.position,expected.position,`${label}: same-size rendered camera position`);
  }
}
function assertFullGraphFit(diagnostics,label) {
  const {all,components,viewport,marginPx}=diagnostics.graphGeometryBounds;
  assert.equal(viewport.width,diagnostics.resolution.cssWidth,`${label}: viewport width`);
  assert.equal(viewport.height,diagnostics.resolution.cssHeight,`${label}: viewport height`);
  for(const [part,bounds] of Object.entries({all,...components})) {
    assert.ok(bounds.left>=marginPx-.25,`${label}/${part}: left ${bounds.left} misses ${marginPx}px margin`);
    assert.ok(bounds.right<=viewport.width-marginPx+.25,`${label}/${part}: right ${bounds.right} exceeds ${viewport.width-marginPx}px`);
    assert.ok(bounds.top>=marginPx-.25,`${label}/${part}: top ${bounds.top} misses ${marginPx}px margin`);
    assert.ok(bounds.bottom<=viewport.height-marginPx+.25,`${label}/${part}: bottom ${bounds.bottom} exceeds ${viewport.height-marginPx}px`);
  }
}
async function auditResetFitAfterResize(page,root) {
  await root.locator('[data-camera="reset"]').click();
  const canvas=root.locator('[data-machine-canvas]'),camera=()=>root.evaluate(node=>node.machine.diagnostics().camera);
  await canvas.scrollIntoViewIfNeeded();
  const initial=await canvas.boundingBox();
  if(host.html) {
    assert.equal(Math.round(initial.width),338,'Source reset regression starts at the reported 338px phone canvas');
    assert.equal(Math.round(initial.height),358,'Source reset regression starts at the reported 358px phone canvas');
  }
  assert.ok(initial.width>0&&initial.height>0,'Reset starts with a rendered article canvas');
  const pointer={x:initial.x+70,y:initial.y+(host.html?160:initial.height*.65)};
  await page.mouse.move(pointer.x,pointer.y);await page.mouse.down();
  await page.mouse.move(pointer.x+1.2/.007,pointer.y-.38/.005,{steps:1});await page.mouse.up();
  const orbited=await camera();
  assert.ok(Math.abs(orbited.yaw-1.05)<1e-5,`Orbit reaches reproduction yaw 1.05 (${orbited.yaw})`);
  assert.ok(Math.abs(orbited.pitch)<1e-5,`Orbit reaches reproduction pitch 0 (${orbited.pitch})`);
  await page.setViewportSize({width:359,height:800});
  await page.waitForFunction(width=>Math.round(document.querySelector('[data-model-machine] [data-machine-canvas]').getBoundingClientRect().width)===width,Math.round(initial.width)-1);
  const resized=await canvas.boundingBox();
  assert.equal(Math.round(resized.width),Math.round(initial.width)-1,'Genuine one-pixel viewport resize changes the article canvas width');
  assert.equal(Math.round(resized.height),Math.round(initial.height),'Viewport resize preserves the article canvas height');
  const preReset=await settledFramingDiagnostics(root);
  assert.equal(preReset.camera.yaw,orbited.yaw,'Resize preserves the inspected yaw');
  assert.equal(preReset.camera.pitch,orbited.pitch,'Resize preserves the inspected pitch');
  assert.equal(preReset.camera.zoom,1,'Resize fits complete geometry at the existing unit zoom');
  assert.equal(preReset.graphGeometryBounds.components.housing.count,8,'Fit includes all encased housing corners');
  assertFullGraphFit(preReset,`orbit after genuine ${Math.round(initial.width)}×${Math.round(initial.height)} → ${Math.round(resized.width)}×${Math.round(resized.height)} resize`);
  await root.locator('[data-camera="reset"]').click();
  const reset=await settledFramingDiagnostics(root);
  assert.equal(reset.camera.yaw,-.15);assert.equal(reset.camera.pitch,.38);assert.equal(reset.camera.zoom,1);
  assert.deepEqual(reset.camera.pan,{x:0,y:0});
  assert.notEqual(reset.camera.distance,preReset.camera.distance,'Reset recomputes the complete-geometry fit for the default angle');
  assertFullGraphFit(reset,'reset after genuine resize');
  const fresh=await open({viewport:{width:359,height:800},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const baseline=await settledFramingDiagnostics(fresh.root);
  // A fresh view derives its fit from the current full geometry. Flat-scene
  // distance snapshots no longer describe the physical enclosure.
  assertFullGraphFit(baseline,'fresh encased default view');
  assert.equal(reset.camera.distance,baseline.camera.distance,'Reset fit distance equals a fresh default article view');
  assert.deepEqual(reset.graphGeometryBounds,baseline.graphGeometryBounds,'Reset full-geometry framing equals fresh default article framing');
  await fresh.context.close();
  await page.setViewportSize({width:360,height:800});
  await page.waitForFunction(width=>Math.round(document.querySelector('[data-model-machine] [data-machine-canvas]').getBoundingClientRect().width)===width,Math.round(initial.width));
  await settledFramingDiagnostics(root);
  return {initialCanvas:{width:Math.round(initial.width),height:Math.round(initial.height)},orbited:{yaw:orbited.yaw,pitch:orbited.pitch},resizedCanvas:{width:Math.round(resized.width),height:Math.round(resized.height)},preReset:{distance:preReset.camera.distance,bounds:preReset.graphGeometryBounds},reset:{distance:reset.camera.distance,bounds:reset.graphGeometryBounds},freshDefault:{distance:baseline.camera.distance,bounds:baseline.graphGeometryBounds}};
}
async function auditTouch(page,root) {
  const canvas=root.locator('[data-machine-canvas]');await canvas.scrollIntoViewIfNeeded();
  const box=await canvas.boundingBox(),client=await page.context().newCDPSession(page);
  // Keep the source reproduction coordinates, scaled into the shorter sticky
  // article canvas so every contact remains on the actual gesture target.
  const p=(id,x,y)=>({id,x:box.x+x*(host.html?1:box.width/338),y:box.y+y*(host.html?1:box.height/358)});
  const touch=(type,points)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
  const camera=()=>root.evaluate(node=>node.machine.diagnostics().camera);
  await seek(root,145);
  await touch('touchStart',[p(1,100,150)]);const initial=await camera();
  await touch('touchMove',[p(1,120,160)]);assert.notEqual((await camera()).yaw,initial.yaw);
  await touch('touchStart',[p(1,120,160),p(2,220,160)]);const two=await camera();
  await touch('touchMove',[p(1,120,160),p(2,220,160)]);assert.deepEqual(await camera(),two,'one→two does not jump');
  await touch('touchMove',[p(1,100,170),p(2,240,170)]);assert.ok((await camera()).zoom>two.zoom);assert.notEqual((await camera()).pan.y,two.pan.y);
  await touch('touchStart',[p(1,100,170),p(2,240,170),p(3,170,220)]);const three=await camera();
  await touch('touchMove',[p(1,100,170),p(2,240,170),p(3,170,220)]);assert.equal((await snapshot(root)).frame,145);
  await touch('touchMove',[p(1,120,170),p(2,260,170),p(3,190,220)]);assert.ok((await snapshot(root)).frame>145);assert.deepEqual(await camera(),three,'three-pointer scrub preserves camera');
  await touch('touchEnd',[]);assert.equal(await root.evaluate(node=>node.machine.diagnostics().pointers),0);
  await touch('touchStart',[p(4,100,150),p(5,220,150)]);await touch('touchCancel',[]);
  assert.equal(await root.evaluate(node=>node.machine.diagnostics().pointers),0);
  await root.locator('[data-camera="reset"]').click();await seek(root,145);
  // A swipe in document content outside the viewer retains native page scrolling.
  await page.evaluate(()=>scrollTo(0,0));const before=await page.evaluate(()=>scrollY);
  const outside=await root.evaluate(node=>{
    const y=650;
    for(let x=innerWidth-10;x>=0;x--) {
      const target=document.elementFromPoint(x,y);
      if(target===document.body&&!node.contains(target))return {x,y,tag:target.tagName,inside:false};
    }
    return {x:null,y,tag:null,inside:true};
  });
  assert.ok(outside.x!==null&&!outside.inside,`Touch-scroll point must be outside viewer ${JSON.stringify(outside)}`);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:6,x:outside.x,y:outside.y}]});
  for(let y=600;y>=350;y-=50) {
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:6,x:outside.x,y}]});
    await page.waitForTimeout(25);
  }
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(100);
  assert.ok(await page.evaluate(()=>scrollY)>before,'outside viewer touch scroll');
  await client.detach();
}
async function axe(page, name, modelOnly=false) {
  const builder=new AxeBuilder({page}); if(modelOnly)builder.include('[data-model-machine]');
  const result=await builder.withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],`${name} axe`);
}
try {
  for (const [name,width,height,dpr] of [['desktop',1440,1000,1],['phone360',360,800,3],['s23-ultra',412,915,3],['phone320',320,780,2]]) {
    const {context,page,root,errors}=await open({viewport:{width,height},deviceScaleFactor:dpr,isMobile:width<600,hasTouch:width<600});
    await expect(root).toHaveAttribute('data-render','webgl');
    await expect(root.locator('[data-camera="reset"]')).toBeHidden();
    const framing=await root.evaluate(node=>{
      const canvas=node.querySelector('[data-machine-canvas]').getBoundingClientRect(),legend=node.querySelector('.machine-legend').getBoundingClientRect();
      return {canvasTop:canvas.top,legendBottom:legend.bottom};
    });
    assert.ok(framing.canvasTop>=framing.legendBottom+6,`${name} HUD geometry band ${JSON.stringify(framing)}`);
    await seek(root,145); const first=await snapshot(root);
    const firstLight=await root.evaluate(node=>node.machine.light());
    assert.equal(firstLight.frame,145); assert.ok(firstLight.energy>0);
    await seek(root,360); await expect(root.locator('[data-machine-output]')).toContainText('the model le');
    await seek(root,0); await seek(root,145); const replay=await snapshot(root);
    assert.deepEqual(replay,first,`${name} deterministic rewind`);
    assert.deepEqual(await root.evaluate(node=>node.machine.light()),firstLight,`${name} deterministic scene light`);
    await root.locator('[data-machine-settings] summary').click();
    await root.locator('[data-probe-layer]').selectOption('1');
    await root.locator('[data-probe-node]').selectOption('129');
    await expect(root.locator('[data-probe-readout]')).toContainText('L1-001');
    await expect(root.locator('[data-probe-readout]')).toContainText('16 incoming / 1 outgoing display routes');
    // Orbit and zoom change the camera without modifying the replay frame.
    await root.locator('[data-camera="right"]').click(); await root.locator('[data-camera="in"]').click();
    assert.equal((await snapshot(root)).frame,145);
    if(name==='desktop') {
      await root.locator('[data-camera="up"]').click(); await root.locator('[data-camera="pan-right"]').click();
      const camera=()=>root.evaluate(node=>node.machine.diagnostics().camera);
      const inspectedPose=await camera();
      await root.locator('[data-probe-node]').selectOption('130');
      await expect(root.locator('[data-probe-readout]')).toContainText('L1-002');
      assertInspectionPose(await camera(),inspectedPose,'coordinate selection preserves camera pose');
      await root.locator('[data-glass-quality]').selectOption('lightweight');
      assertInspectionPose(await camera(),inspectedPose,'quality change preserves camera pose');
      await root.locator('[data-glass-quality]').selectOption('auto');
      assertInspectionPose(await camera(),inspectedPose,'restoring automatic quality preserves camera pose');
      for(const width of [720,721,1440]) {
        await page.setViewportSize({width,height});await page.waitForTimeout(120);
        assertInspectionPose(await camera(),inspectedPose,`resize to ${width}px preserves inspection pose`,{layoutUnchanged:false});
      }
      await page.setViewportSize({width,height});await page.waitForTimeout(120);
    }
    if(name==='phone360')evidence.push({name:'reset-fit-after-orbit-resize',...(await auditResetFitAfterResize(page,root))});
    await root.locator('[data-camera="reset"]').click();
    if(name==='phone360')await auditTouch(page,root);
    await root.locator('[data-machine-stage]').scrollIntoViewIfNeeded();
    await root.locator('[data-machine-stage]').focus(); await page.keyboard.press('ArrowLeft');
    assert.equal((await snapshot(root)).frame,144);
    await page.keyboard.press('Shift+ArrowRight'); assert.equal((await snapshot(root)).frame,154);
    await page.keyboard.press('Home'); assert.equal((await snapshot(root)).frame,0);
    await page.keyboard.press('End'); assert.equal((await snapshot(root)).frame,360);
    await seek(root,145);
    for (const theme of ['light','dark']) {
      await page.evaluate(value=>{document.documentElement.dataset.themeMode=value;document.documentElement.dataset.theme=value;},theme);
      await axe(page,`${name}/${theme}`);
      await screenshotModel(page,root,{style:'.topbar,.skip-link{visibility:hidden !important;}',path:`${out}/${name}-${theme}.png`});
    }
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=1,`${name} overflow ${overflow}`);
    const targets=await root.locator('button,select,input,summary').evaluateAll(nodes=>nodes.filter(node=>node.checkVisibility()).map(node=>({tag:node.tagName,h:node.getBoundingClientRect().height,w:node.getBoundingClientRect().width})));
    assert.ok(targets.every(target=>target.h>=44 && target.w>=44),`${name} targets ${JSON.stringify(targets)}`);
    await root.locator('[data-machine-settings] summary').focus();await page.keyboard.press('Escape');
    await expect(root.locator('[data-machine-settings] summary')).toBeFocused();await expect(root.locator('[data-camera="reset"]')).toBeHidden();
    const diagnostics=await root.evaluate(node=>node.machine.diagnostics());
    assert.equal(diagnostics.nodes,1668); assert.equal(diagnostics.edges,3601);
    // Keep measured cost even if a subsequent behavioral/quality assertion fails.
    await writeFile(`${out}/${name}-render-diagnostics.json`,JSON.stringify(diagnostics,null,2));
    assertEncasedRender(diagnostics);
    // Preserve native DPR and observe the actual MSAA buffer and target resolution.
    const resolution=diagnostics.resolution,limits=diagnostics.quality.limits;
    assert.equal(diagnostics.quality.effective,'refraction','Auto retains full refraction regardless of renderer name');
    assert.equal(diagnostics.quality.contextAttributes.antialias,true);assert.ok(diagnostics.quality.sampleSupport.defaultFramebufferSamples>0);
    assert.equal(diagnostics.transmissionScale,1);assert.equal(resolution.canvasWidth,resolution.drawingBufferWidth);
    assert.equal(resolution.canvasHeight,resolution.drawingBufferHeight);assert.ok(resolution.effectiveDPR<=resolution.nativeDPR);
    assert.ok(resolution.canvasWidth<=limits.maxTargetDimension&&resolution.canvasHeight<=limits.maxTargetDimension);
    const visibleTransmission=diagnostics.glass.visible>0&&diagnostics.glass.material.transmission>0;
    if(visibleTransmission) {
      assert.ok(resolution.transmissionTarget?.samples>0);
      assert.ok(Math.abs(resolution.transmissionTarget.width-resolution.canvasWidth)<=1);
      assert.ok(Math.abs(resolution.transmissionTarget.height-resolution.canvasHeight)<=1);
    } else assert.equal(diagnostics.glass.visible,0,'Flow layouts do not require an unused GPU glass target');
    const playback=await auditPlayback(page,root,name);
    console.log(`${name} playback: ${JSON.stringify(playback)}`);
    assert.deepEqual(errors,[]); evidence.push({name,width,height,dpr,diagnostics,overflow,playback,errors});
    await context.close();
  }
  for (const mode of ['reduced-motion','webgl-unavailable','engine-unavailable','forced-colors']) {
    const options={viewport:{width:360,height:800},...(mode==='reduced-motion'?{reducedMotion:'reduce'}:{}),...(mode==='forced-colors'?{forcedColors:'active'}:{})};
    let engineRequests=0;
    const {context,page,root,errors}=await open(options,async page=>{
      page.on('request', request=>{if(request.url().includes('three@0.186.1'))engineRequests++;});
      if(mode==='webgl-unavailable')await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind.startsWith('webgl')?null:original.call(this,kind,...args);};});
      if(mode==='engine-unavailable')await page.route('**/vendor/three@0.186.1/**',route=>route.abort());
    });
    if(host.manualStart&&(mode==='reduced-motion'||mode==='forced-colors')) {
      assert.equal(engineRequests,0,'Fresh quiet article makes no engine request');
      await startThenQuietArticle(page,root,mode);
    }
    await expect(root).toHaveAttribute('data-render','fallback');
    await seek(root,145); const first=await snapshot(root); await seek(root,360); await seek(root,145);
    assert.deepEqual(await snapshot(root),first);
    await expect(root.locator('[data-machine-fallback]')).toBeVisible();
    await root.locator('[data-machine-settings] summary').click();
    await root.locator('[data-probe-layer]').selectOption('7'); await expect(root.locator('[data-probe-readout]')).toContainText('16 incoming / 0 outgoing display routes');
    if(!host.manualStart&&(mode==='reduced-motion'||mode==='forced-colors'))assert.equal(engineRequests,0);
    await axe(page,mode); await screenshotModel(page,root,{style:'.topbar,.skip-link{visibility:hidden !important;}',path:`${out}/${mode}.png`});
    assert.deepEqual(errors,[]); evidence.push({mode,engineRequests,errors}); await context.close();
  }
  // Context loss follows the same honest, inspectable fallback contract.
  evidence.push(await auditDelayedClock(open));
  const {context,page,root}=await open({viewport:{width:1366,height:900}});
  await seek(root,145);
  await root.locator('[data-machine-canvas]').evaluate(canvas=>canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await expect(root).toHaveAttribute('data-render','fallback'); assert.equal((await snapshot(root)).frame,145);
  // Headless tabs remain visible; exercise the document visibility signal explicitly.
  const visibilityCase=await open({viewport:{width:1366,height:900}});
  await visibilityCase.root.locator('[data-machine-stage]').scrollIntoViewIfNeeded();await eligible(visibilityCase.root);
  await seek(visibilityCase.root,70);await advance(visibilityCase.root,70,true);
  await visibilityCase.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  const hidden=await frozenAcrossFrames(visibilityCase.root),hiddenFrame=hidden.before;
  assert.equal(hidden.after,hiddenFrame);assert.equal(hidden.clock.scheduled,false);
  const resumedAt=await visibilityCase.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));return performance.now();});
  await advance(visibilityCase.root,hiddenFrame);
  const resumedState=await visibilityCase.root.evaluate(node=>({frame:node.machine.snapshot().frame,time:performance.now()}));
  const resumedFrame=resumedState.frame; assert.ok(resumedFrame>hiddenFrame && resumedFrame-hiddenFrame<=(resumedState.time-resumedAt)*60/1000+3,`Visibility resume: ${hiddenFrame} -> ${resumedFrame}`);
  evidence.push({mode:'document-visibility-signal',hiddenFrame,resumedFrame,note:'Injected visibility signal: headless Chromium keeps tabs visible.'});
  await visibilityCase.context.close();
  await context.close();
  await writeFile(`${out}/audit.json`,JSON.stringify(evidence,null,2));
  console.log(`Embedded model audit passed (${host.kind}): ${evidence.length} profiles, WebGL context loss, complete topology and deterministic replay.`);
} catch(error) { evidence.push({failure:error.message}); throw error; } finally {await writeFile(`${out}/audit.json`,JSON.stringify(evidence,null,2)); await browser.close();}
