import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
import {POSTER_VIEWS} from '../site/assets/model-view.js';
import {rgbChannelErrorParallel} from './model-pixel-fidelity.mjs';

const sharp=createRequire(import.meta.url)('sharp');
const base=process.env.PORTFOLIO_AUDIT_URL||'http://127.0.0.1:4173';
const output=new URL('../site/assets/model-posters/',import.meta.url);
const evidence=new URL('../ux-screenshots/visual-v2/posters/',import.meta.url);
const densities=[1,2,3],assets=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceFiles=['model-view.js','model-power.js','model-scene.js','model-quality.js','model-topology.js','model-digital.js','model-glass.js','model-hardware.js',
  'model-light.js','model-gestures.js','model-render-metrics.js','homepage-screens.js','model-architecture.json',
  'vendor/three@0.186.1/three.module.js','vendor/three@0.186.1/three.core.js'];
const pipelineFiles=['scripts/capture-model-posters.mjs','scripts/model-pixel-fidelity.mjs','scripts/model-pixel-fidelity-worker.mjs',
  'scripts/test-model-pixel-fidelity.mjs','scripts/test-model-startup.mjs','scripts/model-audit-host.mjs','scripts/model-visual-audit.mjs',
  'scripts/prepare-model-visual-evidence.mjs','.github/workflows/ux-quality.yml','package.json','package-lock.json'];

