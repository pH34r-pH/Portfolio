import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Keep the embedded viewer's gesture/keyboard gates after the homepage changed.
// Source-only runs use the canonical publication host fixture; finished bundles
// must use a real rendered article with its own source and export contracts.
export async function articleHost(base) {
  const response=await fetch(base+'/publication.json');
  if(response.ok&&(response.headers.get('content-type')||'').includes('json')) {
    const manifest=await response.json();
    const article=manifest.articles.find(item=>item.modelFocus);
    assert.ok(article,'Finished bundle must contain an embedded model article');
    return {url:base+article.url,kind:'published-article',slug:article.slug};
  }
  if(process.env.PORTFOLIO_PUBLICATION_BUNDLE==='1')throw Error('Required publication manifest is unavailable');
  const html=await readFile(new URL('./fixtures/article-model.html',import.meta.url),'utf8');
  return {url:base+'/__audit/article-model/',kind:'canonical-source-fixture',html};
}
