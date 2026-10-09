// Capture the production Three.js component with recorded real LM observations.
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import sharp from 'sharp';
import {GRAPH,TOPOLOGY,createInferenceRun} from '../site/assets/model-topology.js';
import {decodeWeights,forwardBytes,sampleByte,seededRandom} from '../site/assets/model-inference.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),site=join(root,'site'),assets=join(site,'assets');
const work=join(tmpdir(),'portfolio-homepage-recording'),width=1920,height=1920,fps=30,duration=8.4,loopStart=1.8;
const prompt='the model learned a useful distinction';
const manifest=JSON.parse(await readFile(join(assets,'lm/manifest.json'),'utf8'));
const weights=await readFile(join(assets,'lm/unit-hypersphere.f32'));
if(createHash('sha256').update(weights).digest('hex')!==manifest.sha256)throw new Error('Trained tensor checksum mismatch');
const model=decodeWeights(manifest,weights.buffer.slice(weights.byteOffset,weights.byteOffset+weights.byteLength));
const run=createInferenceRun(prompt),bytes=Array.from(new TextEncoder().encode(prompt)),emitted=[],random=seededRandom(17);
for(let token=0;token<12;token++) {
  const inference=forwardBytes(bytes,model),byte=sampleByte(inference.logits,.8,random),previous=emitted.map(x=>x.toString(16).padStart(2,'0'));
  emitted.push(byte);bytes.push(byte);
  run.observations.push(...inference.observations.map(item=>({...item,token,emitted:item.layer===7?emitted.map(x=>x.toString(16).padStart(2,'0')):previous})));
}
const html=`<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/site.css"><style>
html,body{margin:0;padding:0;width:100%;height:100%;background:#00070d;--bg:#00070d;--ink:#f4fbff;--accent:#31a8ff}
.article-model-machine,.machine-spatial-host{position:absolute!important;inset:0;display:block!important;margin:0!important}
.model-machine .machine-stage{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-height:0!important;margin:0!important;border:0!important;background:transparent!important}
.model-machine .machine-canvas{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important}
.machine-stage>:not(canvas),.machine-instruments,.machine-heading,.machine-replay,.machine-disclosure,.machine-help,.machine-instrument-nav,.machine-depth-view{display:none!important}
</style></head><body><section class="model-machine article-model-machine" data-model-machine data-model-focus="all" data-background-recording aria-labelledby="recording-heading">
<header class="machine-heading"><h2 id="recording-heading">Recorded research LM</h2><p>Real activation recording</p></header><div class="machine-stage" data-machine-stage><canvas data-machine-canvas class="machine-canvas"></canvas><div data-machine-fallback class="machine-fallback"></div>
<form data-machine-form><input name="prompt" value="the model learned a useful distinction"><button type="submit">Generate</button><div data-machine-token-readout></div></form><div class="machine-output"><span class="machine-console-label">Generated continuation</span><p data-machine-output></p></div><p data-machine-status></p></div></section><script type="module" src="/assets/model-machine.js"></script></body></html>`;
const mime={'.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try {
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/__recording__/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);return;}
    const file=resolve(site,'.'+decodeURIComponent(path));
    if(!file.startsWith(site+sep)){res.writeHead(403);res.end();return;}
    const content=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(content);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  await rm(work,{recursive:true,force:true});await mkdir(work,{recursive:true});
  browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/__recording__/`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('[data-model-machine]').dataset.render==='webgl',null,{timeout:30000});
  await page.evaluate(recording=>{
    const root=document.querySelector('[data-model-machine]'),controller=root.machineController;
    controller.pause();controller.runData=recording;controller.scene.setFocus('all');controller.scene.contextCenter=0;
    controller.scene.yaw=-.4;controller.scene.pitch=.1;controller.scene.updateCamera();controller.draw();
  },run);
  const frames=Math.round(duration*fps);
  for(let index=0;index<frames;index++) {
    const time=index/fps,phase=Math.max(0,(time-loopStart)/(duration-loopStart));
    await page.evaluate(({frame,opacity})=>{
      const root=document.querySelector('[data-model-machine]'),controller=root.machineController;
      controller.frame=frame;controller.stage.style.opacity=opacity;controller.draw();
    },{frame:Math.min(run.observations.length-1,Math.floor(phase*run.observations.length)),opacity:Math.min(1,.22+time/loopStart*.78)});
    await page.screenshot({path:join(work,`${String(index).padStart(4,'0')}.png`)});
    if(index%60===0)console.log(`Recorded ${index}/${frames} native Three.js frames`);
  }
  if(errors.length)throw new Error(errors.join('; '));
  const output=join(assets,'homepage-model-loop.webm');
  const encoded=spawnSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-framerate',String(fps),'-i',join(work,'%04d.png'),'-an','-c:v','libvpx-vp9','-pix_fmt','yuv420p','-b:v','0','-crf','20','-deadline','good','-cpu-used','4','-row-mt','1',output],{encoding:'utf8'});
  if(encoded.error||encoded.status!==0)throw new Error(`ffmpeg failed: ${encoded.error?.message||encoded.stderr}`);
  const poster=join(assets,'homepage-model-loop-poster.webp');
  await sharp(join(work,`${String(Math.round(loopStart*fps)).padStart(4,'0')}.png`)).webp({quality:95,effort:6}).toFile(poster);
  const video=await readFile(output),posterBytes=await readFile(poster);
  if(video.length>8_000_000)throw new Error(`Recording is ${video.length} bytes; retain quality while fitting the 10 MB page budget`);
  await writeFile(join(assets,'homepage-model-loop.json'),JSON.stringify({schemaVersion:2,topology:TOPOLOGY.id,nodes:GRAPH.nodes.length,displayRoutes:GRAPH.edges.length,
    width,height,fps,durationSeconds:duration,loopStartSeconds:loopStart,prompt,result:new TextDecoder().decode(new Uint8Array(emitted)),generatedBytes:emitted,
    renderer:'Production Three.js scene / native pixels / refraction / MSAA',codec:'VP9/WebM',trainedStateSha256:manifest.trainedStateSha256,weightsSha256:manifest.sha256,
    observations:run.observations.length,replay:'Retimed recorded forward-pass tensors; per-layer brightness normalization; signed coordinates',
    bytes:video.length,sha256:createHash('sha256').update(video).digest('hex'),posterBytes:posterBytes.length,posterSha256:createHash('sha256').update(posterBytes).digest('hex')},null,2)+'\n');
  console.log(`Recorded production scene: ${video.length} bytes, ${width}×${height} @ ${fps} fps`);
} finally {
  await browser?.close();await new Promise(resolve=>server.close(resolve));await rm(work,{recursive:true,force:true});
}