async function readLocalHashes(files) {
  return Object.fromEntries(await Promise.all(files.map(async file=>[file,hash(await readFile(new URL('../site/assets/'+file,import.meta.url)))])));
}
async function verifyServedSources(expected) {
  const actual={};
  for(const file of sourceFiles) {
    const response=await fetch(new URL('/assets/'+file,base));
    assert.ok(response.ok,`Capture host did not serve /assets/${file}`);
    actual[file]=hash(Buffer.from(await response.arrayBuffer()));
  }
  assert.deepEqual(actual,expected,'Capture host source bytes must match this local checkout');
  return actual;
}
async function comparePixels(png,encoded,background) {
  const readRgb=input=>sharp(input).flatten({background}).toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true});
  const [original,decoded]=await Promise.all([readRgb(png),readRgb(encoded)]);
  assert.equal(decoded.info.width,original.info.width);assert.equal(decoded.info.height,original.info.height);
  assert.equal(original.info.channels,3);assert.equal(decoded.info.channels,3);
  return rgbChannelErrorParallel(original.data,decoded.data);
}
function assertFitted(bounds,label) {
  const margin=bounds.marginPx,width=bounds.viewport.width,height=bounds.viewport.height;
  const checked={all:bounds.all,...bounds.components};
  for(const [part,box] of Object.entries(checked)) {
    assert.ok(box.left>=margin-0.25,`${label}/${part} left ${box.left} < ${margin}px margin`);
    assert.ok(box.right<=width-margin+0.25,`${label}/${part} right ${box.right} > ${width-margin}px margin`);
    assert.ok(box.top>=margin-0.25,`${label}/${part} top ${box.top} < ${margin}px margin`);
    assert.ok(box.bottom<=height-margin+0.25,`${label}/${part} bottom ${box.bottom} > ${height-margin}px margin`);
  }
  assert.equal(bounds.routeCount,3601);assert.equal(bounds.recurrenceCount,1);
}
async function captureVariant(browser,name,view,theme,density) {
  const context=await browser.newContext({viewport:{width:view.width,height:view.height},deviceScaleFactor:density,colorScheme:theme});
  try {
    const page=await context.newPage();
    await page.route(base+'/__capture__/',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><title>Native pixel renderer capture</title></head><body style="margin:0;background:${theme==='dark'?'#050712':'#f4f9fd'}"><div data-digital-home data-model-startup><canvas style="display:block;width:${view.width}px;height:${view.height}px"></canvas></div></body></html>`}));
    await page.goto(base+'/__capture__/');
    const capture=await page.evaluate(async()=>{
      const T=await import('/assets/vendor/three@0.186.1/three.module.js');
      const {MachineScene}=await import('/assets/model-scene.js');
      const root=document.querySelector('[data-digital-home]'),canvas=root.querySelector('canvas');canvas.dataset.machineCanvas='';
      const instruments={root,host:root,layer:root,quality(){},setMode(){},dimensions(){return [];}};
      const scene=new MachineScene(T,root,()=>{},reason=>{throw Error(reason);},()=>{},instruments);
      scene.setQuality('refraction');await scene.prepare();scene.setPower(0,true);
      const poweredDownPNG=canvas.toDataURL('image/png'),poweredDownView=scene.powerView(),poweredDownDiagnostics=scene.diagnostics();
      scene.finishPower();const {createReplay,sampleReplay}=await import('/assets/model-topology.js');
      const run=createReplay('native pixel visual comparison');scene.applyFrame(run,sampleReplay(run,145));
      return {png:poweredDownPNG,detailPNG:canvas.toDataURL('image/png'),view:poweredDownView,diagnostics:poweredDownDiagnostics,detailDiagnostics:scene.diagnostics(),pose:{yaw:scene.yaw,pitch:scene.pitch,zoom:scene.zoom,rotation:scene.machine.rotation.toArray().slice(0,3),scale:scene.machine.scale.x}};
    });
    assert.equal(capture.diagnostics.nodes,1668);assert.equal(capture.diagnostics.edges,3601);
    assert.equal(capture.diagnostics.quality.requested,'refraction');assert.equal(capture.diagnostics.quality.effective,'refraction');
    assert.equal(capture.diagnostics.quality.contextAttributes.antialias,true);assert.ok(capture.diagnostics.quality.sampleSupport.defaultFramebufferSamples>0);
    assert.equal(capture.diagnostics.transmissionScale,1);
    const resolution=capture.diagnostics.resolution;
    assert.ok(Math.abs(resolution.effectiveDPR-density)<.01,`Capture density ${density}x was capability-limited to ${resolution.effectiveDPR}`);
    assert.equal(resolution.canvasWidth,resolution.drawingBufferWidth);assert.equal(resolution.canvasHeight,resolution.drawingBufferHeight);
    assert.equal(resolution.canvasWidth,view.width*density);assert.equal(resolution.canvasHeight,view.height*density);
    if(capture.diagnostics.glass.material.transmission>0&&capture.diagnostics.glass.visible>0) {
      assert.ok(resolution.transmissionTarget,'Missing observed transmission target for '+name+' '+theme+' '+density+'x');
      assert.ok(Math.abs(resolution.transmissionTarget.width-resolution.canvasWidth)<=1);
      assert.ok(Math.abs(resolution.transmissionTarget.height-resolution.canvasHeight)<=1);
    }
    const geometryBounds=capture.diagnostics.graphGeometryBounds;assertFitted(geometryBounds,`${name}/${theme}/${density}x`);
    const xs=capture.view.landmarks.map(([x])=>x);
    assert.ok(xs.every((x,index)=>index===0||x>xs[index-1]),`Graph landmarks must advance left-to-right: ${xs.join(',')}`);
    assert.deepEqual(capture.pose.rotation,[0,0,0]);assert.equal(capture.pose.scale,.9);
    const png=Buffer.from(capture.png.split(',')[1],'base64');
    const expectedWidth=resolution.canvasWidth,expectedHeight=resolution.canvasHeight;
    const sourceMeta=await sharp(png).metadata();assert.equal(sourceMeta.format,'png');assert.equal(sourceMeta.width,expectedWidth);assert.equal(sourceMeta.height,expectedHeight);
    const basename=`powered-down-${name}-${theme==='dark'?'dark-':''}${density}x`,pngFile=`${basename}.png`;
    const detailPNG=Buffer.from(capture.detailPNG.split(',')[1],'base64'),detailFile='running-detail-'+basename+'.png';
    await writeFile(new URL(pngFile,evidence),png);await writeFile(new URL(detailFile,evidence),detailPNG);
    const webp=await sharp(png).webp({quality:98,effort:6,smartSubsample:false}).toBuffer();
    const avif=await sharp(png).avif({quality:90,effort:6,chromaSubsampling:'4:4:4'}).toBuffer();
    const webpMeta=await sharp(webp).metadata(),avifMeta=await sharp(avif).metadata();
    assert.equal(webpMeta.width,expectedWidth);assert.equal(webpMeta.height,expectedHeight);
    assert.equal(avifMeta.width,expectedWidth);assert.equal(avifMeta.height,expectedHeight);
    const background=theme==='dark'?'#050712':'#f4f9fd';
    const quality={webp:await comparePixels(png,webp,background),avif:await comparePixels(png,avif,background)};
    const file=`${basename}.webp`,avifFile=`${basename}.avif`;
    await writeFile(new URL(file,output),webp);await writeFile(new URL(avifFile,output),avif);
    const detailResolution=capture.detailDiagnostics.resolution;
    assets.push({name,theme,density,cssViewport:{width:view.width,height:view.height},requestedCaptureDPR:density,captureDPR:resolution.effectiveDPR,
      decodedPixels:{width:expectedWidth,height:expectedHeight},graphGeometryBounds:geometryBounds,capturePNG:{evidenceFile:`ux-screenshots/visual-v2/posters/${pngFile}`,sha256:hash(png)},
      visualEvidence:{poweredDownAndPosterShareExactSource:true,runningDetailFile:'ux-screenshots/visual-v2/posters/'+detailFile,runningDetailSha256:hash(detailPNG),runningDetailFrame:145,
        runningDetailResolution:detailResolution},file,bytes:webp.length,sha256:hash(webp),avifFile,avifBytes:avif.length,avifSha256:hash(avif),compressionComparison:quality,
      selectedFormat:quality.avif.meanAbsoluteChannelError<=2&&quality.avif.p99AbsoluteChannelError<=12?'avif':'webp',view:capture.view,pose:capture.pose,
      renderer:{version:'Three.js 0.186.1',requestQuality:'refraction',effectiveQuality:capture.diagnostics.quality.effective,
        materials:capture.diagnostics.glass.material,transmissionScale:capture.diagnostics.transmissionScale,
        visibleTransmissivePanels:capture.diagnostics.glass.visible,transmissionTarget:resolution.transmissionTarget,contextAttributes:capture.diagnostics.quality.contextAttributes,
        sampleSupport:capture.diagnostics.quality.sampleSupport,limits:capture.diagnostics.quality.limits,
        drawingBuffer:{width:resolution.drawingBufferWidth,height:resolution.drawingBufferHeight}},nodes:1668,displayRoutes:3601,power:0,orientation:'input-to-output'});
  } finally {await context.close();}
}

await mkdir(output,{recursive:true});await mkdir(evidence,{recursive:true});
const localSourceHashes=await readLocalHashes(sourceFiles);
const servedSourceHashes=await verifyServedSources(localSourceHashes);
const pipelineHashes=Object.fromEntries(await Promise.all(pipelineFiles.map(async file=>[file,hash(await readFile(new URL('../'+file,import.meta.url)))])));
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:new URL('..',import.meta.url),encoding:'utf8'}).trim();
const sourceTreeSha256=hash(Buffer.from(JSON.stringify({sourceHashes:localSourceHashes,pipelineHashes})));
const sourceStatus=execFileSync('git',['status','--porcelain','--untracked-files=all','--',...sourceFiles.map(file=>'site/assets/'+file),...pipelineFiles],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
const sourceWorkingTreeClean=sourceStatus.trim()==='';
const browser=await chromium.launch({headless:true});
try {
  for(const [name,view] of Object.entries(POSTER_VIEWS))for(const theme of ['light','dark'])for(const density of densities)
    await captureVariant(browser,name,view,theme,density);
  const allAvif=assets.every(asset=>asset.selectedFormat==='avif');
  const outputFiles=new Set(assets.flatMap(asset=>[asset.file,asset.avifFile]));
  const {readdir,unlink}=await import('node:fs/promises');
  for(const entry of await readdir(output))if(entry.startsWith('powered-down-')&&!outputFiles.has(entry))await unlink(new URL(entry,output));
  const manifest={schemaVersion:3,renderer:'Three.js 0.186.1',capture:{method:'WebGL2 canvas native drawing-buffer PNG; one browser context per density; no resize/upscale/transcode before source capture',browser:'Headless Chromium / local software-WebGL observation',sourceBase:base,sourceCommit,sourceTreeSha256,sourceWorkingTreeClean,densityVariants:[1,2,3],quality:'Explicit refraction; capture is independent of automatic driver policy',provenanceVerified:true,servedSourceHashes,pipelineHashes},
    encoders:{webp:{quality:98,effort:6,smartSubsample:false},avif:{quality:90,effort:6,chromaSubsampling:'4:4:4'},sharp:sharp.versions.sharp},
    cssFormatPolicy:allAvif?'AVIF passed direct RGB-channel native-pixel threshold for every variant; WebP retained as compatible alternate.':'At least one AVIF exceeded the direct RGB-channel native-pixel threshold; select WebP for all responsive variants.',
    nativePixelThreshold:{metric:'MAE and p99 are computed from direct absolute differences for every decoded 8-bit sRGB RGB channel after identical background compositing.',avifMeanAbsoluteChannelErrorAtMost:2,avifP99AbsoluteChannelErrorAtMost:12},sourceHashes:localSourceHashes,assets,
    description:'Actual Three.js renderer, complete source topology and fitted graph geometry including route controls, recurrence, contours and carrier envelopes. Lossless capture inputs are compared directly against independently encoded poster pixels. Not trained activation evidence.'};
  await writeFile(new URL('manifest.json',output),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({assetCount:assets.length,totalBytes:assets.reduce((sum,asset)=>sum+asset.bytes+asset.avifBytes,0),sourceCommit,provenanceVerified:true,cssFormatPolicy:manifest.cssFormatPolicy,
    assets:assets.map(({name,theme,density,decodedPixels,graphGeometryBounds,bytes,avifBytes,compressionComparison,selectedFormat})=>({name,theme,density,decodedPixels,geometry:graphGeometryBounds.all,bytes,avifBytes,compressionComparison,selectedFormat}))},null,2));
} finally {await browser.close();}
