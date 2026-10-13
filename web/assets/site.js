document.documentElement.classList.add('has-js');

const menu = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.marketing-nav');
if (menu && navigation) {
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    navigation.dataset.open = String(open);
  });
  navigation.addEventListener('click', event => {
    if (!event.target.closest('a')) return;
    navigation.dataset.open = 'false';
    menu.setAttribute('aria-expanded', 'false');
    for (const dropdown of navigation.querySelectorAll('details')) dropdown.open = false;
  });
}

const dropdowns = [...document.querySelectorAll('.nav-dropdown')];
document.addEventListener('click', event => {
  for (const dropdown of dropdowns) if (!dropdown.contains(event.target)) dropdown.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  for (const dropdown of dropdowns) if (dropdown.open) {
    dropdown.open = false;
    dropdown.querySelector('summary')?.focus();
  }
  if (menu && navigation?.dataset.open === 'true') {
    navigation.dataset.open = 'false';
    menu.setAttribute('aria-expanded', 'false');
    menu.focus();
  }
});

function wireTabs(selector, activate) {
  const tabs = [...document.querySelectorAll(selector)];
  const select = tab => {
    for (const item of tabs) {
      item.setAttribute('aria-selected', String(item === tab));
      item.tabIndex = item === tab ? 0 : -1;
    }
    activate(tab);
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      select(tabs[next]);
      tabs[next].focus();
    });
  });
}
wireTabs('[data-preview]', tab => {
  const image = document.querySelector('.console-image');
  if (!image) return;
  image.src = tab.dataset.image;
  image.alt = tab.dataset.alt;
  document.querySelector('.preview-panel')?.setAttribute('aria-labelledby', tab.id);
  const caption = document.querySelector('.tour-caption');
  if (caption) caption.textContent = tab.dataset.caption;
});
wireTabs('[data-install]', tab => {
  for (const panel of document.querySelectorAll('.install-panel')) panel.hidden = panel.id !== tab.getAttribute('aria-controls');
});

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
