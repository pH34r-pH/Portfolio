import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const base = process.env.PORTFOLIO_AUDIT_URL || 'http://127.0.0.1:4173';
const out = process.env.MODEL_EVIDENCE_DIR || 'ux-screenshots/model';
await mkdir(out, {recursive:true});
const browser = await chromium.launch({headless:true});
const evidence = [];
async function open(options={}, setup) {
  const context = await browser.newContext(options); const page = await context.newPage();
  if (setup) await setup(page);
  const errors=[]; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, {waitUntil:'networkidle'});
  const root=page.locator('[data-model-machine]').first(); await root.scrollIntoViewIfNeeded();
  await expect(root).toHaveAttribute('data-render', /webgl|fallback/, {timeout:20000});
  return {context,page,root,errors};
}
async function snapshot(root) { return root.evaluate(node=>node.machine.snapshot()); }
async function seek(root, frame) { await root.evaluate((node,value)=>node.machine.seek(value), frame); }
async function axe(page, name) {
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],`${name} axe`);
}
try {
  for (const [name,width,height,dpr] of [['desktop',1440,1000,1],['phone360',360,800,3],['s23-ultra',412,915,3],['phone320',320,780,2]]) {
    const {context,page,root,errors}=await open({viewport:{width,height},deviceScaleFactor:dpr,isMobile:width<600,hasTouch:width<600});
    await expect(root).toHaveAttribute('data-render','webgl');
    await seek(root,145); const first=await snapshot(root);
    await seek(root,360); await expect(root.locator('[data-machine-output]')).toContainText('the model learned a useful distinction');
    await seek(root,0); await seek(root,145); const replay=await snapshot(root);
    assert.deepEqual(replay,first,`${name} deterministic rewind`);
    await root.locator('[data-probe-layer]').selectOption('1');
    await root.locator('[data-probe-node]').selectOption('49');
    await expect(root.locator('[data-probe-readout]')).toContainText('L1-01');
    await expect(root.locator('[data-probe-readout]')).toContainText('48 incoming / 16 outgoing');
    // Orbit and zoom change the camera without modifying the replay frame.
    await root.locator('[data-camera="right"]').click(); await root.locator('[data-camera="in"]').click();
    assert.equal((await snapshot(root)).frame,145);
    await root.locator('[data-camera="reset"]').click();
    await root.locator('[data-machine-stage]').focus(); await page.keyboard.press('ArrowLeft');
    assert.equal((await snapshot(root)).frame,144);
    await page.keyboard.press('Shift+ArrowRight'); assert.equal((await snapshot(root)).frame,154);
    await page.keyboard.press('Home'); assert.equal((await snapshot(root)).frame,0);
    await page.keyboard.press('End'); assert.equal((await snapshot(root)).frame,360);
    await seek(root,145);
    for (const theme of ['light','dark']) {
      await page.evaluate(value=>{document.documentElement.dataset.themeMode=value;document.documentElement.dataset.theme=value;},theme);
      await axe(page,`${name}/${theme}`);
      await root.screenshot({style:'.topbar,.skip-link{visibility:hidden !important;}',path:`${out}/${name}-${theme}.png`});
    }
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=1,`${name} overflow ${overflow}`);
    const targets=await root.locator('button,select,input').evaluateAll(nodes=>nodes.map(node=>({tag:node.tagName,h:node.getBoundingClientRect().height,w:node.getBoundingClientRect().width})));
    assert.ok(targets.every(target=>target.h>=44 && target.w>=44),`${name} targets ${JSON.stringify(targets)}`);
    const diagnostics=await root.evaluate(node=>node.machine.diagnostics());
    assert.equal(diagnostics.nodes,200); assert.equal(diagnostics.edges,4352);
    assert.ok(diagnostics.drawCalls<=40); if(width<600)assert.ok(diagnostics.pixelRatio<=1.25);
    await root.locator('[data-machine-stage]').scrollIntoViewIfNeeded();
    await seek(root,70); await root.evaluate(node=>node.machine.play()); await page.waitForTimeout(180);
    assert.ok((await snapshot(root)).frame>70,`${name} replay advances`);
    await page.evaluate(()=>scrollTo(0,0)); await page.waitForTimeout(120); const before=await snapshot(root);
    await page.waitForTimeout(300); assert.equal((await snapshot(root)).frame,before.frame,`${name} offscreen pause`);
    await root.locator('[data-machine-stage]').scrollIntoViewIfNeeded(); await page.waitForTimeout(180);
    assert.ok((await snapshot(root)).frame>before.frame,`${name} replay resumes`);
    await root.evaluate(node=>node.machine.pause());
    assert.deepEqual(errors,[]); evidence.push({name,width,height,dpr,diagnostics,overflow,errors});
    await context.close();
  }
  for (const mode of ['reduced-motion','webgl-unavailable','engine-unavailable','forced-colors']) {
    const options={viewport:{width:360,height:800},...(mode==='reduced-motion'?{reducedMotion:'reduce'}:{}),...(mode==='forced-colors'?{forcedColors:'active'}:{})};
    let engineRequests=0;
    const {context,page,root,errors}=await open(options,async page=>{
      page.on('request', request=>{if(request.url().includes('three@0.186.1'))engineRequests++;});
      if(mode==='webgl-unavailable')await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind.startsWith('webgl')?null:original.call(this,kind,...args);};});
      if(mode==='engine-unavailable')await page.route('**/vendor/three@0.186.1/**',route=>route.abort());
    });
    await expect(root).toHaveAttribute('data-render','fallback');
    await seek(root,145); const first=await snapshot(root); await seek(root,360); await seek(root,145);
    assert.deepEqual(await snapshot(root),first);
    await expect(root.locator('[data-machine-fallback]')).toBeVisible();
    await root.locator('[data-probe-layer]').selectOption('6'); await expect(root.locator('[data-probe-readout]')).toContainText('32 incoming / 0 outgoing');
    if(mode==='reduced-motion'||mode==='forced-colors')assert.equal(engineRequests,0);
    await axe(page,mode); await root.screenshot({style:'.topbar,.skip-link{visibility:hidden !important;}',path:`${out}/${mode}.png`});
    assert.deepEqual(errors,[]); evidence.push({mode,engineRequests,errors}); await context.close();
  }
  // Context loss follows the same honest, inspectable fallback contract.
  const {context,page,root}=await open({viewport:{width:1366,height:900}});
  await seek(root,145);
  await root.locator('canvas').evaluate(canvas=>canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await expect(root).toHaveAttribute('data-render','fallback'); assert.equal((await snapshot(root)).frame,145);
  await context.close();
  await writeFile(`${out}/audit.json`,JSON.stringify(evidence,null,2));
  console.log(`Model audit passed: ${evidence.length} profiles, WebGL context loss, complete topology and deterministic replay.`);
} finally {await browser.close();}
