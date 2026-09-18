async function loadPublication() {
  const target = document.querySelector('#provenance-data');
  const list = document.querySelector('#notebook-list');
  try {
    const response = await fetch('/publication.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('publication manifest unavailable');
    const manifest = await response.json();
    target.textContent = JSON.stringify(manifest.sources, null, 2);
    if (Array.isArray(manifest.notebooks) && manifest.notebooks.length) {
      list.replaceChildren(...manifest.notebooks.map((notebook) => {
        const article = document.createElement('article');
        article.className = 'card';
        const title = document.createElement('h3');
        title.textContent = notebook.title || notebook.path;
        const link = document.createElement('a');
        link.href = '/lab/index.html?path=' + encodeURIComponent(notebook.path);
        link.textContent = 'Open interactively';
        article.append(title, link);
        return article;
      }));
    }
  } catch (error) {
    target.textContent = 'No publication bundle is installed in this source checkout.';
  }
}
loadPublication();
