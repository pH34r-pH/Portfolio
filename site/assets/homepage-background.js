const journey=document.querySelector('[data-digital-home]');
const video=journey?.querySelector('[data-homepage-model-loop]');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const forced=matchMedia('(forced-colors: active)');
const audit=new URLSearchParams(location.search).get('model-audit')==='1';
const loopStart=Number(video?.dataset.loopStart||1.8);
const loopEnd=Number(video?.dataset.loopEnd||8.4);

if(journey)journey.toggleAttribute('data-model-audit',audit);

function quiet() {return audit||reduced.matches||forced.matches;}
function syncMotion() {
  if(!journey||!video)return;
  if(quiet()||document.hidden) {
    video.pause();
    journey.dataset.backgroundMotion=quiet()?'static':'paused';
    return;
  }
  journey.dataset.backgroundMotion='playing';
  video.play().catch(()=>{journey.dataset.backgroundMotion='fallback';});
}
function restartLoop() {
  if(!video||quiet())return;
  if(video.currentTime>=loopEnd-.08||video.ended) {
    video.currentTime=loopStart;
    video.play().catch(()=>{journey.dataset.backgroundMotion='fallback';});
  }
}
video?.addEventListener('loadedmetadata',syncMotion);
video?.addEventListener('timeupdate',restartLoop);
video?.addEventListener('ended',restartLoop);
video?.addEventListener('error',()=>{if(journey)journey.dataset.backgroundMotion='fallback';});
document.addEventListener('visibilitychange',syncMotion);
reduced.addEventListener('change',syncMotion);
forced.addEventListener('change',syncMotion);
addEventListener('pageshow',syncMotion);
syncMotion();

window.PortfolioHomepageBackground=Object.freeze({
  snapshot:()=>({
    audit,quiet:quiet(),motion:journey?.dataset.backgroundMotion||'unavailable',
    currentTime:video?.currentTime??null,paused:video?.paused??true,
    loopStart,loopEnd
  })
});
