import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {articleHost,prepareArticleModel,screenshotModel} from './model-audit-host.mjs';
import {fileURLToPath} from 'node:url';

const sourceBase=process.env.PORTFOLIO_AUDIT_URL||'http://127.0.0.1:45937';
const publishedBase=process.env.PORTFOLIO_PUBLISHED_AUDIT_URL;
const out=process.env.MODEL_VISUAL_EVIDENCE_DIR||'ux-screenshots/visual-v2';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),evidence=[];
const viewports=[['phone-360-dpr1',360,800,1],['phone-412-dpr3',412,915,3],['desktop-dpr2',1440,1000,2]];
const root=fileURLToPath(new URL('../',import.meta.url));
const sharedAssetFiles=['model-view.js','model-power.js','model-scene.js','model-quality.js','model-topology.js','model-digital.js',
  'model-glass.js','model-hardware.js','model-light.js','model-gestures.js','model-render-metrics.js','homepage-screens.js','model-machine.js','article-runtime.js',
  'model-startup.js','article-model-loader.js','article-model-sticky.css','model-machine.css','model-glass.css','site.css','vendor/three@0.186.1/three.module.js','vendor/three@0.186.1/three.core.js'];
let publishedAssetIdentity=null;

async function verifyPublishedAssetIdentity(articleBase) {
  const hashes={};
  for(const file of sharedAssetFiles) {
    const [sourceResponse,articleResponse]=await Promise.all([
      fetch(`${sourceBase}/assets/${file}`),fetch(`${articleBase}/assets/${file}`)
    ]);
    assert.ok(sourceResponse.ok,`Source host did not serve /assets/${file}`);
    assert.ok(articleResponse.ok,`Finished article host did not serve /assets/${file}`);
    const [sourceBytes,articleBytes]=await Promise.all([sourceResponse.arrayBuffer(),articleResponse.arrayBuffer()]);
    const sourceHash=createHash('sha256').update(Buffer.from(sourceBytes)).digest('hex');
    const articleHash=createHash('sha256').update(Buffer.from(articleBytes)).digest('hex');
    assert.equal(articleHash,sourceHash,`Finished article served a different /assets/${file}`);
    assert.equal(sourceHash,createHash('sha256').update(await readFile(`${root}site/assets/${file}`)).digest('hex'),
      `Local source checkout differs from served /assets/${file}`);
    hashes[file]=sourceHash;
  }
  return hashes;
}

function assertHorizontal(xs,label) {
  assert.equal(xs.length,8,`${label}: eight graph layer landmarks`);
  assert.ok(xs.every((x,index)=>index===0||x>xs[index-1]),`${label}: input-to-output landmark order ${xs}`);
}
function assertGeometryFit(bounds,label) {
  const {width,height}=bounds.viewport,margin=bounds.marginPx;
  assert.equal(bounds.routeCount,3601,`${label}: full display route count`);
  assert.equal(bounds.recurrenceCount,1,`${label}: shared-block recurrence route`);
  assert.ok(bounds.components.routeControlPoints.count>3601,`${label}: route control vertices are included`);
  for(const [part,box] of Object.entries({all:bounds.all,...bounds.components})) {
    assert.ok(box.left>=margin-.25,`${label}/${part}: left bound ${box.left} misses ${margin}px margin`);
    assert.ok(box.right<=width-margin+.25,`${label}/${part}: right bound ${box.right} misses ${margin}px margin`);
    assert.ok(box.top>=margin-.25,`${label}/${part}: top bound ${box.top} misses ${margin}px margin`);
    assert.ok(box.bottom<=height-margin+.25,`${label}/${part}: bottom bound ${box.bottom} misses ${margin}px margin`);
  }
}

async function installFixture(page,host) {
  if(!host.html)return;
  await page.route(`${host.base}/__audit/article-model/`,route=>route.fulfill({
    status:200,contentType:'text/html; charset=utf-8',body:host.html
  }));
}

