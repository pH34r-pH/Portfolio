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
  assert.ok(['spatial','flow'].includes(a.glass.mode));
  assert.equal(a.glass.visible,a.glass.mode==='spatial'?(phone?1:3):0);
  if(a.glass.mode==='spatial') for(const panel of a.glass.panels.filter(panel=>panel.visible))
    assert.ok(panel.corners.every(([x,y])=>x>=12&&x<=a.resolution.cssWidth-12&&y>=12&&y<=a.resolution.cssHeight-12),
      `${name} visible glass remains inside the pinned canvas bounds: ${JSON.stringify(panel.corners)}`);
  const alignment=a.glass.mode==='spatial'?await align(root):[];await renderShot(page,root,`${out}/${name}-view-a.png`);
  await root.evaluate(node=>{for(let i=0;i<8;i++)node.machineController.cameraAction('right');});
  await root.locator('.machine-depth-view').focus();await page.keyboard.press('Enter');
  const b=await diagnostics(root);assert.equal(b.glass.mode,a.glass.mode,'camera orbit does not change pinned layout fit mode');
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
async function touchOrbitKeepsLayout(page,root,cdp,canvas,before,phone) {
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:canvas.x+canvas.width*.5,y:canvas.y+canvas.height*.5}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:canvas.x+canvas.width*.62,y:canvas.y+canvas.height*.57}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const after=await diagnostics(root);
  assert.ok(Math.abs(after.camera.yaw-before.camera.yaw)>.01||Math.abs(after.camera.pitch-before.camera.pitch)>.01,'touch orbit changes camera pose');
  assert.equal(after.glass.mode,before.glass.mode,'touch orbit cannot change the pinned layout fit decision');
  assert.equal(after.glass.visible,before.glass.visible);
  assert.ok(after.glass.panels.filter(panel=>panel.visible).every(panel=>panel.cameraPinnedError<1e-6),'translucent backing meshes stay screen-pinned with their DOM panes');
  const panels=await root.locator('[data-glass-panel]').evaluateAll(nodes=>nodes.map(panel=>({id:panel.dataset.glassPanel,rect:panel.getBoundingClientRect().toJSON()})));
  for(const panel of before.panels){const next=panels.find(item=>item.id===panel.id);assert.ok(Math.abs(next.rect.x-panel.rect.x)<.6&&Math.abs(next.rect.y-panel.rect.y)<.6,`pane ${panel.id} moved during touch orbit`);}
  return after;
}
async function contextExitWaitsForTransition(page,root,phone) {
  const input=root.locator('[data-glass-panel="input"]');
  await input.locator('input').focus();
  // Stretch the production transition in the regression harness so both
  // DOM and GPU progress can be sampled reliably on slow software WebGL.
  await input.evaluate(panel=>panel.style.transitionDuration='4s');
  const immediate=await root.evaluate(node=>{node.machine.focus('representation');const panel=node.querySelector('[data-glass-panel="input"]');
    const state={active:panel.dataset.contextActive,ariaHidden:panel.getAttribute('aria-hidden'),inert:panel.inert,
      stageFocused:node.querySelector('[data-machine-stage]')===document.activeElement};
    panel.querySelector('input')?.focus();state.focusLeak=panel.contains(document.activeElement);return state;});
  assert.deepEqual(immediate,{active:'false',ariaHidden:'true',inert:true,stageFocused:true,focusLeak:false},'exit makes the pane inert immediately and relocates focus');
  try {await expect.poll(async()=>(await diagnostics(root)).glass.panels.find(panel=>panel.id==='input').transitionOpacity,
    {timeout:5000}).toBeLessThan(1);}
  catch(error) {
    const state=await root.evaluate(node=>{const scene=node.machineController.scene,glass=scene?.glass;return {visible:node.machineController.visible,hidden:document.hidden,
      raf:scene?.glassAnimationRaf,panels:glass?.panels.map(panel=>({id:panel.id,active:panel.node.dataset.contextActive,
        animating:panel.node.contextAnimating,contextVisible:panel.node.contextVisible,domOpacity:getComputedStyle(panel.node).opacity,
        glassOpacity:panel.mesh.material.opacity,trimOpacity:panel.trim.material.opacity,hidden:panel.node.hidden})),
      stageRect:node.querySelector('[data-machine-stage]').getBoundingClientRect().toJSON()};});
    console.log(`Glass context state at exit sample timeout: ${JSON.stringify(state)}`);throw error;
  }
  const exiting=(await diagnostics(root)).glass.panels.find(panel=>panel.id==='input');
  assert.ok(exiting.transitionOpacity>0,'sample is inside the visible DOM transition');
  assert.equal(exiting.contextAnimating,true,'GPU transition remains active while the paused article replay is idle');
  assert.ok(exiting.transitionOpacity>0&&exiting.transitionOpacity<1,'pane backing opacity follows its eased DOM exit');
  assert.ok(exiting.backingOpacity>0&&exiting.backingOpacity<1,'translucent GPU glass fades between visible and hidden');
  assert.ok(exiting.trimOpacity>0&&exiting.trimOpacity<.32,'GPU trim fades with the glass and DOM pane');
  if(exiting.visible) {
    assert.ok(exiting.transitionOffset.x>0,'GPU glass translates in the DOM pane exit direction');
    assert.ok(exiting.transitionAlignmentError<3,'GPU glass and trim stay inside the translating DOM pane bounds');
  }
  await expect(root.locator('[data-glass-panel="inspect"]')).toHaveAttribute('data-context-active','true');
  await expect(input).toHaveAttribute('data-context-active','false');await expect(input).toHaveAttribute('aria-hidden','true');
  await expect(root.locator('[data-machine-stage]')).toBeFocused();
  if(phone) {
    await expect(root.locator('[data-instrument="input"]')).toBeDisabled();
    await expect(root.locator('[data-instrument="output"]')).toBeDisabled();
    await expect(root.locator('[data-instrument="inspect"]')).toBeEnabled();
    const state=await diagnostics(root);assert.equal(state.glass.panels.filter(panel=>panel.visible).length,state.glass.mode==='spatial'?1:0);
  }
  await root.evaluate(node=>node.machine.focus('all'));
  await expect(input).not.toHaveAttribute('aria-hidden','true');
  assert.equal(await input.evaluate(panel=>panel.inert),false,'reversing the context transition restores pane focusability');
  await page.waitForTimeout(120);
  const reversing=(await diagnostics(root)).glass.panels.find(panel=>panel.id==='input');
  assert.ok(reversing.transitionOpacity>exiting.transitionOpacity,'reversed easing moves the glass and DOM pane back toward their context pose');
  assert.ok(reversing.transitionOffset.x<exiting.transitionOffset.x,'reversed GPU backing follows the returning DOM pane');
  await root.evaluate(node=>node.machine.focus('representation'));
  await expect.poll(()=>input.evaluate(panel=>panel.contextVisible),{timeout:12000}).toBe(false);
  await expect(input).toHaveAttribute('inert','');
  await expect.poll(async()=>(await diagnostics(root)).glass.panels.find(panel=>panel.id==='input').visible,{timeout:12000}).toBe(false);
  await input.evaluate(panel=>panel.style.transitionDuration='');
}
async function runContextReversal(root) {
  await root.evaluate(node=>node.machine.focus('consumer'));
  await expect(root.locator('[data-glass-panel="output"]')).toHaveAttribute('data-context-active','true');
  await root.evaluate(node=>node.machine.focus('representation'));
  await root.evaluate(node=>node.machine.focus('all'));
}
function computedOpacity(node) { return getComputedStyle(node).opacity; }
async function inputPaneOpacity(input) { return input.evaluate(computedOpacity); }
async function waitForInputReentry(root) {
  const input=root.locator('[data-glass-panel="input"]');
  await expect.poll(inputPaneOpacity.bind(null,input),
    {timeout:12000}).toBe('1');
}
async function reverseContextToAll(root) {
  await runContextReversal(root);await waitForInputReentry(root);
}
async function selectOutputOnPhone(root) {
  await root.evaluate(()=>document.querySelector('[data-instrument="output"]').click());
  assert.equal(await root.evaluate(node=>node.machineController.instruments.active),'output','an enabled mobile tab selects its context-visible instrument');
  await expect(root.locator('[data-glass-panel="output"]')).toBeVisible();
  const selected=await diagnostics(root);
  assert.equal(selected.glass.panels.filter(panel=>panel.visible).length,selected.glass.mode==='spatial'?1:0,
    'choosing Output never reveals an inactive-context panel');
}
async function contextReversalKeepsTabsValid(page,root,phone) {
  await page.waitForTimeout(120);await reverseContextToAll(root);
  const input=root.locator('[data-glass-panel="input"]');await expect(input).not.toHaveAttribute('inert','');
  await expect.poll(()=>glassContextSettled(root),{timeout:5000}).toBe(true);
  const state=await diagnostics(root);
  await expect.poll(async()=>(await diagnostics(root)).glass.panels.filter(panel=>panel.visible).length)
    .toBe(phone&&state.glass.mode==='spatial'?1:phone?0:3);
  if(phone)await selectOutputOnPhone(root);
  await expect.poll(()=>input.evaluate(panel=>panel.inert)).toBe(false);
  await expect.poll(async()=>(await diagnostics(root)).glass.panels.filter(panel=>panel.contextVisible!==false).length).toBe(3);
}
async function glassContextStatus(root,checkGpu=true) {
  return root.evaluate((node,checkGpu)=>{
    const scene=node.machineController.scene,glass=scene?.glass;if(!scene||!glass)return {settled:false,panels:[]};
    const panels=glass.panels.map(panel=>{
      const active=panel.node.dataset.contextActive==='true',expected=active?glass.material.opacity:0;
      const state={id:panel.id,active,animating:panel.node.contextAnimating,contextVisible:panel.node.contextVisible,
        domOpacity:getComputedStyle(panel.node).opacity,glassOpacity:panel.mesh.material.opacity,trimOpacity:panel.trim.material.opacity,
        inert:panel.node.inert,hidden:panel.node.hidden};
      state.settled=panel.node.contextAnimating===false&&panel.node.contextVisible===active
        &&(!checkGpu||(Math.abs(panel.mesh.material.opacity-expected)<1e-6
        &&Math.abs(panel.trim.material.opacity-glass.trimMaterial.opacity*(active?1:0))<1e-6))
        &&panel.node.inert===!active;
      return state;
    });
    return {settled:scene.glassAnimationRaf===0&&!glass.hasContextAnimation()&&panels.every(panel=>panel.settled),
      raf:scene.glassAnimationRaf,anyAnimating:glass.hasContextAnimation(),visible:node.machineController.visible,panels};
  },checkGpu);
}
async function glassContextSettled(root,checkGpu=true) {
  return (await glassContextStatus(root,checkGpu)).settled;
}
async function entryWithoutTransitionEvent(root) {
  const panels=root.locator('[data-glass-panel]');
  const previous=await panels.evaluateAll(nodes=>nodes.map(panel=>panel.style.transitionDuration));
  await panels.evaluateAll(nodes=>nodes.forEach(panel=>panel.style.transitionDuration='0ms'));
  try {
    await root.evaluate(node=>node.machine.focus('representation'));
    try {await expect.poll(()=>glassContextSettled(root),{timeout:5000}).toBe(true);}
    catch(error) {console.log(`Glass context state at exit setup timeout: ${JSON.stringify(await glassContextStatus(root))}`);throw error;}
    await root.evaluate(node=>node.machine.focus('all'));
    await expect.poll(()=>glassContextSettled(root),{timeout:3000}).toBe(true);
  } finally {await panels.evaluateAll((nodes,durations)=>nodes.forEach((panel,index)=>panel.style.transitionDuration=durations[index]),previous);}
}
async function offscreenContextPause(page,root) {
  const initial=await root.evaluate(node=>node.machineController.visible);
  assert.equal(initial,true,'model starts visible for offscreen context regression');
  const spacer=await page.evaluate(()=>{const node=document.createElement('div');node.dataset.glassAuditSpacer='';node.style.height='150vh';document.body.append(node);return true;});
  assert.equal(spacer,true);
  try {
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    await expect.poll(()=>root.evaluate(node=>node.machineController.visible),{timeout:5000}).toBe(false);
    await root.evaluate(node=>node.machine.focus('consumer'));
    const pending=await root.evaluate(node=>node.machineController.scene.glassAnimationRaf);
    assert.equal(pending,0,'context transition does not schedule renderer work while the model is offscreen');
    await expect.poll(()=>glassContextSettled(root,false),{timeout:3000}).toBe(true);
    await root.locator('[data-machine-stage]').evaluate(node=>node.scrollIntoView({block:'center'}));
    await expect.poll(()=>root.evaluate(node=>node.machineController.visible),{timeout:5000}).toBe(true);
    await root.evaluate(node=>node.machine.focus('all'));
    await expect.poll(()=>glassContextSettled(root),{timeout:5000}).toBe(true);
  } finally {await page.locator('[data-glass-audit-spacer]').evaluate(node=>node.remove());}
}
async function nativeInputSelection(page,root,cdp) {
  await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});
  await expect.poll(async()=>(await diagnostics(root)).glass.mode).toBe('flow');
  const textInput=root.locator('[data-glass-panel="input"] input');
  await textInput.scrollIntoViewIfNeeded();await textInput.fill('pane selection stays native');
  const inputBox=await textInput.boundingBox();assert.ok(inputBox?.width>0&&inputBox?.height>0,'article input remains laid out for text selection');
  const before=await diagnostics(root);
  if(await textInput.isVisible()) {
    await textInput.selectText();
    const selection=await textInput.evaluate(input=>({start:input.selectionStart,end:input.selectionEnd,value:input.value}));
    assert.deepEqual(selection,{start:0,end:selection.value.length,value:'pane selection stays native'},'native input selection remains available');
  }
  const after=await diagnostics(root);
  assert.equal(after.camera.yaw,before.camera.yaw,'text selection does not orbit the camera');
  assert.equal(after.camera.pitch,before.camera.pitch,'text selection does not orbit the camera');
  await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
}
function readClientBox(node) {
  const rect=node.getBoundingClientRect();
  return {x:rect.left,y:rect.top,width:rect.width,height:rect.height};
}
function elementTagAtPoint({x,y}) { return document.elementFromPoint(x,y)?.tagName; }
async function assertInputPointerTarget(page,box) {
  assert.ok(box.width>80&&box.height>20,'visible native input has a pointer selection target');
  assert.equal(await page.evaluate(elementTagAtPoint,{x:box.x+12,y:box.y+box.height/2}),'INPUT',
    'real pointer coordinates land on the native input');
}
async function dispatchPointerDrag(page,box) {
  await page.mouse.move(box.x+12,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width-12,box.y+box.height/2,{steps:12});await page.mouse.up();
}
async function dragNativeInputText(page,input) {
  await input.scrollIntoViewIfNeeded();await input.fill('mouse drag remains native');
  const box=await input.evaluate(readClientBox);
  await assertInputPointerTarget(page,box);await dispatchPointerDrag(page,box);
}
async function realPointerTextSelection(page,root,phone) {
  if(phone)return;
  const before=await diagnostics(root),input=root.locator('[data-glass-panel="input"] input');
  await dragNativeInputText(page,input);
  const after=await diagnostics(root);
  assert.equal(after.camera.yaw,before.camera.yaw,'text drag cannot orbit the camera');
  assert.equal(after.camera.pitch,before.camera.pitch,'text drag cannot orbit the camera');
}
async function deepZoomIsFinite(root) {
  const zoom=direction=>root.evaluate((node,value)=>node.machineController.cameraAction(value>0?'in':'out'),direction);
  for(let index=0;index<100;index++)await zoom(1);
  const first=await diagnostics(root);assert.ok(Number.isFinite(first.camera.zoom)&&first.camera.zoom>1.8);
  for(let index=0;index<200;index++)await zoom(-1);
  const deep=await diagnostics(root);assert.ok(Number.isFinite(deep.camera.zoom)&&deep.camera.zoom<.75);
  const extreme=await root.evaluate(node=>{
    const scene=node.machineController.scene;scene.resetView();
    const before={zoom:scene.zoom,position:scene.camera.position.toArray(),projection:scene.camera.projectionMatrix.elements.slice()};
    scene.zoomByRatio(3e-307);
    return {before,after:{zoom:scene.zoom,position:scene.camera.position.toArray(),projection:scene.camera.projectionMatrix.elements.slice(),inverse:scene.camera.matrixWorldInverse.elements.slice()}};
  });
  assert.ok([...extreme.after.position,...extreme.after.projection,...extreme.after.inverse].every(Number.isFinite),
    'overflow-prone finite zoom input never leaves a non-finite camera projection');
  if(extreme.after.zoom===extreme.before.zoom) {
    assert.deepEqual(extreme.after.position,extreme.before.position,'invalid projection keeps the prior camera position');
    assert.deepEqual(extreme.after.projection,extreme.before.projection,'invalid projection keeps the prior camera matrix');
  }
  await root.evaluate(node=>node.querySelector('[data-machine-settings]').open=true);
  await root.locator('[data-camera="reset"]').click();assert.equal((await diagnostics(root)).camera.zoom,1);
  await root.evaluate(node=>node.querySelector('[data-machine-settings]').open=false);
}
async function independentPaneState(page,root,phone) {
  const cdp=await page.context().newCDPSession(page),canvas=await root.locator('canvas').boundingBox();
  const duration=await root.locator('[data-glass-panel]').first().evaluate(panel=>parseFloat(getComputedStyle(panel).transitionDuration));
  assert.ok(duration>=.7,'context highlight transitions use a longer ease-in/out');
  const before=await root.evaluate(node=>({camera:node.machine.diagnostics().camera,glass:node.machine.diagnostics().glass,
    panels:[...node.querySelectorAll('[data-glass-panel]')].map(panel=>({id:panel.dataset.glassPanel,rect:panel.getBoundingClientRect().toJSON()}))}));
  try {
    await touchOrbitKeepsLayout(page,root,cdp,canvas,before,phone);
    await contextExitWaitsForTransition(page,root,phone);
    await contextReversalKeepsTabsValid(page,root,phone);
    await entryWithoutTransitionEvent(root);
    await offscreenContextPause(page,root);
    await realPointerTextSelection(page,root,phone);
    await nativeInputSelection(page,root,cdp);
    if(!phone)await deepZoomIsFinite(root);
  } finally {await cdp.detach();}
}
async function reflow(page,root,phone) {
  const fitMode=(await diagnostics(root)).glass.mode;
  if(phone&&(await diagnostics(root)).glass.mode==='spatial')for(const id of ['inspect','output','input']) {
    await root.locator(`[data-instrument="${id}"]`).click();
    const d=await diagnostics(root);assert.equal(d.glass.mode,'spatial');assert.equal(d.glass.visible,1);
    await expect(root.locator(`[data-glass-panel="${id}"]`)).toBeVisible();await align(root);
  }
  if(phone&&(await diagnostics(root)).glass.mode==='spatial')await root.locator('[data-instrument="inspect"]').click();
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
  await expect.poll(async()=>(await diagnostics(root)).glass.mode).toBe(fitMode);
  await root.evaluate(node=>node.querySelector('[data-machine-settings]').open=true);
  await root.locator('[data-camera="in"]').click();await root.locator('[data-camera="in"]').click();
  assert.equal((await diagnostics(root)).glass.mode,fitMode,'camera zoom does not reflow article panes');
  assert.equal((await diagnostics(root)).glass.visible,fitMode==='spatial'?(phone?1:3):0,'camera zoom preserves contextual pane selection');
  await root.locator('[data-camera="reset"]').click();assert.equal((await diagnostics(root)).glass.mode,fitMode);
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
