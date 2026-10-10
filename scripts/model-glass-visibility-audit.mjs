import assert from 'node:assert/strict';
import {expect} from '@playwright/test';

export async function contextReversalKeepsTabsValid(page,root,phone,{reverseContextToAll,glassContextSettled,diagnostics,selectOutputOnPhone}) {
  await page.waitForTimeout(120);await reverseContextToAll(root);
  const input=root.locator('[data-glass-panel="input"]');await expect(input).not.toHaveAttribute('inert','');
  await expect.poll(()=>glassContextSettled(root),{timeout:5000}).toBe(true);
  const state=await diagnostics(root);
  await expect.poll(async()=>(await diagnostics(root)).glass.panels.filter(panel=>panel.visible).length)
    .toBe(state.glass.mode==='spatial'?(phone?1:3):0);
  if(phone)await selectOutputOnPhone(root);
  await expect.poll(()=>input.evaluate(panel=>panel.inert)).toBe(false);
  await expect.poll(async()=>(await diagnostics(root)).glass.panels.filter(panel=>panel.contextVisible!==false).length).toBe(3);
}

export async function offscreenContextPause(page,root,glassContextSettled,glassContextStatus) {
  const initial=await root.evaluate(node=>node.machineController.visible);
  assert.equal(initial,true,'model starts visible for offscreen context regression');
  const spacer=await page.evaluate(()=>{const node=document.createElement('div');node.dataset.glassAuditSpacer='';node.style.height='150vh';document.body.append(node);return true;});
  assert.equal(spacer,true);
  try {
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    await expect.poll(()=>root.evaluate(node=>node.machineController.visible),{timeout:5000}).toBe(false);
    await root.evaluate(node=>node.machine.focus('consumer'));
    const pending=await root.evaluate(node=>node.machineController.scene.glassAnimationRaf);
    assert.equal(pending,0,'context transition does not schedule renderer work while the model is offscreen');
    await expect.poll(()=>glassContextSettled(root,false),{timeout:3000}).toBe(true);
    await root.locator('[data-machine-stage]').evaluate(node=>node.scrollIntoView({block:'center'}));
    await expect.poll(()=>root.evaluate(node=>node.machineController.visible),{timeout:5000}).toBe(true);
    await expect.poll(()=>glassContextSettled(root),{timeout:5000}).toBe(true);
    await root.evaluate(node=>node.machine.focus('all'));
    try {await expect.poll(()=>glassContextSettled(root),{timeout:5000}).toBe(true);}
    catch(error) {
      const state=await glassContextStatus(root);
      console.log('Glass context state after offscreen reversal timeout: '+JSON.stringify(state));throw error;
    }
  } finally {await page.locator('[data-glass-audit-spacer]').evaluate(node=>node.remove());}
}
