import {ModelStartup} from './model-startup.js';

const root=document.querySelector('[data-model-startup]');
const startup=new ModelStartup(root);
root.modelStartup=startup;
window.PortfolioModelStartup=Object.freeze({snapshot:()=>startup.snapshot(),start:options=>startup.start(options)});

let machineModulePromise=null;
function loadMachine() {
  if(root.machineController)return Promise.resolve(root.machineController);
  if(machineModulePromise)return machineModulePromise;
  const loading=import('./model-machine.js').then(()=>root.machineController||null).catch(error=>{
    machineModulePromise=null;
    startup.fail('model-module-unavailable');
    throw error;
  });
  machineModulePromise=loading;
  return loading;
}

startup.onStart=async()=>{
  const controller=await loadMachine();
  return controller?.boot()??null;
};
startup.onQuietChange=quiet=>{
  if(quiet){
    loadMachine().then(controller=>controller?.fallback('quiet-mode',true)).catch(()=>{});
  }else if(startup.started){
    startup.start({retained:true});
  }
};

if(startup.quiet){loadMachine().then(controller=>controller?.fallback('quiet-mode',true)).catch(()=>{});}
else if(startup.started){startup.start({retained:true});}

// A deliberate Start completes ignition before the first illustrative replay.
// Retained starts restore the viewer with Play available, without restarting it.
let replayStarted = startup.started;
const readyObserver = new MutationObserver(() => {
  if (!replayStarted && startup.phase === 'ready' && !startup.quiet) {
    replayStarted = true;
    root.machine?.play();
  }
});
readyObserver.observe(root, {attributes:true, attributeFilter:['data-startup']});
addEventListener('pagehide', event => { if (!event.persisted) readyObserver.disconnect(); });
