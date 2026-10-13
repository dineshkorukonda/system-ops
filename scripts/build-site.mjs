import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked, Renderer } from 'marked';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const pages = JSON.parse(fs.readFileSync(path.join(root, 'web/pages.json'), 'utf8'));
export const escape = text => String(text).replace(/[&<>"']/g, value => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[value]));
export const slugify = text => text.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
const repo = 'https://github.com/dineshkorukonda/system-ops';
const base = 'https://system-ops.dineshkorukonda.online';

export function renderMarkdown(source, markdown) {
  const headings = new Map();
  const renderer = new Renderer();
  const rewrite = href => {
    if (/^(https?:|mailto:|#)/.test(href)) return href;
    const [filename, fragment] = href.split('#');
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(source), filename));
    const page = pages.find(item => item.source === resolved);
    return page ? `${page.slug}.html${fragment ? '#' + fragment : ''}` : `${repo}/blob/main/${resolved}${fragment ? '#' + fragment : ''}`;
  };
  renderer.link = function(token) {
    return `<a href="${escape(rewrite(token.href))}"${token.title ? ` title="${escape(token.title)}"` : ''}>${this.parser.parseInline(token.tokens)}</a>`;
  };
  renderer.image = token => `<img src="${escape(rewrite(token.href))}" alt="${escape(token.text)}" loading="lazy">`;
  renderer.heading = function(token) {
    const content = this.parser.parseInline(token.tokens);
    const baseId = slugify(token.text), count = headings.get(baseId) || 0;
    headings.set(baseId, count + 1);
    const id = baseId + (count ? `-${count}` : '');
    return `<h${token.depth} id="${escape(id)}">${content}</h${token.depth}>\n`;
  };
  const code = renderer.code.bind(renderer);
  renderer.code = token => code(token).replace("<pre>", '<pre tabindex="0" role="region" aria-label="Code example">');
  const table = renderer.table.bind(renderer);
  renderer.table = token => `<div class="table-scroll" tabindex="0" role="region" aria-label="Scrollable reference table">${table(token)}</div>`;
  return marked.parse(markdown, { renderer, gfm: true });
}

export function buildSite() {
  const output = path.join(root, 'web/docs');
  fs.mkdirSync(output, { recursive: true });
  const index = [];
  for (const page of pages) {
    if (!/^[a-z0-9-]+$/.test(page.slug)) throw new Error(`Invalid page slug: ${page.slug}`);
    const markdown = fs.readFileSync(path.join(root, page.source), 'utf8');
    const content = renderMarkdown(page.source, markdown);
    const groups = [...new Set(pages.map(item => item.group))];
    const nav = groups.map(group => `<h2>${escape(group)}</h2>${pages.filter(item => item.group === group).map(item => `<a href="${item.slug}.html"${item.slug === page.slug ? ' aria-current="page"' : ''}>${escape(item.title)}</a>`).join('')}`).join('');
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(page.title)} · System Ops</title><meta name="description" content="${escape(page.description)}">
<link rel="canonical" href="${base}/docs/${page.slug}.html"><meta property="og:title" content="${escape(page.title)} · System Ops"><meta property="og:description" content="${escape(page.description)}"><meta property="og:type" content="article"><meta property="og:url" content="${base}/docs/${page.slug}.html"><meta property="og:image" content="${base}/assets/console.png"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="../favicon.svg"><link rel="stylesheet" href="../assets/base.css"><link rel="stylesheet" href="../assets/docs.css"><script src="../assets/site.js" defer></script></head>
<body><a class="skip" href="#main">Skip to content</a><header class="site-header"><div class="container header-inner"><a class="brand" href="../index.html"><b aria-hidden="true">&gt;_</b>system-ops</a><nav class="site-nav" aria-label="Main"><a href="../index.html#features">Features</a><a href="index.html" aria-current="page">Docs</a><a href="support.html">Support</a><a href="contributing.html">Contribute</a><a class="nav-github" href="${repo}">GitHub ↗</a></nav></div></header>
<div class="container docs-layout"><aside class="docs-sidebar" aria-label="Documentation"><details class="docs-nav-mobile"><summary>Browse documentation</summary></details><label class="search-label" for="docs-search">Search documentation</label><input id="docs-search" class="docs-search" type="search" placeholder="Try ‘Docker’ or ‘rollback’" autocomplete="off"><div class="search-results" aria-live="polite" aria-atomic="true"></div><nav aria-label="Documentation guides">${nav}</nav></aside><main id="main" class="docs-article" tabindex="-1"><div class="eyebrow">${escape(page.group)} / System Ops</div>${content}<div class="article-meta"><a href="${repo}/edit/main/${page.source}">Edit this page on GitHub ↗</a><a href="support.html">Need help?</a><span>Source: ${escape(page.source)}</span></div></main></div><footer class="site-footer"><div class="container footer-inner"><span>System Ops · MIT © 2026 Dinesh Korukonda</span><div class="footer-links"><a href="security.html">Security</a><a href="code-of-conduct.html">Code of Conduct</a><a href="third-party-notices.html">Third-party notices</a></div></div></footer></body></html>`;
    fs.writeFileSync(path.join(output, `${page.slug}.html`), html);
    index.push({ slug: page.slug, title: page.title, description: page.description, text: content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 40000) });
  }
  fs.writeFileSync(path.join(root, 'web/search-index.json'), JSON.stringify(index));
  fs.writeFileSync(path.join(root, 'web/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', ...pages.map(page => `/docs/${page.slug}.html`)].map(url => `<url><loc>${base}${url}</loc></url>`).join('')}</urlset>\n`);
  console.log(`Built ${pages.length} documentation pages, search index, and sitemap.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildSite();
