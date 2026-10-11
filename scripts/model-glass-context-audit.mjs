import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {beginContextTransitionSample,readContextTransitionSample,contextTransitionAdvances,
  RENDERER_OBSERVATION_TIMEOUT_MS} from './model-audit-host.mjs';
const diagnostics=root=>root.evaluate(node=>node.machine.diagnostics());

export async function contextExitWaitsForTransition(page,root,phone) {
  const input=root.locator('[data-glass-panel="input"]');
  await input.locator('input').focus();
  // Stretch only this audit's intermediate observation window. Full-quality
  // software draws can consume the former four-second ease before the sampler
  // gets a frame; the production duration and capture predicates stay intact.
  await input.evaluate((panel,timeoutMs)=>panel.style.transitionDuration=`${timeoutMs}ms`,RENDERER_OBSERVATION_TIMEOUT_MS);
  const immediate=await beginContextTransitionSample(root,'representation');
  console.log('Glass context: exit observer armed');
  assert.deepEqual(immediate,{active:'false',ariaHidden:'true',inert:true,stageFocused:true,focusLeak:false},'exit makes the pane inert immediately and relocates focus');
  let exitSample;
  try {await expect.poll(async()=>{
    exitSample=await readContextTransitionSample(root);
    return Boolean(exitSample);
  },{timeout:RENDERER_OBSERVATION_TIMEOUT_MS}).toBe(true);}
  catch(error) {
    const state=await root.evaluate(node=>{const scene=node.machineController.scene,glass=scene?.glass;return {visible:node.machineController.visible,hidden:document.hidden,
      raf:scene?.glassAnimationRaf,panels:glass?.panels.map(panel=>({id:panel.id,active:panel.node.dataset.contextActive,
        animating:panel.node.contextAnimating,contextVisible:panel.node.contextVisible,domOpacity:getComputedStyle(panel.node).opacity,
        glassOpacity:panel.mesh.material.opacity,trimOpacity:panel.trim.material.opacity,hidden:panel.node.hidden})),
      stageRect:node.querySelector('[data-machine-stage]').getBoundingClientRect().toJSON()};});
    console.log(`Glass context state at exit sample timeout: ${JSON.stringify(state)}`);throw error;
  }
  const {panel:exiting,translation:exitingTranslation}=exitSample;
  console.log('Glass context: intermediate exit captured');
  assert.ok(exitingTranslation>0,'The exiting DOM pane translates in both spatial and flow layouts');
  assert.ok(exiting.transitionOpacity>0,'sample is inside the visible DOM transition');
  assert.equal(exiting.contextAnimating,true,'GPU transition remains active while the paused article replay is idle');
  assert.ok(exiting.transitionOpacity>0&&exiting.transitionOpacity<1,'pane backing opacity follows its eased DOM exit');
  assert.ok(exiting.backingOpacity>0&&exiting.backingOpacity<1,'translucent GPU glass fades between visible and hidden');
  assert.ok(exiting.trimOpacity>0&&exiting.trimOpacity<.32,'GPU trim fades with the glass and DOM pane');
  if(exiting.visible) {
    assert.ok(exiting.transitionOffset.x>0,'GPU glass translates in the DOM pane exit direction');
    assert.ok(exiting.transitionAlignmentError<3,'GPU glass and trim stay inside the translating DOM pane bounds');
  }
  await expect(root.locator('[data-glass-panel="inspect"]')).toHaveAttribute('data-context-active','true');
  await expect(input).toHaveAttribute('data-context-active','false');await expect(input).toHaveAttribute('aria-hidden','true');
  await expect(root.locator('[data-machine-stage]')).toBeFocused();
  if(phone) {
    await expect(root.locator('[data-instrument="input"]')).toBeDisabled();
    await expect(root.locator('[data-instrument="output"]')).toBeDisabled();
    await expect(root.locator('[data-instrument="inspect"]')).toBeEnabled();
    const state=await diagnostics(root);assert.equal(state.glass.panels.filter(panel=>panel.visible).length,state.glass.mode==='spatial'?1:0);
  }
  await beginContextTransitionSample(root,'all',exitSample);
  await expect(input).not.toHaveAttribute('aria-hidden','true');
  assert.equal(await input.evaluate(panel=>panel.inert),false,'reversing the context transition restores pane focusability');
  let reverseSample;
  await expect.poll(async()=>{
    reverseSample=await readContextTransitionSample(root);
    return reverseSample&&contextTransitionAdvances(reverseSample.panel,exiting)&&exitingTranslation>reverseSample.translation;
  },{timeout:RENDERER_OBSERVATION_TIMEOUT_MS}).toBe(true);
  console.log('Glass context: reentry captured');
  const reversing=reverseSample.panel;
  assert.ok(reversing.transitionOpacity>exiting.transitionOpacity,'reversed easing moves the glass and DOM pane back toward their context pose');
  if(exiting.visible)assert.ok(reversing.transitionOffset.x<exiting.transitionOffset.x,'reversed GPU backing follows the returning DOM pane');
  assert.ok(exitingTranslation>reverseSample.translation,
    'reversed DOM translation returns in both spatial and flow layouts');
  await input.evaluate(panel=>{
    for(const animation of panel.getAnimations())if(animation.playState==='paused')animation.play();
    panel.style.transitionDuration='4s';
  });
  await root.evaluate(node=>node.machine.focus('representation'));
  await expect.poll(()=>input.evaluate(panel=>panel.contextVisible),{timeout:RENDERER_OBSERVATION_TIMEOUT_MS}).toBe(false);
  await expect(input).toHaveAttribute('inert','');
  await expect.poll(async()=>(await diagnostics(root)).glass.panels.find(panel=>panel.id==='input').visible,{timeout:RENDERER_OBSERVATION_TIMEOUT_MS}).toBe(false);
  await input.evaluate(panel=>panel.style.transitionDuration='');
}
