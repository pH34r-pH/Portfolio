import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(process.env.TITLE_REVIEW_OUTPUT || '../title-review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(new URL('../design/title-review.html', import.meta.url).href);
  await page.screenshot({ path: `${output}/portfolio-title-options.png`, fullPage: true });
  for (const [index, card] of (await page.locator('.studies article').all()).entries())
    await card.screenshot({ path: `${output}/title-${String(index + 1).padStart(2, '0')}.png` });
  await page.setViewportSize({ width: 412, height: 915 });
  await page.screenshot({ path: `${output}/portfolio-title-options-mobile.png`, fullPage: true });
  // Optional previews put two candidates into the actual assembled Home page.
  // These DOM/style changes exist only in this local review render.
  if (process.env.PORTFOLIO_AUDIT_URL) {
    for (const option of ['03', '07']) {
      for (const width of [1440, 412]) {
        await page.setViewportSize({ width, height: width === 412 ? 915 : 900 });
        await page.goto(process.env.PORTFOLIO_AUDIT_URL, { waitUntil: 'networkidle' });
        await page.locator('.hero h1').evaluate((heading) => {
          heading.innerHTML = 'Building<br>strange things<br>carefully.';
        });
        await page.addStyleTag({ content: option === '03'
          ? `.hero h1{font-family:'Nimbus Sans Narrow','Arial Narrow',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:-.025em;line-height:.95;font-size:clamp(3.5rem,6.3vw,5.7rem);max-width:20ch;border-left:1px solid var(--accent);padding-left:22px}.hero h1:before{content:'+';position:absolute;font:20px ui-monospace,monospace;color:var(--accent);margin-left:-31px;margin-top:-13px;background:var(--bg)}`
          : `.hero h1{font-family:'Nimbus Sans Narrow','Arial Narrow',sans-serif;font-weight:400;text-transform:lowercase;letter-spacing:-.025em;line-height:.96;font-size:clamp(3.5rem,6.8vw,6.2rem);max-width:20ch;border-left:1px solid var(--accent);padding-left:22px}` });
        await page.screenshot({ path: `${output}/home-option-${option}-${width === 412 ? 'mobile' : 'desktop'}.png` });
      }
    }
  }
  console.log(`Rendered ten title treatments in ${output}`);
} finally { await browser.close(); }
