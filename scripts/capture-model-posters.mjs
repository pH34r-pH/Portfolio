import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
import {POSTER_VIEWS} from '../site/assets/model-view.js';
const sharp=createRequire(import.meta.url)('sharp');

const base=process.env.PORTFOLIO_AUDIT_URL||'http://127.0.0.1:4173';
const output=new URL('../site/assets/model-posters/',import.meta.url);
await mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true}),assets=[];
try {
  for(const [name,view] of Object.entries(POSTER_VIEWS)) for(const theme of ['light','dark']) {
    const context=await browser.newContext({viewport:{width:view.width,height:view.height},deviceScaleFactor:1});
    const page=await context.newPage();
    await page.route(base+'/__capture__/',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><title>Renderer capture</title></head><body style="margin:0"><div data-digital-home data-model-startup><canvas style="display:block;width:${view.width}px;height:${view.height}px"></canvas></div></body></html>`}));
    await page.goto(base+'/__capture__/');
    const capture=await page.evaluate(async()=>{
      const T=await import('/assets/vendor/three@0.186.1/three.module.js');
      const {MachineScene}=await import('/assets/model-scene.js');
      const root=document.querySelector('[data-digital-home]'),canvas=root.querySelector('canvas');canvas.dataset.machineCanvas='';
      const instruments={root,host:root,layer:root,quality(){},setMode(){},dimensions(){return [];}};
      const scene=new MachineScene(T,root,()=>{},reason=>{throw Error(reason);},()=>{},instruments);
      await scene.prepare();scene.setPower(0,true);
      return {data:canvas.toDataURL('image/webp',.88),view:scene.powerView(),diagnostics:scene.diagnostics()};
    });
    assert.equal(capture.diagnostics.nodes,1668);assert.equal(capture.diagnostics.edges,3601);
    const bytes=Buffer.from(capture.data.split(',')[1],'base64'),file=`powered-down-${name}-${theme}.webp`;
    const avifFile=file.replace('.webp','.avif'),avif=await sharp(bytes).avif({quality:65,effort:6,chromaSubsampling:'4:4:4'}).toBuffer();
    await writeFile(new URL(file,output),bytes);await writeFile(new URL(avifFile,output),avif);
    assets.push({name,theme,file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),avifFile,avifBytes:avif.length,avifSha256:createHash('sha256').update(avif).digest('hex'),view:capture.view,nodes:1668,displayRoutes:3601,power:0});
    await context.close();
  }
  const files=['model-view.js','model-power.js','model-scene.js','model-topology.js','model-digital.js','model-architecture.json','vendor/three@0.186.1/three.module.js','vendor/three@0.186.1/three.core.js'];
  const sourceHashes=Object.fromEntries(await Promise.all(files.map(async name=>[name,createHash('sha256').update(await readFile(new URL('../site/assets/'+name,import.meta.url))).digest('hex')])));
  await writeFile(new URL('manifest.json',output),JSON.stringify({schemaVersion:1,renderer:'Three.js 0.186.1',encoder:{sharp:sharp.versions.sharp,avifQuality:65},sourceHashes,assets,description:'Actual renderer, full source topology, powered-down display state. Not trained activation evidence.'},null,2)+'\n');
  console.log(assets.map(({name,theme,bytes,avifBytes})=>({name,theme,bytes,avifBytes})));
}finally{await browser.close();}
