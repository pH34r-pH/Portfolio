import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {expect} from '@playwright/test';

// The encased scene retains its physical housing and optical routes in both
// modes. Renderer totals include transmission/back-face passes and are reported
// as evidence; legacy flat-scene draw/triangle ceilings are not quality goals.
export function assertEncasedRender(diagnostics) {
  const {appearance,quality,resolution,drawCalls,triangles,glass}=diagnostics;
  assert.equal(appearance.style,'encased-crystal-v1');
  assert.equal(diagnostics.nodes,1668);assert.equal(diagnostics.edges,3601);
  assert.equal(appearance.pointGeometry,'OctahedronGeometry');assert.equal(appearance.pointRadius,.043);
  const geometry=appearance.geometry,routes=appearance.routes;
  assert.equal(geometry.nodes.instances,1668);assert.equal(geometry.nodes.triangles,1668*8);
  assert.equal(geometry.housing.length,23,'All encased housing mesh batches are retained');
  assert.equal(routes.curvedRoutes,3601);assert.equal(routes.segmentsPerRoute,24);
  assert.equal(geometry.routes.segments,3601*24,'Every scientific edge retains its sampled curve');
  assert.equal(routes.featuredOpticalGuides,101);
  assert.equal(geometry.guideCore.triangles,101*32*6*2,'Featured routes retain the full tube tessellation');
  assert.deepEqual(geometry.guideHalo,geometry.guideCore,'Optical halos retain the complete guide geometry');
  assert.equal(geometry.contours.segments,8*2*64,'Article fixture retains every layer contour');
  for(const component of [geometry.nodes,...geometry.housing,geometry.routes,geometry.guideCore,geometry.guideHalo,geometry.contours]) {
    for(const [key,value] of Object.entries(component).filter(([key])=>key!=='type'))
      assert.ok(Number.isSafeInteger(value)&&value>=0,`Finite retained geometry ${key}: ${value}`);
    assert.ok(component.positions>0&&component.instances>0);
  }
  assert.ok(Number.isSafeInteger(drawCalls)&&drawCalls>0,`Actual render draw calls: ${drawCalls}`);
  assert.ok(Number.isSafeInteger(triangles)&&triangles>0,`Actual rendered triangles: ${triangles}`);
  assert.ok(['refraction','lightweight'].includes(quality.effective));
  const lightweight=quality.effective==='lightweight';
  assert.equal(appearance.glazingTransmission,lightweight?0:1);
  assert.equal(appearance.nodeTransmission,lightweight?0:.18);
  assert.equal(glass.material.transmission,lightweight?0:.99);
  assert.equal(glass.pmremSize,128);
  assert.deepEqual(glass.environment,{ownership:'shared',mapping:'cube-uv',width:384,height:512,faceSize:128},
    'Panels reuse the active encased PMREM in both quality modes');
  const expectedDPR=Math.min(resolution.nativeDPR,quality.limits.maxTargetDimension/Math.max(resolution.cssWidth,resolution.cssHeight));
  assert.ok(Math.abs(resolution.effectiveDPR-expectedDPR)<1e-9,'Only the actual hardware dimension limit may reduce native DPR');
}

