import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ignitionLevel} from '../site/assets/model-power.js';

for(let layer=0;layer<8;layer++) {
  assert.equal(ignitionLevel(layer,0),0);assert.equal(ignitionLevel(layer,1),1);
  let previous=0;
  for(let frame=0;frame<=60;frame++) {
    const level=ignitionLevel(layer,frame/60);assert.ok(level>=previous&&level<=1);previous=level;
    if(layer)assert.ok(level<=ignitionLevel(layer-1,frame/60),'Input-to-output wave order');
  }
}
const base=new URL('../site/assets/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('model-posters/manifest.json',base)));
for(const [file,hash] of Object.entries(manifest.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(new URL(file,base))).digest('hex'),hash,`Recapture stale poster source ${file}`);
for(const asset of manifest.assets) {
  assert.equal(asset.nodes,1668);assert.equal(asset.displayRoutes,3601);assert.equal(asset.power,0);
  for(const [file,hash] of [[asset.file,asset.sha256],[asset.avifFile,asset.avifSha256]])assert.equal(createHash('sha256').update(readFileSync(new URL('model-posters/'+file,base))).digest('hex'),hash);
}
console.log('Deterministic ordered ignition and renderer-bound static assets passed.');