async function scrollObservedStageIntoView(page) {
  const root=page.locator('[data-model-machine]').first();
  // The model section can be taller than the viewport. Scrolling the root only
  // may leave its observed stage below the fold, where the deferred engine
  // never starts. Scroll the observed stage before asserting render.
  await root.locator('[data-machine-stage]').scrollIntoViewIfNeeded();
  return root;
}

async function inspectHost(host,viewport) {
  const {kind,base,url}=host;
  const [name,width,height,dpr]=viewport;
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,colorScheme:'light'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await installFixture(page,host);
  await page.goto(base+url,{waitUntil:'networkidle'});
  const root=page.locator('[data-model-machine]').first();
  if(kind==='home') {
    await scrollObservedStageIntoView(page);
    await page.getByRole('button',{name:'Start interactive model'}).click();
  } else await prepareArticleModel(page,root,host);
  await expect(root).toHaveAttribute('data-render',/webgl|fallback/,{timeout:30000});
  await expect(root).toHaveAttribute('data-render','webgl');
  await root.evaluate(node=>node.machine.seek(145));
  const diagnostics=await root.evaluate(node=>node.machine.diagnostics());
  assert.equal(diagnostics.nodes,1668);assert.equal(diagnostics.edges,3601);
  assert.equal(diagnostics.quality.requested,'auto');assert.equal(diagnostics.quality.effective,'refraction');
  assert.equal(diagnostics.quality.contextAttributes.antialias,true);
  assert.ok(diagnostics.quality.sampleSupport.defaultFramebufferSamples>0);
  assert.equal(diagnostics.transmissionScale,1);
  const canvas=await root.locator('canvas').evaluate(node=>({rect:(()=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})(),width:node.width,height:node.height}));
  assertGeometryFit(diagnostics.graphGeometryBounds,`${kind}/${name}`);
  const resolution=diagnostics.resolution,limits=diagnostics.quality.limits;
  assert.ok(Math.abs(resolution.effectiveDPR-dpr)<.01,`${kind}/${name}: effective DPR ${resolution.effectiveDPR} != ${dpr}`);
  assert.equal(canvas.width,resolution.drawingBufferWidth);assert.equal(canvas.height,resolution.drawingBufferHeight);
  assert.ok(Math.abs(canvas.width-Math.round(canvas.rect.width*dpr))<=1,`${kind}/${name}: CSS-to-buffer width rounding`);
  assert.ok(Math.abs(canvas.height-Math.round(canvas.rect.height*dpr))<=1,`${kind}/${name}: CSS-to-buffer height rounding`);
  assert.ok(canvas.width<=limits.maxTargetDimension&&canvas.height<=limits.maxTargetDimension);
  const transmissivePanels=diagnostics.glass.visible>0&&diagnostics.glass.material.transmission>0;
  if(transmissivePanels) {
    assert.ok(resolution.transmissionTarget?.samples>0,`${kind}/${name}: visible transmissive panels need a real multisample target`);
    assert.ok(Math.abs(resolution.transmissionTarget.width-canvas.width)<=1);
    assert.ok(Math.abs(resolution.transmissionTarget.height-canvas.height)<=1);
  }
  assertHorizontal(diagnostics.landmarks.map(([x])=>x),`${kind}/${name}`);
  assert.ok(diagnostics.graphBounds.left>=-1&&diagnostics.graphBounds.right<=canvas.rect.width+1,`${kind}/${name}: graph fits horizontally ${JSON.stringify(diagnostics.graphBounds)}`);
  assert.ok(diagnostics.graphBounds.top>=-1&&diagnostics.graphBounds.bottom<=canvas.rect.height+1,`${kind}/${name}: graph fits vertically ${JSON.stringify(diagnostics.graphBounds)}`);
  assert.equal(diagnostics.appearance.lightBlue,'165577');assert.equal(diagnostics.appearance.darkBlue,'447abb');assert.equal(diagnostics.appearance.activityBlue,'39baff');
  assert.deepEqual(errors,[]);
  const path=`${out}/${kind}-${name}.png`;
  await screenshotModel(page,root,{path});
  const themes=[];
  for(const theme of ['light','dark']) {
    await page.evaluate(value=>{document.documentElement.dataset.themeMode=value;document.documentElement.dataset.theme=value;},theme);
    await page.waitForTimeout(60);
    const themed=await root.evaluate(node=>node.machine.diagnostics());
    assert.equal(themed.appearance.contourColor,theme==='dark'?'447abb':'165577');
    const themePath=`${out}/${kind}-${name}-${theme}.png`;
    await screenshotModel(page,root,{path:themePath});themes.push({theme,path:themePath,contourColor:themed.appearance.contourColor});
  }
  await context.close();
  return {kind,viewport:{name,width,height,dpr},diagnostics,canvas,transmissivePanels,screenshot:path,themes,errors};
}

