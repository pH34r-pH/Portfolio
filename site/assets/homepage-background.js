import { FALLBACK_PLAYBACK_RATE } from './homepage-motion.js';
const journey=document.querySelector('[data-digital-home]');
const video=journey?.querySelector('[data-homepage-model-loop]');
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),forced=matchMedia('(forced-colors: active)');
const audit=new URLSearchParams(location.search).get('model-audit')==='1';
const loopStart=Number(video?.dataset.loopStart||1.8),loopEnd=Number(video?.dataset.loopEnd||8.4);
const toggle=journey?.querySelector('[data-background-toggle]');
let native,nativePromise,videoFallback=false,visible=true,paused=false;
try{paused=sessionStorage.getItem('portfolio.background-paused')==='true';}catch{}
if(journey)journey.toggleAttribute('data-model-audit',audit);
const quiet=()=>audit||reduced.matches||forced.matches;

function useVideo(reason) {
  videoFallback=true;native?.dispose();native=null;
  journey.dataset.backgroundBackend='video';journey.dataset.backgroundFallback=reason;
  const source=video.querySelector('source');
  video.defaultPlaybackRate=video.playbackRate=FALLBACK_PLAYBACK_RATE;
  if(!source.src){source.src=source.dataset.src;video.load();}
  syncMotion();
}

function prepareNative() {
  if(nativePromise||native||videoFallback)return;
  journey.dataset.backgroundBackend='loading';
  nativePromise=import('./homepage-native-model.js').then(module=>module.createNativeBackground(journey,useVideo)).then(playback=>{
    if(videoFallback){playback.dispose();return;}
    native=playback;journey.dataset.backgroundBackend='native';syncMotion();
  }).catch(error=>useVideo(error.message));
}

function syncMotion() {
  if(!journey||!video)return;
  if(toggle){toggle.hidden=quiet();toggle.textContent=paused?'Play background':'Pause background';toggle.setAttribute('aria-pressed',String(paused));}
  const active=!quiet()&&!paused&&!document.hidden&&visible;
  journey.dataset.backgroundMotion=quiet()?'static':active?'playing':'paused';
  native?.sync(active);video.pause();
  if(!active)return;
  if(videoFallback)video.play().catch(()=>{journey.dataset.backgroundMotion='fallback';});
  else prepareNative();
}

function restartLoop() {
  if(!videoFallback||quiet()||paused||document.hidden)return;
  if(video.currentTime>=loopEnd-.08||video.ended){video.currentTime=loopStart;syncMotion();}
}
video?.addEventListener('loadedmetadata',syncMotion);
video?.addEventListener('timeupdate',restartLoop);video?.addEventListener('ended',restartLoop);
video?.addEventListener('error',()=>{if(videoFallback)journey.dataset.backgroundMotion='fallback';});
document.addEventListener('visibilitychange',syncMotion);
for(const query of [reduced,forced])query.addEventListener('change',syncMotion);
addEventListener('pageshow',syncMotion);
addEventListener('pagehide',event=>{native?.sync(false);if(!event.persisted)native?.dispose();});
toggle?.addEventListener('click',()=>{paused=!paused;try{sessionStorage.setItem('portfolio.background-paused',String(paused));}catch{}syncMotion();});
const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;syncMotion();});
if(journey)observer.observe(journey.querySelector('.digital-model-background'));
syncMotion();

function playbackSnapshot() {
  if(native)return {currentTime:native.elapsed,paused:!native.active,playbackRate:native.playbackRate,rendering:native.snapshot()};
  return {currentTime:video?.currentTime??null,paused:video?.paused??true,playbackRate:video?.playbackRate??null,rendering:null};
}
function backgroundSnapshot() {
  return {audit,quiet:quiet(),motion:journey?.dataset.backgroundMotion||'unavailable',
    backend:journey?.dataset.backgroundBackend||'static',loopStart,loopEnd,...playbackSnapshot()};
}
window.PortfolioHomepageBackground=Object.freeze({snapshot:backgroundSnapshot});
