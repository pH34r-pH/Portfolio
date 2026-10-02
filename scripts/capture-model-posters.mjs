import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
import {POSTER_VIEWS} from '../site/assets/model-view.js';

const sharp=createRequire(import.meta.url)('sharp');
const base=process.env.PORTFOLIO_AUDIT_URL||'http://127.0.0.1:4173';
const output=new URL('../site/assets/model-posters/',import.meta.url);
const evidence=new URL('../ux-screenshots/visual-v2/posters/',import.meta.url);
const densities=[1,2,3],assets=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

async function comparePixels(png,encoded,background) {
  const original=await sharp(png).flatten({background}).png().toBuffer();
  const decoded=await sharp(encoded).flatten({background}).png().toBuffer();
  const [originalMeta,decodedMeta]=await Promise.all([sharp(original).metadata(),sharp(decoded).metadata()]);
  assert.equal(decodedMeta.width,originalMeta.width);assert.equal(decodedMeta.height,originalMeta.height);
  const difference=await sharp(original).composite([{input:decoded,blend:'difference'}]).png().toBuffer();
  const [stats,grey]=await Promise.all([sharp(difference).stats(),sharp(difference).greyscale().raw().toBuffer()]);
  const histogram=new Uint32Array(256);
  for(const value of grey)histogram[value]++;
  const count=grey.length,limit=Math.ceil(count*.99);let total=0,p99=255;
  for(let value=0;value<histogram.length;value++){total+=histogram[value];if(total>=limit){p99=value;break;}}
  const rgb=stats.channels.slice(0,3),mean=rgb.reduce((sum,channel)=>sum+channel.mean,0)/3;
  return {meanAbsoluteError:+mean.toFixed(4),p99AbsoluteError:p99,maxAbsoluteError:Math.max(...rgb.map(channel=>channel.max)),
    percentileDefinition:'p99 of native-resolution per-pixel grayscale absolute difference after theme-background compositing'};
}

await mkdir(output,{recursive:true});await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
  for(const [name,view] of Object.entries(POSTER_VIEWS)) for(const theme of ['light','dark']) for(const density of densities) {
    const context=await browser.newContext({viewport:{width:view.width,height:view.height},deviceScaleFactor:density,colorScheme:theme});
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
    for(const meta of [webpMeta,avifMeta]){assert.equal(meta.width,expectedWidth);assert.equal(meta.height,expectedHeight);}
    const background=theme==='dark'?'#050712':'#f4f9fd';
    const quality={webp:await comparePixels(png,webp,background),avif:await comparePixels(png,avif,background)};
    const file=`${basename}.webp`,avifFile=`${basename}.avif`;
    await writeFile(new URL(file,output),webp);await writeFile(new URL(avifFile,output),avif);
    assets.push({name,theme,density,cssViewport:{width:view.width,height:view.height},requestedCaptureDPR:density,captureDPR:resolution.effectiveDPR,
      decodedPixels:{width:expectedWidth,height:expectedHeight},capturePNG:{evidenceFile:`ux-screenshots/visual-v2/posters/${pngFile}`,sha256:hash(png)},
      visualEvidence:{poweredDownAndPosterShareExactSource:true,runningDetailFile:'ux-screenshots/visual-v2/posters/'+detailFile,runningDetailSha256:hash(detailPNG),runningDetailFrame:145,
        runningDetailResolution:capture.detailDiagnostics.resolution},
      file,bytes:webp.length,sha256:hash(webp),avifFile,avifBytes:avif.length,avifSha256:hash(avif),compressionComparison:quality,
      selectedFormat:quality.avif.meanAbsoluteError<=2&&quality.avif.p99AbsoluteError<=12?'avif':'webp',view:capture.view,pose:capture.pose,
      renderer:{version:'Three.js 0.186.1',requestQuality:'refraction',effectiveQuality:capture.diagnostics.quality.effective,
        materials:capture.diagnostics.glass.material,transmissionScale:capture.diagnostics.transmissionScale,
        visibleTransmissivePanels:capture.diagnostics.glass.visible,transmissionTarget:resolution.transmissionTarget,contextAttributes:capture.diagnostics.quality.contextAttributes,
        sampleSupport:capture.diagnostics.quality.sampleSupport,limits:capture.diagnostics.quality.limits,
        drawingBuffer:{width:resolution.drawingBufferWidth,height:resolution.drawingBufferHeight}},nodes:1668,displayRoutes:3601,power:0,orientation:'input-to-output'});
    await context.close();
  }
  const allAvif=assets.every(asset=>asset.selectedFormat==='avif');
  const sourceFiles=['model-view.js','model-power.js','model-scene.js','model-quality.js','model-topology.js','model-digital.js','model-glass.js','model-hardware.js','model-architecture.json','vendor/three@0.186.1/three.module.js','vendor/three@0.186.1/three.core.js'];
  const sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,hash(await readFile(new URL('../site/assets/'+file,import.meta.url)))])));
  const outputFiles=new Set(assets.flatMap(asset=>[asset.file,asset.avifFile]));
  const {readdir,unlink}=await import('node:fs/promises');
  for(const entry of await readdir(output))if(entry.startsWith('powered-down-')&&!outputFiles.has(entry))await unlink(new URL(entry,output));
  const manifest={schemaVersion:2,renderer:'Three.js 0.186.1',capture:{method:'WebGL2 canvas native drawing-buffer PNG; one browser context per density; no resize/upscale/transcode before source capture',browser:'Headless Chromium / local software-WebGL observation',densityVariants:[1,2,3],quality:'Explicit refraction; capture is independent of automatic driver policy'},
    encoders:{webp:{quality:98,effort:6,smartSubsample:false},avif:{quality:90,effort:6,chromaSubsampling:'4:4:4'},sharp:sharp.versions.sharp},
    cssFormatPolicy:allAvif?'AVIF passed native-pixel threshold for every variant; WebP retained as compatible alternate.':'At least one AVIF exceeded the native-pixel threshold; select WebP for all responsive variants.',
    nativePixelThreshold:{avifMeanAbsoluteErrorAtMost:2,avifP99AbsoluteErrorAtMost:12},sourceHashes,assets,
    description:'Actual Three.js renderer, complete source topology, horizontal powered-down state and independently encoded native pixels. Not trained activation evidence.'};
  await writeFile(new URL('manifest.json',output),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({assetCount:assets.length,totalBytes:assets.reduce((sum,asset)=>sum+asset.bytes+asset.avifBytes,0),cssFormatPolicy:manifest.cssFormatPolicy,
    assets:assets.map(({name,theme,density,decodedPixels,bytes,avifBytes,compressionComparison,selectedFormat})=>({name,theme,density,decodedPixels,bytes,avifBytes,compressionComparison,selectedFormat}))},null,2));
} finally {await browser.close();}
