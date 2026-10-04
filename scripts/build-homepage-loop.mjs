import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {GRAPH,TOPOLOGY} from '../site/assets/model-topology.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const assets=join(root,'site','assets');
const work=join(tmpdir(),'portfolio-homepage-loop');
const width=576,height=576,fps=10,duration=8.4,loopStart=1.8;
const frames=Math.round(duration*fps);
const output=join(assets,'homepage-model-loop.webm');
const poster=join(assets,'homepage-model-loop-poster.webp');
const manifest=join(assets,'homepage-model-loop.json');
const prompt='the model learned a useful distinction';
const result='useful distinction';

const clamp=(value,low=0,high=1)=>Math.max(low,Math.min(high,value));
const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
function project([x,y,z],yaw) {
  const cy=Math.cos(yaw),sy=Math.sin(yaw),pitch=.1,cp=Math.cos(pitch),sp=Math.sin(pitch);
  const rx=x*cy+z*sy,rz=-x*sy+z*cy,ry=y*cp-rz*sp,depth=y*sp+rz*cp;
  const perspective=12.5/(12.5+depth),scale=48*perspective;
  return [width*.5+rx*scale,height*.5-ry*scale];
}
function layerEnergy(time,layer) {
  if(time<loopStart)return clamp((time-.1-layer*.12)/.42);
  const phase=(time-loopStart)/(duration-loopStart);
  const center=.25+.43*(layer/7);
  return Math.exp(-Math.pow((phase-center)/.09,2));
}
function edgePath(yaw,layer) {
  return GRAPH.edges.filter(edge=>edge.layer===layer).map(edge=>{
    const a=project(edge.sourcePosition,yaw),b=project(edge.targetPosition,yaw);
    return `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  }).join('');
}
function nodePath(yaw,layer) {
  const radius=layer===2?1.65:1.05;
  return GRAPH.layers[layer].map(index=>{
    const [x,y]=project(GRAPH.nodes[index].position,yaw);
    return `M${(x-radius).toFixed(1)} ${(y-radius).toFixed(1)}h${(radius*2).toFixed(1)}v${(radius*2).toFixed(1)}h-${(radius*2).toFixed(1)}z`;
  }).join('');
}
function svgFrame(frame) {
  const time=frame/fps,phase=time<loopStart?0:(time-loopStart)/(duration-loopStart);
  const yaw=time<loopStart?-.18:-.18+.16*Math.sin(phase*Math.PI*2);
  const layers=Array.from({length:8},(_,layer)=>{
    const energy=layerEnergy(time,layer),edgeOpacity=(.12+.48*energy).toFixed(3),nodeOpacity=(.34+.62*energy).toFixed(3);
    const edgeColor=layer===6?'#9b78cf':'#31a8ff';
    return `<path d="${edgePath(yaw,layer)}" fill="none" stroke="${edgeColor}" stroke-width="${energy>.55?1.35:.72}" stroke-opacity="${edgeOpacity}"/><path d="${nodePath(yaw,layer)}" fill="#69c6ff" fill-opacity="${nodeOpacity}"/>`;
  }).join('');
  let telemetry='';
  if(time>=loopStart) {
    const entered=clamp((phase-.03)/.18),promptText=prompt.slice(0,Math.round(prompt.length*entered));
    if(phase<.72&&promptText)telemetry+=`<g opacity=".82"><rect x="28" y="30" width="315" height="34" rx="4" fill="#000" fill-opacity=".62" stroke="#31a8ff" stroke-opacity=".52"/><text x="40" y="51" fill="#d2eeff" font-family="monospace" font-size="11">&gt; ${esc(promptText)}</text></g>`;
    if(phase>.68) {
      const emitted=result.slice(0,Math.round(result.length*clamp((phase-.68)/.18)));
      telemetry+=`<g opacity=".86"><rect x="319" y="510" width="229" height="34" rx="4" fill="#000" fill-opacity=".62" stroke="#31a8ff" stroke-opacity=".52"/><text x="332" y="531" fill="#d2eeff" font-family="monospace" font-size="11">${esc(emitted)}</text></g>`;
    }
  }
  const ignition=time<loopStart?clamp(time/loopStart):1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#000"/><g opacity="${(.22+.78*ignition).toFixed(3)}">${layers}</g>${telemetry}</svg>`;
}
async function renderFrame(index) {
  const svg=Buffer.from(svgFrame(index));
  await sharp(svg,{density:96}).png({compressionLevel:9,palette:true}).toFile(join(work,`${String(index).padStart(4,'0')}.png`));
}
async function main() {
  await rm(work,{recursive:true,force:true});await mkdir(work,{recursive:true});await mkdir(assets,{recursive:true});
  for(let start=0;start<frames;start+=6)await Promise.all(Array.from({length:Math.min(6,frames-start)},(_,offset)=>renderFrame(start+offset)));
  const encoded=spawnSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-framerate',String(fps),'-i',join(work,'%04d.png'),'-an','-c:v','libvpx-vp9','-pix_fmt','yuv420p','-b:v','0','-crf','54','-deadline','good','-cpu-used','4','-row-mt','1',output],{encoding:'utf8'});
  if(encoded.error)throw new Error(`ffmpeg unavailable: ${encoded.error.message}`);
  if(encoded.status!==0)throw new Error(`ffmpeg failed: ${encoded.stderr.trim()}`);
  await sharp(Buffer.from(svgFrame(Math.round(loopStart*fps))),{density:96}).webp({quality:72,effort:6}).toFile(poster);
  const bytes=await readFile(output),posterBytes=await readFile(poster);
  if(bytes.length>300000)throw new Error(`Homepage loop is ${bytes.length} bytes; keep the pre-rendered background under 300000 bytes`);
  await writeFile(manifest,JSON.stringify({
    schemaVersion:1,topology:TOPOLOGY.id,nodes:GRAPH.nodes.length,displayRoutes:GRAPH.edges.length,
    width,height,fps,durationSeconds:duration,loopStartSeconds:loopStart,prompt,result,codec:'VP9/WebM',
    bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),
    posterBytes:posterBytes.length,posterSha256:createHash('sha256').update(posterBytes).digest('hex')
  },null,2)+'\n');
  await rm(work,{recursive:true,force:true});
  console.log(`Rendered homepage model loop: ${bytes.length} bytes, ${frames} frames, ${GRAPH.nodes.length} nodes / ${GRAPH.edges.length} display routes`);
}
await main();
