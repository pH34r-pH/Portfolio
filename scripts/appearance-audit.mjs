import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

const base = process.env.PORTFOLIO_AUDIT_URL || 'http://127.0.0.1:4173';
const modes = ['light', 'dark'];
const shots = process.env.PORTFOLIO_STYLE_SCREENSHOTS;

async function discoverPaths(context) {
  const paths = ['/', '/research/', '/atlas/', '/about/'];
  const response = await context.request.get(base + '/publication.json');
  if (response.ok() && response.headers()['content-type']?.includes('json')) {
    const manifest = await response.json();
    if (manifest.notebooks?.length) paths.push('/notebooks/' + manifest.notebooks[0].slug + '/');
    if (manifest.articles?.length) paths.push(manifest.articles[0].url);
  }
  return paths;
}

async function auditMode(page, width, path, mode) {
  await page.getByRole('button', { name: mode === 'dark' ? 'Dark / blue' : 'Light / blue' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
  const overflowing = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  assert.equal(overflowing, false, `${width} ${path} ${mode}: overflow`);
  if (![412, 1366].includes(width)) return;
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  assert.deepEqual(axe.violations.map(v => ({id:v.id,targets:v.nodes.map(n=>n.target)})), [],
    `${width} ${path} ${mode}: axe`);
}

async function auditPath(page, width, path) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  const title = await page.locator('h1').first().innerText();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Display mode', exact: true })).toBeVisible();
  for (const mode of modes) await auditMode(page, width, path, mode);
  assert.equal(await page.locator('h1').first().innerText(), title, 'Display mode must preserve authored title');
  if (shots && [412,1366].includes(width) && ['/', '/research/'].includes(path)) {
    await page.keyboard.press('Escape');
    await page.evaluate(() => scrollTo(0,0));
    await page.screenshot({path:`${shots}/2071-${path==='/'?'home':'research'}-${width}.png`,fullPage:false});
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused();
}

async function auditPersistence(page) {
  await page.goto(base + '/');
  await page.getByRole('button', { name:'Menu', exact:true }).click();
  await page.getByRole('button', { name:'Dark / blue' }).click();
  await page.getByRole('navigation', {name:'Site', exact:true}).getByRole('link',{name:'Research',exact:true}).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-mode','dark');
}

async function auditViewport(browser,width) {
  const context=await browser.newContext({viewport:{width,height:width<600?915:900},hasTouch:width<900,isMobile:width<600,reducedMotion:'reduce'});
  const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  for (const path of await discoverPaths(context)) await auditPath(page,width,path);
  await auditPersistence(page);
  assert.deepEqual(errors,[],`${width}: runtime errors`);
  console.log(`Appearance: ${width}px, light/dark 2071 modes`);
  await context.close();
}

async function auditDeniedStorage(browser) {
  const context=await browser.newContext();
  await context.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new DOMException('Blocked','SecurityError')};Storage.prototype.setItem=()=>{throw new DOMException('Blocked','SecurityError')}});
  const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/'); await page.getByRole('button',{name:'Menu',exact:true}).click();
  await page.getByRole('button',{name:'Dark / blue'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode','dark');
  assert.deepEqual(errors,[]); await context.close();
}

async function auditForcedColors(browser) {
  const context=await browser.newContext({forcedColors:'active',reducedMotion:'reduce',viewport:{width:412,height:915}});
  const page=await context.newPage(); await page.goto(base+'/');
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
  assert.deepEqual(axe.violations.map(v=>v.id),[]);
  await context.close();
}

if(shots) await mkdir(shots,{recursive:true});
const browser=await chromium.launch({headless:true});
try{for(const width of [320,412,768,1366]) await auditViewport(browser,width);await auditDeniedStorage(browser);await auditForcedColors(browser)}
finally{await browser.close()}