async function quietModes(host) {
  const {base,url,kind}=host;
  for(const mode of ['reduced-motion','forced-colors']) {
    const context=await browser.newContext({viewport:{width:360,height:800},deviceScaleFactor:1,
      ...(mode==='reduced-motion'?{reducedMotion:'reduce'}:{forcedColors:'active'})});
    const page=await context.newPage();let engineRequests=0;
    page.on('request',request=>{if(request.url().includes('three@0.186.1'))engineRequests++;});
    await installFixture(page,host);
    await page.goto(base+url,{waitUntil:'networkidle'});
    const root=page.locator('[data-model-machine]').first();
    if(host.manualStart)await prepareArticleModel(page,root,host);
    else {
      await scrollObservedStageIntoView(page);
      await expect(root).toHaveAttribute('data-render','fallback');
    }
    await expect(root.locator('[data-machine-fallback]')).toBeVisible();
    assert.equal(engineRequests,0,`${kind}/${mode} must perform zero Three.js loads`);
    const svg=await root.locator('[data-machine-fallback] svg').count();
    if(svg) {
      assert.equal(await root.locator('[data-machine-fallback] svg').getAttribute('data-orientation'),'input-to-output');
      const layers=await root.locator('[data-machine-fallback] [data-layer]').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.layer)));
      assert.equal(layers.length,1668);
    }
    const path=`${out}/${kind}-${mode}.png`;await screenshotModel(page,root,{path});
    evidence.push({kind,mode,engineRequests,svgFallback:svg===1,screenshot:path});await context.close();
  }
}

