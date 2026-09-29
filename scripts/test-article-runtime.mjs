import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const runtime = readFileSync(new URL('../site/assets/article-runtime.js', import.meta.url), 'utf8');
class Element extends EventTarget {
  constructor(tag = '') { super(); this.tag = tag; this.childNodes = []; this.disabled = false; this.textContent = ''; }
  append(node) { node.parent = this; this.childNodes.push(node); }
  before(node) { node.parent = this.parent; this.parent.childNodes.splice(this.parent.childNodes.indexOf(this), 0, node); }
  get nextSibling() { return this.parent.childNodes[this.parent.childNodes.indexOf(this) + 1]; }
  replaceWith(node) { const parent = this.parent; const index = parent.childNodes.indexOf(this); node.remove(); parent.childNodes[index] = node; node.parent = parent; this.parent = undefined; }
  remove() { if (this.parent) this.parent.childNodes.splice(this.parent.childNodes.indexOf(this), 1); this.parent = undefined; }
  cloneNode() { const node = new Element(this.tag); node.textContent = this.textContent; return node; }
  replaceChildren(...children) { this.childNodes.forEach(child => { child.parent = undefined; }); this.childNodes = []; children.forEach(child => this.append(child)); }
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture({ failAsset, failKernel } = {}) {
  const button = new Element('button');
  const status = new Element('p');
  const head = new Element('head');
  const parent = new Element('article');
  const source = new Element('pre'); source.textContent = 'print(42)'; parent.append(source);
  const output = new Element('div'); const saved = new Element(); saved.textContent = 'Saved output remains readable'; output.append(saved);
  let attempts = 0; let disposed = 0; let rejectFirst;
  const assets = [];
  const window = {};
  head.append = node => {
    Element.prototype.append.call(head, node);
    if (node.tag !== 'script') return;
    assets.push(node.src);
    queueMicrotask(() => {
      if (node.src === failAsset && assets.filter(src => src === failAsset).length === 1) return node.onerror();
      if (node.src.endsWith('/index.js')) window.thebe = { bootstrap: async () => {
        attempts++;
        assert.ok(parent.childNodes.includes(source), 'bootstrap sees original executable source');
        source.replaceWith(new Element('thebe-cell'));
        output.replaceChildren(new Element('live-output'));
        window.thebe.notebook = {};
        window.thebe.server = { dispose() { disposed++; } };
        if (failKernel && attempts === 1) await new Promise((resolve, reject) => { rejectFirst = reject; });
      } };
      node.onload();
    });
  };
  const panel = { querySelector: selector => selector.includes('load-browser') ? button : status };
  const document = {
    head, getElementById: () => null,
    createElement: tag => new Element(tag), createComment: () => new Element('comment'),
    querySelector: selector => head.childNodes.find(node => selector === `link[href="${node.href}"]`),
    querySelectorAll: selector => selector === '[data-article-execution]' ? [panel] : selector === '[data-executable]' ? (parent.childNodes.includes(source) ? [source] : []) : selector === '[data-output]' ? [output] : [],
  };
  vm.runInNewContext(runtime, { document, window });
  return { button, status, head, source, parent, output, assets, attempts: () => attempts, disposed: () => disposed, rejectFirst: () => rejectFirst(new Error('Kernel startup failed')), click: () => button.dispatchEvent(new Event('click')) };
}
for (const failAsset of ['/assets/thebe/thebe-lite.min.js', '/assets/thebe/index.js']) {
  test(`asset failure retries ${failAsset} without duplicating loaded assets`, async () => {
    const f = fixture({ failAsset });
    f.click(); f.click(); await flush();
    assert.equal(f.button.disabled, false); assert.equal(f.button.textContent, 'Try browser Python again');
    assert.ok(f.status.textContent.includes('could not start')); assert.ok(f.parent.childNodes.includes(f.source));
    f.click(); f.click(); await flush();
    assert.equal(f.button.textContent, 'Browser Python ready'); assert.equal(f.button.disabled, true);
    assert.equal(f.attempts(), 1);
    assert.equal(f.head.childNodes.filter(node => node.tag === 'link').length, 2);
    assert.equal(f.head.childNodes.filter(node => node.tag === 'script').length, 2);
    f.click(); await flush(); assert.equal(f.attempts(), 1);
    if (failAsset.endsWith('/index.js')) assert.equal(f.assets.filter(src => src.endsWith('thebe-lite.min.js')).length, 1);
  });
}
test('kernel rejection restores placeholders and allows exactly one successful retry', async () => {
  const f = fixture({ failKernel: true });
  f.click(); f.click(); await flush();
  assert.equal(f.attempts(), 1); assert.equal(f.button.disabled, true);
  f.rejectFirst(); await flush();
  assert.equal(f.button.disabled, false); assert.equal(f.button.textContent, 'Try browser Python again');
  assert.deepEqual(f.parent.childNodes, [f.source]);
  assert.equal(f.output.childNodes[0].textContent, 'Saved output remains readable'); assert.equal(f.disposed(), 1);
  f.click(); f.click(); await flush();
  assert.equal(f.button.textContent, 'Browser Python ready'); assert.equal(f.attempts(), 2); assert.equal(f.assets.length, 2);
  f.click(); await flush(); assert.equal(f.attempts(), 2);
});
