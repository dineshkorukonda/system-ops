for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    const content = document.querySelector(button.dataset.copy)?.textContent;
    try {
      await navigator.clipboard.writeText(content || '');
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Select command to copy';
    }
    setTimeout(() => { button.textContent = 'Copy'; }, 2500);
  });
}

const search = document.querySelector('.docs-search');
const results = document.querySelector('.search-results');
if (search && results) {
  let indexPromise;
  let request = 0;
  search.addEventListener('input', async () => {
    const current = ++request;
    const query = search.value.trim().toLowerCase();
    results.replaceChildren();
    if (query.length < 2) return;
    try {
      indexPromise ||= fetch('../search-index.json').then(response => {
        if (!response.ok) throw new Error('Search unavailable');
        return response.json();
      });
      const index = await indexPromise;
      if (current !== request) return;
      const terms = query.split(/\s+/);
      const matches = index.filter(page => terms.every(term => `${page.title} ${page.text}`.toLowerCase().includes(term)))
        .sort((a, b) => Number(b.title.toLowerCase().includes(query)) - Number(a.title.toLowerCase().includes(query))).slice(0, 8);
      const summary = document.createElement('p');
      summary.textContent = matches.length ? `${matches.length} matching guides` : 'No matching guides. Try another term.';
      results.append(summary);
      for (const page of matches) {
        const link = document.createElement('a');
        link.href = `${page.slug}.html`;
        link.textContent = page.title;
        const description = document.createElement('small');
        description.textContent = page.description;
        link.append(description);
        results.append(link);
      }
    } catch {
      indexPromise = undefined;
      if (current !== request) return;
      const message = document.createElement('p');
      message.textContent = 'Search could not load. Browse the guides below.';
      results.append(message);
    }
  });
}