try {
  const hosts=[{kind:'home',base:sourceBase,url:'/?model-audit=1'}];
  const sourceArticle=await articleHost(sourceBase);
  hosts.push({...sourceArticle,kind:sourceArticle.manualStart?'published-article':'article-fixture',base:sourceBase,url:sourceArticle.url.replace(sourceBase,'')});
  if(publishedBase) {
    publishedAssetIdentity=await verifyPublishedAssetIdentity(publishedBase);
    const article=await articleHost(publishedBase);
    assert.equal(article.kind,'published-article','A fixture is not a finished MyST publication');
    hosts.push({kind:'published-myst-article',manualStart:article.manualStart,base:publishedBase,url:article.url.replace(publishedBase,''),
      slug:article.slug,publicationSources:article.publicationSources});
  }
  for(const host of hosts)for(const viewport of viewports)evidence.push(await inspectHost(host,viewport));
  for(const host of hosts)await quietModes(host);

  // A genuine responsive boundary crossing keeps graph landmarks horizontal.
  const context=await browser.newContext({viewport:{width:721,height:900},deviceScaleFactor:2});
  const page=await context.newPage();await page.goto(sourceBase+'/?model-audit=1',{waitUntil:'networkidle'});
  const root=page.locator('[data-model-machine]').first();await root.scrollIntoViewIfNeeded();
  await page.getByRole('button',{name:'Start interactive model'}).click();await expect(root).toHaveAttribute('data-render','webgl');
  const resize=[],canonicalHomeViews={};
  for(const width of [721,720,412,721]) {
    await page.setViewportSize({width,height:900});
    await page.waitForTimeout(120);
    const d=await root.evaluate(node=>node.machine.diagnostics());
    const phone=width<=720,profile=phone?'phone':'desktop';
    assert.equal(d.camera.yaw,phone?-.15:-.5,`resize-${width}: untouched Home yaw follows the canonical ${profile} pose`);
    assert.equal(d.camera.pitch,phone ? .38 : .1,`resize-${width}: untouched Home pitch follows the canonical ${profile} pose`);
    if(canonicalHomeViews[profile])assert.equal(d.camera.distance,canonicalHomeViews[profile],`resize-${width}: ${profile} keeps its poster distance`);
    else canonicalHomeViews[profile]=d.camera.distance;
    assertHorizontal(d.landmarks.map(([x])=>x),`resize-${width}`);
    assertGeometryFit(d.graphGeometryBounds,`home resize-${width}x${d.graphGeometryBounds.viewport.height}`);
    assert.deepEqual(d.camera.pan,{x:0,y:0});
    resize.push({width,rotation:'0,0,0',camera:d.camera,landmarks:d.landmarks,graphGeometryBounds:d.graphGeometryBounds});
  }
  await screenshotModel(page,root,{path:`${out}/home-resize-boundary.png`});
  evidence.push({kind:'responsive-boundary',widths:resize,screenshot:`${out}/home-resize-boundary.png`});
  await context.close();

  // Headless Chromium cannot change browser chrome zoom. Emulate its layout result
  // by preserving physical viewport pixels while reducing CSS size and increasing DPR.
  const zoomProfiles=[[125,1152,720,2.5],[200,720,450,4],[250,576,360,5]];
  for(const host of [hosts[0],hosts.at(-1)])for(const [percent,width,height,dpr] of zoomProfiles) {
    const name=`zoom-equivalent-${percent}`;
    evidence.push(await inspectHost(host,[name,width,height,dpr]));
  }

  // No-JavaScript Home still selects a horizontal native poster, by CSS viewport.
  for(const [name,width,height,dpr] of [['phone',360,800,1],['desktop',1440,1000,2]]) {
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr});
    await context.addInitScript(()=>{});await context.route('**/*',async(route)=>{
      if(route.request().resourceType()==='script')return route.abort();
      return route.continue();
    });
    const page=await context.newPage();await page.goto(sourceBase+'/?model-audit=1',{waitUntil:'networkidle'});
    const poster=page.locator('.digital-model-loop-poster');await expect(poster).toBeVisible();
    await expect(page.locator('.digital-machine-audit-surface')).toBeHidden();
    const source=await poster.getAttribute('src');assert.equal(source,'/assets/homepage-model-loop-poster.webp');
    const path=`${out}/home-nojs-${name}.png`;await page.screenshot({path,fullPage:false});
    evidence.push({kind:'nojs-home-cinematic-poster',viewport:{name,width,height,dpr},source,screenshot:path});await context.close();
  }
  const result={schemaVersion:1,environment:{browser:'headless Chromium with SwiftShader software rendering',sourceBase,
    publishedBase:publishedBase||null,publishedArticleObserved:hosts.some(host=>host.kind==='published-myst-article'),
    publishedArticle:hosts.filter(host=>host.kind==='published-myst-article').map(host=>({slug:host.slug,publicationSources:host.publicationSources})),
    publishedAssetIdentity,
    browserZoomProfiles:zoomProfiles.map(([percent,width,height,dpr])=>({percent,width,height,dpr,method:'headless equivalent CSS viewport and native DPR; browser chrome zoom is unavailable'})),
    note:'Software-WebGL is a software observation, not physical Android or deployed GPU evidence. Browser zoom is represented by equivalent CSS viewport and DPR metrics; headless Chromium browser chrome zoom is unavailable.'},evidence};
  await writeFile(`${out}/audit.json`,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({hosts:hosts.map(({kind,url,slug,publicationSources})=>({kind,url,slug,publicationSources})),profiles:evidence.length,
    publishedArticleObserved:result.environment.publishedArticleObserved,evidence:`${out}/audit.json`},null,2));
} catch(error) {
  await writeFile(`${out}/audit.json`,JSON.stringify({failure:error.message,evidence},null,2)+'\n');throw error;
} finally {await browser.close();}
