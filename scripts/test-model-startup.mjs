import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {ignitionLevel} from '../site/assets/model-power.js';

const sharp=createRequire(import.meta.url)('sharp');
for(let layer=0;layer<8;layer++) {
  assert.equal(ignitionLevel(layer,0),0);assert.equal(ignitionLevel(layer,1),1);
  let previous=0;
  for(let frame=0;frame<=60;frame++) {
    const level=ignitionLevel(layer,frame/60);assert.ok(level>=previous&&level<=1);previous=level;
    if(layer)assert.ok(level<=ignitionLevel(layer-1,frame/60),'Input-to-output wave order');
  }
}
const base=new URL('../site/assets/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('model-posters/manifest.json',base)));
assert.equal(manifest.schemaVersion,2);assert.deepEqual(manifest.capture.densityVariants,[1,2,3]);
assert.equal(manifest.assets.length,12,'two orientations, two themes and three native pixel densities');
for(const [file,expected] of Object.entries(manifest.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(new URL(file,base))).digest('hex'),expected,`Recapture stale poster source ${file}`);
const observed=new Set();
for(const asset of manifest.assets) {
  const key=`${asset.name}:${asset.theme}:${asset.density}`;assert.ok(!observed.has(key),`Duplicate capture ${key}`);observed.add(key);
  assert.equal(asset.nodes,1668);assert.equal(asset.displayRoutes,3601);assert.equal(asset.power,0);assert.equal(asset.orientation,'input-to-output');
  assert.deepEqual(asset.pose.rotation,[0,0,0]);assert.equal(asset.renderer.requestQuality,'refraction');assert.equal(asset.renderer.effectiveQuality,'refraction');
  assert.equal(asset.renderer.contextAttributes.antialias,true);assert.ok(asset.renderer.sampleSupport.defaultFramebufferSamples>0);
  assert.equal(asset.renderer.transmissionScale,1);
  if(asset.renderer.visibleTransmissivePanels>0) {
    assert.ok(asset.renderer.transmissionTarget?.samples>0);
    assert.ok(Math.abs(asset.renderer.transmissionTarget.width-asset.decodedPixels.width)<=1);
    assert.ok(Math.abs(asset.renderer.transmissionTarget.height-asset.decodedPixels.height)<=1);
  }
  const {width,height}=asset.decodedPixels;assert.equal(width,asset.cssViewport.width*asset.density);assert.equal(height,asset.cssViewport.height*asset.density);
  assert.equal(asset.renderer.drawingBuffer.width,width);assert.equal(asset.renderer.drawingBuffer.height,height);
  assert.equal(asset.visualEvidence.runningDetailResolution.drawingBufferWidth,width);
  assert.equal(asset.visualEvidence.runningDetailResolution.drawingBufferHeight,height);
  const xs=asset.view.landmarks.map(([x])=>x);assert.ok(xs.every((x,index)=>index===0||x>xs[index-1]),`Poster landmarks must advance left-to-right (${key})`);
  for(const [file,hash,format] of [[asset.file,asset.sha256,'webp'],[asset.avifFile,asset.avifSha256,'heif']]) {
    const bytes=readFileSync(new URL('model-posters/'+file,base));assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,`Poster output changed: ${file}`);
    const decoded=await sharp(bytes).metadata();assert.equal(decoded.format,format);assert.equal(decoded.width,width);assert.equal(decoded.height,height);
  }
  const comparison=asset.compressionComparison.avif;
  assert.ok(Number.isFinite(comparison.meanAbsoluteError)&&Number.isInteger(comparison.p99AbsoluteError));
  assert.equal(asset.selectedFormat,comparison.meanAbsoluteError<=2&&comparison.p99AbsoluteError<=12?'avif':'webp');
  assert.equal(asset.visualEvidence.poweredDownAndPosterShareExactSource,true);assert.equal(asset.visualEvidence.runningDetailFrame,145);
}
console.log('Ordered startup state and native-pixel poster manifest, dimensions, decoded formats, hashes, MSAA/target evidence and horizontal landmarks passed.');