export async function beginContextTransitionSample(root,part,previous=null) {
  return root.evaluate((node,{part,previous})=>{
    function holdContextTransition(element,scene) {
      for(const animation of element.getAnimations()) {
        const time=animation.currentTime;
        // Seeking to the observed time completes the pending pause immediately.
        animation.pause();animation.currentTime=time;
      }
      // Hold the observed CSS pose across audit RPCs and align the native
      // backing at that pose rather than a later wall-clock ease.
      scene.glass.sync(scene.camera);
    }
    function resumeContextTransition(element) {
      for(const animation of element.getAnimations())if(animation.playState==='paused')animation.play();
    }
    const element=node.querySelector('[data-glass-panel="input"]');
    node.machine.focus(part);
    if(previous)resumeContextTransition(element);
    const immediate={active:element.dataset.contextActive,ariaHidden:element.getAttribute('aria-hidden'),inert:element.inert,
      stageFocused:node.querySelector('[data-machine-stage]')===document.activeElement};
    if(!previous){element.querySelector('input')?.focus();immediate.focusLeak=element.contains(document.activeElement);}
    // Arm in this same browser task, after the renderer schedules its frame.
    // External RPC polling can miss an entire ease on a CPU-limited runner.
    node.contextAuditSample=new Promise(resolve=>{
      let raf=0;
      const finish=sample=>{clearTimeout(timeout);cancelAnimationFrame(raf);resolve(sample);};
      const timeout=setTimeout(()=>finish(null),previous?5000:8000);
      const capture=()=>{
        try {
        const backing=node.machineController.scene.glass.panels.find(panel=>panel.id==='input'),style=getComputedStyle(element);
        const opacity=parseFloat(style.opacity),translation=parseFloat(style.translate)||0;
        const matches=previous
          ?backing.transitionOpacity>previous.panel.transitionOpacity
            &&(!previous.panel.visible||backing.transitionOffset.x<previous.panel.transitionOffset.x)&&translation<previous.translation
          :element.contextAnimating&&opacity>0&&opacity<1&&backing.mesh.material.opacity>0&&backing.mesh.material.opacity<1;
        if(matches){
          const scene=node.machineController.scene;
          holdContextTransition(element,scene);
          const held=getComputedStyle(element);
          finish({panel:scene.glass.diagnostics().panels.find(panel=>panel.id==='input'),
            translation:parseFloat(held.translate)||0,domOpacity:parseFloat(held.opacity)});return;
        }
        raf=requestAnimationFrame(capture);
        } catch(error) {finish({error:String(error)});}
      };
      raf=requestAnimationFrame(capture);
    });
    return immediate;
  },{part,previous});
}

export async function readContextTransitionSample(root) {
  const sample=await root.evaluate(node=>node.contextAuditSample);
  if(sample?.error)throw Error(sample.error);
  return sample;
}

export async function assertSuppressedOpacityOrder(input,settled) {
  if(!settled.suppressed)return;
  const captured=await input.evaluate(panel=>({animating:panel.contextAuditAnimatingAtTransitionEnd,elapsed:panel.contextAuditElapsedAtTransitionEnd}));
  if(!captured.animating)assert.ok(captured.elapsed>=settled.duration+250,
    'an opacity event delivered after timer completion cannot precede the fallback deadline');
}

// Keep the embedded viewer's gesture/keyboard gates after the homepage changed.
// Source-only runs use the canonical publication host fixture; finished bundles
// must use a real rendered article with its own source and export contracts.
export async function articleHost(base,{componentFixture=false}={}) {
  if(componentFixture){const html=await readFile(new URL('./fixtures/article-model.html',import.meta.url),'utf8');return {url:base+'/__audit/article-model/',kind:'illustrative-renderer-component-fixture',manualStart:false,html};}
  const response=await fetch(base+'/publication.json');
  if(response.ok&&(response.headers.get('content-type')||'').includes('json')) {
    const manifest=await response.json();
    const article=manifest.articles.find(item=>item.modelFocus);
    assert.ok(article,'Finished bundle must contain an embedded model article');
    return {url:base+article.url,kind:'published-article',manualStart:true,slug:article.slug,publicationSources:manifest.sources};
  }
  if(process.env.PORTFOLIO_PUBLICATION_BUNDLE==='1')throw Error('Required publication manifest is unavailable');
  const html=await readFile(new URL('./fixtures/article-model.html',import.meta.url),'utf8');
  return {url:base+'/__audit/article-model/',kind:'canonical-source-fixture',manualStart:false,html};
}

