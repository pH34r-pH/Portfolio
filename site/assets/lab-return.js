(() => {
  const navigation = document.getElementById('portfolio-lab-return');
  if (!navigation) return;
  const asset = new URL(document.currentScript.src);
  const path = new URL(location.href).searchParams.get('path') || '';
  const match = /^notebooks\/([a-z0-9_]+)\.ipynb$/.exec(path);
  if (!match) return;
  // Resolve only declared local publication records, never a URL supplied in a query.
  fetch(new URL('../publication.json', asset)).then(response => {
    if (!response.ok) throw Error('Publication unavailable');
    return response.json();
  }).then(publication => {
    const notebook = publication.notebooks?.find(item => item.slug === match[1]);
    if (!notebook) return;
    const back = navigation.querySelector('[data-lab-return]');
    back.href = new URL('../notebooks/' + encodeURIComponent(notebook.slug) + '/', asset).href;
    back.textContent = '← Return to notebook';
    const article = publication.articles?.find(item => item.notebookSlug === notebook.slug);
    if (article && /^[a-z0-9-]+$/.test(article.slug)) {
      const link = document.createElement('a');
      link.href = new URL('../articles/' + encodeURIComponent(article.slug) + '/', asset).href;
      link.textContent = 'Read article';
      navigation.querySelector('[data-lab-help]').append(link);
    }
  }).catch(() => {}); // Research remains the usable fallback.
})();
