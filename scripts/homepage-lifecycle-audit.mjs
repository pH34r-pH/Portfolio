import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {eligible,advance,frozenAcrossFrames,auditDelayedClock} from './model-playback-audit.mjs';

async function visibilitySignal(open) {
  const {context,page,root}=await open({viewport:{width:1366,height:900}});
  await eligible(root);await root.evaluate(node=>node.machine.seek(70));await advance(root,70,true);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  const hidden=await frozenAcrossFrames(root);
  assert.equal(hidden.after,hidden.before);assert.equal(hidden.clock.scheduled,false);
  assert.equal(await root.evaluate(node=>node.machine.light().energy),0);
  const began=await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));return performance.now();});
  await advance(root,hidden.before);
  const resumed=await root.evaluate(node=>({frame:node.machine.snapshot().frame,time:performance.now()}));
  assert.ok(resumed.frame-hidden.before<=(resumed.time-began)*.06+3,'Visibility resumes without catching up hidden time');
  await context.close();return {mode:'document-visibility-signal',hidden,resumed,note:'Headless Chromium keeps tabs visible; document signal is injected.'};
}

export async function homepageLifecycle(open) {
  const delayed=await auditDelayedClock(open),hidden=await visibilitySignal(open);
  const {context,page,root,errors}=await open({viewport:{width:1366,height:900}});
  await root.evaluate(node=>node.machine.seek(145));
  await root.locator('[data-machine-canvas]').evaluate(canvas=>canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await expect(root).toHaveAttribute('data-render','fallback');
  assert.equal(await root.evaluate(node=>node.machine.snapshot().frame),145);
  await expect(root.locator('[data-machine-fallback] svg')).toBeVisible();
  assert.deepEqual(errors,[]);await context.close();
  return [delayed,hidden,{mode:'context-loss',frame:145,staticTopology:true}];
}

export async function nativeFingerScroll(page,root) {
  await page.evaluate(()=>scrollTo(0,0));
  await expect.poll(()=>root.evaluate(node=>Boolean(node.machine.diagnostics().camera)),{timeout:10000}).toBe(true);
  const before=await root.evaluate(node=>({camera:node.machine.diagnostics().camera,frame:node.machine.snapshot().frame}));
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:180,y:350}]});
  for(let y=300;y>=100;y-=50) {
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:180,y}]});
    await page.waitForTimeout(25);
  }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>scrollY>100);
  const after=await root.evaluate(node=>({camera:node.machine.diagnostics().camera,frame:node.machine.snapshot().frame}));
  assert.deepEqual(after,before,'Native finger scrolling preserves graph camera and replay frame');
  const scrollY=await page.evaluate(()=>window.scrollY);await cdp.detach();return {scrollY,cameraUnchanged:true,frameUnchanged:true};
}