// Published articles own a manual startup controller. The historical source
// fixture deliberately retains its viewport-deferred controller contract.
export async function assertUnstartedArticle(root,{quiet=false}={}) {
  await expect(root).toHaveAttribute('data-model-startup','');
  await expect(root).toHaveAttribute('data-startup',quiet?'quiet':'idle');
  await expect.poll(()=>root.evaluate(node=>Boolean(node.modelStartup))).toBe(true);
  const state=await root.evaluate(node=>({startup:node.modelStartup.snapshot(),
    ownsRoot:node.modelStartup.root===node,controller:Boolean(node.machineController),
    homeMarker:node.hasAttribute('data-digital-home'),homeStartup:Boolean(window.PortfolioModelStartup),
    render:node.getAttribute('data-render'),
    engineRequests:performance.getEntriesByType('resource').filter(entry=>entry.name.includes('three@0.186.1')).length}));
  assert.equal(state.ownsRoot,true,'Article startup is owned by this article root');
  assert.equal(state.homeMarker,false,'Article does not become the Home viewer');
  assert.equal(state.homeStartup,false,'Article does not install the Home startup singleton');
  assert.equal(state.controller,false,'Article controller stays unloaded before user Start');
  assert.equal(state.render,null,'Unstarted article has no renderer');
  assert.equal(state.engineRequests,0,'Unstarted article makes no Three.js request');
  assert.equal(state.startup.started,false);assert.equal(state.startup.ignitionComplete,false);
  assert.equal(state.startup.elapsedActiveMs,0);assert.equal(state.startup.handoffs,0);
  await expect(root.locator('[data-model-boot]')).toContainText('Static architecture display');
  if(quiet)await expect(root.locator('[data-model-start]')).toBeHidden();
  else await expect(root.locator('[data-model-start]')).toBeVisible();
  await expect(root.locator('[data-machine-fallback]')).toBeVisible();
  return state.startup;
}

export async function startArticleModel(root) {
  // Exercise the same user-facing control as readers, never boot()/start().
  await root.locator('[data-model-start]').click();
  await root.locator('[data-machine-stage]').scrollIntoViewIfNeeded();
  await expect(root).toHaveAttribute('data-render',/^(webgl|fallback)$/,{timeout:30000});
  await expect(root).toHaveAttribute('data-startup',/^(ready|fallback)$/,{timeout:30000});
  const state=await root.evaluate(node=>({startup:node.modelStartup.snapshot(),
    ownsStartup:node.machineController.startup===node.modelStartup,homeStartup:Boolean(window.PortfolioModelStartup)}));
  assert.equal(state.ownsStartup,true,'Article controller uses its own startup instance');
  assert.equal(state.homeStartup,false,'Starting an article does not install Home startup');
  assert.equal(state.startup.started,true,'Article Start records user intent');
  if(await root.getAttribute('data-render')==='webgl') {
    assert.equal(state.startup.phase,'ready');assert.equal(state.startup.ignitionComplete,true);
    assert.equal(state.startup.handoffs,1);assert.equal(state.startup.completions,1);
    assert.equal(state.startup.elapsedActiveMs,1800,'Article preserves the complete ignition');
  }
  return state.startup;
}

export async function prepareArticleModel(page,root,host) {
  if(host.manualStart) {
    const quiet=await page.evaluate(()=>matchMedia('(prefers-reduced-motion:reduce)').matches||matchMedia('(forced-colors:active)').matches);
    await assertUnstartedArticle(root,{quiet});
    if(quiet)return {quiet:true,unstarted:true};
    await startArticleModel(root);
  } else {
    await root.locator('[data-machine-stage]').scrollIntoViewIfNeeded();
    await expect(root).toHaveAttribute('data-render',/^(webgl|fallback)$/,{timeout:30000});
  }
  return {quiet:false,unstarted:false};
}

export async function startThenQuietArticle(page,root,mode) {
  // A fresh quiet article has only its static markup. First prove that clearing
  // the preference does not grant intent, then start by UI and test the existing
  // inspectable replay fallback when the reader re-enables their preference.
  await page.emulateMedia(mode==='reduced-motion'?{reducedMotion:'no-preference'}:{forcedColors:'none'});
  await assertUnstartedArticle(root);
  await startArticleModel(root);
  await page.emulateMedia(mode==='reduced-motion'?{reducedMotion:'reduce'}:{forcedColors:'active'});
  await expect(root).toHaveAttribute('data-startup','quiet');
  await expect(root).toHaveAttribute('data-render','fallback');
}

