import assert from 'node:assert/strict';
import {expect} from '@playwright/test';

export async function eligible(root) {
  await expect.poll(()=>root.evaluate(node=>node.machine.clock()),{timeout:5000}).toMatchObject({visible:true,hidden:false});
}
export async function advance(root,startFrame,play=false) {
  return root.evaluate((node,{startFrame,play})=>new Promise((resolve,reject)=>{
    const began=performance.now();
    const observer=new MutationObserver(()=>{
      const frame=node.machine.snapshot().frame;
      if(frame<=startFrame)return;
      observer.disconnect();clearTimeout(deadline);
      resolve({frame,elapsed:performance.now()-began,clock:node.machine.clock()});
    });
    const deadline=setTimeout(()=>{
      observer.disconnect();reject(new Error(`No replay frame change: ${JSON.stringify({frame:node.machine.snapshot().frame,clock:node.machine.clock(),render:node.dataset.render})}`));
    },5000);
    observer.observe(node,{attributes:true,attributeFilter:['data-replay-frame']});
    if(play)node.querySelector('[data-replay-play]').click();
    // Subscribe before checking: resume may already have advanced while scrolling.
    if(node.machine.snapshot().frame>startFrame) {
      observer.disconnect();clearTimeout(deadline);resolve({frame:node.machine.snapshot().frame,elapsed:0,clock:node.machine.clock()});
    }
  }),{startFrame,play});
}
export async function frozenAcrossFrames(root) {
  return root.evaluate(async node=>{
    const before=node.machine.snapshot().frame;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return {before,after:node.machine.snapshot().frame,clock:node.machine.clock()};
  });
}
export async function auditPlayback(page,root,name) {
  await root.locator('[data-machine-stage]').scrollIntoViewIfNeeded();await eligible(root);await root.evaluate(node=>node.machine.seek(70));
  const advanced=await advance(root,70,true);
  assert.ok(advanced.frame>70&&advanced.clock.ticks>0,`${name} real animation clock advances`);
  assert.ok(advanced.frame-70<=advanced.elapsed*.06+3,`${name} replay clock bound`);
  // A short article can expose its viewer even at scroll=0; a homepage can have
  // a sticky stage there. Move beyond the actual host in either context.
  await page.evaluate(()=>{const spacer=document.createElement('div');spacer.dataset.auditSpacer='';spacer.style.height='2000px';document.body.append(spacer);scrollTo(0,document.body.scrollHeight);});
  await expect.poll(()=>root.evaluate(node=>node.machine.clock()),{timeout:5000}).toMatchObject({visible:false,scheduled:false});
  const paused=await frozenAcrossFrames(root);assert.equal(paused.after,paused.before,`${name} offscreen freeze`);
  assert.equal(await root.evaluate(node=>node.machine.light().energy),0,`${name} offscreen light clears`);
  await root.locator('[data-machine-stage]').scrollIntoViewIfNeeded();await eligible(root);
  const resumed=await advance(root,paused.after);assert.ok(resumed.frame>paused.after,`${name} replay resumes`);
  await root.evaluate(node=>node.machine.pause());
  await page.locator('[data-audit-spacer]').evaluate(node=>node.remove());
  return {advanced,paused,resumed};
}
export async function auditDelayedClock(open) {
  const {context,page,root}=await open({viewport:{width:1366,height:900}},async page=>{
    await page.addInitScript(()=>{
      const native=requestAnimationFrame;window.auditHeldClock=[];window.auditHoldClock=true;
      window.requestAnimationFrame=callback=>native(time=>{
        if(window.auditHoldClock&&callback.toString().includes('this.tick'))window.auditHeldClock.push(callback);
        else callback(time);
      });
      window.auditReleaseClock=()=>{window.auditHoldClock=false;window.auditHeldClock.splice(0).forEach(callback=>native(callback));};
    });
  });
  await eligible(root);await root.evaluate(node=>node.machine.seek(70));
  const progressing=advance(root,70,true);
  await expect.poll(()=>page.evaluate(()=>auditHeldClock.length),{timeout:5000}).toBe(1);
  const held=await root.evaluate(node=>({frame:node.machine.snapshot().frame,clock:node.machine.clock()}));
  assert.equal(held.frame,70);assert.equal(held.clock.ticks,0);
  assert.equal(held.clock.visible,true);assert.equal(held.clock.hidden,false);assert.equal(held.clock.scheduled,true);
  await page.evaluate(()=>auditReleaseClock());const advanced=await progressing;
  assert.ok(advanced.frame>70&&advanced.clock.ticks>=2,'released native clock must advance');
  await root.evaluate(node=>node.machine.pause());await context.close();
  return {mode:'delayed-native-clock',held,advanced};
}
