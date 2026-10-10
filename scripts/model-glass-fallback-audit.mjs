import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {assertSuppressedOpacityOrder} from './model-audit-host.mjs';

export async function missingTransitionEndFallsBack(root,waitForGlassPanelSettled,glassContextSettled) {
  const input=root.locator('[data-glass-panel="input"]');
  const duration=await input.evaluate(panel=>parseFloat(getComputedStyle(panel).transitionDuration));
  assert.ok(duration>=.7,'missing-event fallback covers the production-length easing');
  await input.evaluate(panel=>{
    panel.contextAuditSuppressedTransitionEnds=0;
    panel.contextAuditAnimatingAtTransitionEnd=null;
    panel.contextAuditElapsedAtTransitionEnd=null;
    panel.contextAuditSuppressTransitionEnd=event=>{
      if(event.target!==panel||event.propertyName!=='opacity')return;
      panel.contextAuditSuppressedTransitionEnds+=1;
      panel.contextAuditAnimatingAtTransitionEnd=panel.contextAnimating;
      panel.contextAuditElapsedAtTransitionEnd=performance.now()-panel.contextTransitionStartedAt;
      event.stopImmediatePropagation();
    };
    panel.addEventListener('transitionend',panel.contextAuditSuppressTransitionEnd,true);
  });
  try {
  const started=await root.evaluate(node=>{
    node.machine.focus('representation');
    const panel=node.querySelector('[data-glass-panel="input"]');
    return {duration:panel.contextTransitionDuration,animating:panel.contextAnimating};
  });
  assert.ok(started.duration>=700&&started.animating,'normal-duration exit arms the timer fallback while the pane is animating');
  await waitForGlassPanelSettled(root,'input',10000,'production-duration transitionend suppressed');
  const settled=await input.evaluate(panel=>({duration:panel.contextTransitionDuration,
    elapsed:performance.now()-panel.contextTransitionStartedAt,animating:panel.contextAnimating,
    suppressed:panel.contextAuditSuppressedTransitionEnds,handled:panel.contextAuditTransitionEnds}));
  assert.equal(settled.animating,false);
  assert.ok(settled.elapsed>=settled.duration+200,'normal-duration pane waits for the delayed fallback after its CSS transition');
  assert.equal(settled.handled,0,'opacity transitionend never reaches the pane completion listener');
  await assertSuppressedOpacityOrder(input,settled);
  await expect.poll(()=>glassContextSettled(root),{timeout:5000}).toBe(true);
  } finally {
    await input.evaluate(panel=>{
      panel.removeEventListener('transitionend',panel.contextAuditSuppressTransitionEnd,true);
      delete panel.contextAuditSuppressTransitionEnd;
    });
  }
}