export async function screenshotModel(page,root,options) {
  if(await root.evaluate(node=>getComputedStyle(node).display)!=='contents')return root.screenshot(options);
  // The finished sticky article uses display:contents, so its section has no
  // screenshot box. Capture the union of its real child boxes without changing
  // production layout or dropping the controls from the evidence.
  const clip=await root.evaluate(node=>{
    const boxes=[...node.querySelectorAll('*')].filter(child=>child.checkVisibility())
      .map(child=>child.getBoundingClientRect()).filter(rect=>rect.width>0&&rect.height>0);
    const x=Math.max(0,Math.min(...boxes.map(rect=>rect.left))+scrollX);
    const y=Math.max(0,Math.min(...boxes.map(rect=>rect.top))+scrollY);
    const right=Math.min(document.documentElement.scrollWidth,Math.max(...boxes.map(rect=>rect.right))+scrollX);
    const bottom=Math.min(document.documentElement.scrollHeight,Math.max(...boxes.map(rect=>rect.bottom))+scrollY);
    return {x,y,width:right-x,height:bottom-y};
  });
  assert.ok(clip.width>0&&clip.height>0,'Article screenshot covers visible model descendants');
  return page.screenshot({...options,fullPage:true,clip});
}

export function contextTransitionAdvances(panel,previous) {
  return panel.transitionOpacity>previous.transitionOpacity
    &&(!previous.visible||panel.transitionOffset.x<previous.transitionOffset.x);
}

export async function auditArticleQuietModeRestore(browser,base,mode,initial,cleared) {
  const host=await articleHost(base),context=await browser.newContext({viewport:{width:1366,height:900},...initial}),page=await context.newPage(),errors=[];
  let engines=0;page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().includes('three@0.186.1'))engines++;});
  if(host.html)await page.route(host.url,route=>route.fulfill({contentType:'text/html',body:host.html}));
  try {
    await page.goto(host.url,{waitUntil:'networkidle'});
    const root=page.locator('[data-model-machine]').first();
    if(host.manualStart)await assertUnstartedArticle(root,{quiet:true});
    else {
      await root.locator('[data-machine-stage]').scrollIntoViewIfNeeded();
      await expect(root).toHaveAttribute('data-render','fallback');
    }
    assert.equal(engines,0,`${mode} article remains static before the preference clears`);
    await page.emulateMedia(cleared);
    let started=null;
    if(host.manualStart) {
      await assertUnstartedArticle(root);
      assert.equal(engines,0,'Clearing quiet mode does not bypass article user intent');
      started=await startArticleModel(root);
      await expect(root).toHaveAttribute('data-render','webgl');
      // Once the reader has started, preference restoration may resume that
      // retained intent, with the same article-owned controller and ignition.
      await page.emulateMedia(initial);
      await expect(root).toHaveAttribute('data-startup','quiet');
      await expect(root).toHaveAttribute('data-render','fallback');
      await expect(root.locator('[data-machine-fallback] svg')).toBeVisible();
      await page.emulateMedia(cleared);
      await expect(root).toHaveAttribute('data-startup','ready',{timeout:15000});
      const restored=await root.evaluate(node=>({snapshot:node.modelStartup.snapshot(),
        owned:node.machineController.startup===node.modelStartup,homeStartup:Boolean(window.PortfolioModelStartup)}));
      assert.equal(restored.owned,true,'Preference restoration preserves article startup ownership');
      assert.equal(restored.homeStartup,false,'Preference restoration does not attach Home startup');
      assert.equal(restored.snapshot.completions,started.completions,'Quiet restoration does not repeat completed ignition');
    } else assert.equal(await root.getAttribute('data-model-startup'),null,'Source fixture keeps its independent deferred lifecycle');
    await expect(root).toHaveAttribute('data-render','webgl',{timeout:15000});
    assert.ok(engines>0,`${mode} article restores its visible interactive renderer after authorized startup`);
    assert.deepEqual(errors,[]);
    return {mode:`article-${mode}-restoration`,articleEvidence:host.kind,engines,visibleRestore:true,
      articleManualStart:host.manualStart,started,errors};
  } finally {await context.close();}
}
