import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
const base=process.env.PORTFOLIO_AUDIT_URL||'http://127.0.0.1:4173';
const out='ux-screenshots/homepage-presentation';
await mkdir(out,{recursive:true});
const browser=await chromium.launch();
const evidence=[];
try {
  await transportDuringIgnition();
  for(const width of [1440,390]) for(const fallback of [false,true]) {
    const context=await browser.newContext({viewport:{width,height:900},colorScheme:'dark'});
    const page=await context.newPage();
    if(fallback) await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind.startsWith('webgl')?null:get.call(this,kind,...args);};});
    await page.goto(base);
    const root=page.locator('[data-digital-home]');
    await expect(root).toHaveAttribute('data-startup','idle');
    assert.equal(await page.evaluate(()=>Boolean(document.querySelector('[data-digital-home]').machine)),false);
    await page.getByRole('button',{name:'Start interactive model'}).click();
    await expect(root).toHaveAttribute('data-startup',fallback?'fallback':'ready',{timeout:30000});
    await expect(page.locator('[data-replay-play]')).toBeVisible();
    assert.equal(await page.locator('.digital-replay-disclosure').getAttribute('open'),null);
    if(!fallback) {
      await expect(page.locator('[data-replay-play]')).toHaveText('Pause');
      await page.locator('[data-replay-play]').click();
      const before=await root.evaluate(n=>n.machine.diagnostics().camera);
      const canvas=await page.locator('canvas').boundingBox();
      await page.mouse.move(canvas.x+canvas.width*.5,canvas.y+canvas.height*.5);
      await page.mouse.down();await page.mouse.move(canvas.x+canvas.width*.5+55,canvas.y+canvas.height*.5+20,{steps:5});await page.mouse.up();
      const after=await root.evaluate(n=>n.machine.diagnostics().camera);
      assert.notEqual(before.yaw,after.yaw,'Pointer orbit changes camera');
      await page.locator('[data-machine-stage]').focus();await page.keyboard.press('ArrowRight');
      await expect(page.locator('[data-replay-play]')).toHaveText('Play');
    } else {
      const geometry=await page.locator('.machine-fallback svg').evaluate(svg=>({nodes:svg.querySelectorAll('circle').length,edges:svg.querySelectorAll('path').length,x:new Set([...svg.querySelectorAll('circle[data-layer="0"]')].map(n=>n.getAttribute('cx'))).size,width:svg.getBoundingClientRect().width}));
      assert.equal(geometry.nodes,1668);assert.equal(geometry.edges,8);assert.ok(geometry.x>16,'Actual layer depth is visible');assert.ok(geometry.width>width*.8);
    }
    await page.screenshot({path:`${out}/${width}-${fallback?'fallback':'webgl'}.png`});
    evidence.push({width,fallback,startup:await root.evaluate(n=>n.modelStartup.snapshot())});
    if(!fallback){await page.reload();await expect(root).toHaveAttribute('data-startup','ready',{timeout:30000});await expect(page.locator('[data-replay-play]')).toHaveText('Play');assert.equal((await root.evaluate(n=>n.modelStartup.snapshot())).completions,0);}
    await context.close();
  }
} finally {await writeFile(`${out}/audit.json`,JSON.stringify(evidence,null,2));await browser.close();}
console.log('Homepage presentation: desktop/mobile Start, ignition, replay, pointer/keyboard inspection, retained state and real fallback geometry passed.');


async function transportDuringIgnition() {
  for (const action of ['pause', 'rewind', 'scrub', 'keyboard']) {
    const context = await browser.newContext({viewport:{width:1200,height:900}});
    try {
      const page = await context.newPage();
      await page.goto(base);
      await expect(page.locator('[data-model-start]')).toBeVisible();
      await page.evaluate(() => {
        const startup = document.querySelector('[data-model-startup]').modelStartup;
        const advance = startup.advanceIgnition.bind(startup);
        window.ignitionHeld = false;
        startup.advanceIgnition = time => {
          if (startup.elapsedActiveMs < 150) advance(time);
          else { window.ignitionHeld = true; startup.lastTime = null; }
        };
        window.releaseIgnition = () => { startup.advanceIgnition = advance; };
      });
      await page.locator('[data-model-start]').click();
      await page.waitForFunction(() => window.ignitionHeld);
      const root = page.locator('[data-model-startup]');
      await expect(root).toHaveAttribute('data-startup','igniting');
      if (action === 'pause') {
        await page.getByRole('button',{name:'Play',exact:true}).click();
        await page.getByRole('button',{name:'Pause',exact:true}).click();
      } else if (action === 'rewind') await page.locator('[data-replay-rewind]').click();
      else if (action === 'scrub') {
        await page.locator('[data-replay-timeline]').focus();
        await page.keyboard.press('ArrowRight');
      } else {
        await page.locator('[data-machine-stage]').focus();
        await page.keyboard.press('ArrowRight');
      }
      const before = await root.evaluate(node => node.machine.snapshot());
      assert.equal(before.playing,false);
      await page.evaluate(() => window.releaseIgnition());
      await expect(root).toHaveAttribute('data-startup','ready',{timeout:15000});
      const after = await root.evaluate(async node => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return node.machine.snapshot();
      });
      assert.equal(after.playing,false,`${action}: readiness preserves explicit pause`);
      assert.equal(after.frame,before.frame,`${action}: readiness preserves the chosen frame`);
      await expect(page.locator('[data-replay-play]')).toHaveText('Play');
      evidence.push({heldIgnition:action,frame:after.frame,playing:after.playing});
    } finally { await context.close(); }
  }
}
