const quiet=()=>matchMedia('(prefers-reduced-motion:reduce)').matches||matchMedia('(forced-colors:active)').matches;

export class ModelStartup {
  constructor(root) {
    this.root=root;this.status=root.querySelector('[data-model-boot]');this.phase='booting';
    this.raf=0;this.elapsed=0;this.handoffs=0;this.completions=0;this.started=performance.now();
    this.deadline=setTimeout(()=>this.fail('startup-timeout'),15000);
    this.abort=new AbortController();const options={signal:this.abort.signal,passive:true};
    for(const type of ['scroll','resize','pageshow']){addEventListener(type,()=>this.schedule(),options);}
    document.addEventListener('visibilitychange',()=>{this.lastTime=null;if(document.hidden){cancelAnimationFrame(this.raf);this.raf=0;}this.schedule();},options);
    this.setPhase(quiet()?'quiet':'booting',quiet()?'Static architecture display':'booting… / architecture display');
    if(quiet()){clearTimeout(this.deadline);}
  }
  setPhase(phase,text) {
    this.phase=phase;this.root.dataset.startup=phase;
    if(this.status.textContent!==text){this.status.textContent=text;}
  }
  fail(reason) {
    this.stop();this.setPhase('fallback','Static architecture available');
    this.failure=reason;if(this.onFailure){this.onFailure(reason);}else {this.root.dataset.render='fallback';}
  }
  stop() {clearTimeout(this.deadline);cancelAnimationFrame(this.raf);this.raf=0;this.lastTime=null;}
  canPrepare() {return !['fallback','quiet'].includes(this.phase);}
  resume() {
    this.failure=null;this.setPhase(this.handoffs?'ready':'booting','booting… / architecture display');
    this.deadline=setTimeout(()=>this.fail('startup-timeout'),15000);
  }
  async accept(scene) {
    this.scene=scene;
    if(this.phase==='ready') {await scene.prepare();scene.finishPower();this.stop();this.setPhase('ready','Interactive architecture ready');return true;}
    if(!this.canPrepare()){return false;}
    await scene.prepare();
    if(!this.canPrepare()||scene.disposed){return false;}
    scene.resize();scene.setPower(0,true);this.firstFrame=scene.powerView();
    clearTimeout(this.deadline);this.preparedAt=performance.now();
    this.setPhase('prepared','Architecture display ready');this.schedule();return true;
  }
  schedule() {
    if(this.raf||document.hidden||!['prepared','handoff','igniting'].includes(this.phase)){return;}
    const bounds=this.scene?.canvas.getBoundingClientRect();
    if(!bounds||(this.phase!=='prepared'&&(bounds.bottom<=0||bounds.top>=innerHeight))){this.lastTime=null;return;}
    this.raf=requestAnimationFrame(time=>this.advanceStartup(time));
  }
  advanceStartup(time) {
    this.raf=0;if(document.hidden){this.lastTime=null;return;}
    const bounds=this.scene.canvas.getBoundingClientRect();
    if(this.phase!=='prepared'&&(bounds.bottom<=0||bounds.top>=innerHeight)){this.lastTime=null;return;}
    if(this.phase==='prepared') {
      this.scene.resize();this.scene.setPower(0,true);this.firstFrame=this.scene.powerView();
      this.handoffs++;this.setPhase('handoff','Architecture display ready');this.onHandoff?.();
    } else if(this.phase==='handoff') {
      this.setPhase('igniting','Starting architecture display');this.lastTime=time;
    } else {
      this.elapsed+=Math.max(0,time-(this.lastTime??time));this.lastTime=time;
      this.scene.setPower(Math.min(1,this.elapsed/900));
      if(this.elapsed>=900) {this.scene.finishPower();this.completions++;this.setPhase('ready','Interactive architecture ready');this.stop();return;}
    }
    this.schedule();
  }
  snapshot() {return {phase:this.phase,handoffs:this.handoffs,completions:this.completions,elapsed:this.elapsed,scheduled:Boolean(this.raf),failure:this.failure,firstFrame:this.firstFrame,loadMs:this.preparedAt?this.preparedAt-this.started:null,theatrical:true};}
}
