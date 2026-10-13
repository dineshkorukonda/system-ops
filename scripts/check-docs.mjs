import fs from 'node:fs';
import path from 'node:path';
import { root, pages, renderMarkdown } from './build-site.mjs';

const failures = [];
const web = path.join(root, 'web');
const files = ['web/index.html', ...pages.map(page => `web/docs/${page.slug}.html`)];
const ids = html => new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
const assert = (condition, message) => { if (!condition) failures.push(message); };
assert(new Set(pages.map(page => page.slug)).size === pages.length, 'Duplicate documentation route');
assert(new Set(pages.map(page => page.source)).size === pages.length, 'Duplicate documentation source');

for (const source of ['README.md', ...pages.map(page => page.source)]) {
  const html = renderMarkdown(source, fs.readFileSync(path.join(root, source), 'utf8'));
  // Repository-relative Markdown references rewritten to GitHub still must exist.
  for (const match of html.matchAll(/(?:href|src)="https:\/\/github\.com\/dineshkorukonda\/system-ops\/blob\/main\/([^"#]+)(?:#[^"]*)?"/g)) {
    const target = match[1].replaceAll('&amp;', '&');
    assert(fs.existsSync(path.join(root, target)), `${source}: missing repository reference ${target}`);
  }
}
for (const file of files) {
  const absolute = path.join(root, file);
  assert(fs.existsSync(absolute), `Missing built page: ${file}`);
  if (!fs.existsSync(absolute)) continue;
  const html = fs.readFileSync(absolute, 'utf8');
  assert(/<html lang="en"/.test(html), `${file}: missing language`);
  assert(/<title>[^<]+<\/title>/.test(html), `${file}: missing title`);
  assert(/name="description"/.test(html), `${file}: missing description`);
  assert(/rel="canonical"/.test(html), `${file}: missing canonical URL`);
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const link = match[1].replaceAll('&amp;', '&');
    if (/^(https?:|mailto:|data:)/.test(link)) continue;
    const [pathname, fragment] = link.split('#');
    const target = pathname ? path.resolve(path.dirname(absolute), pathname) : absolute;
    assert(!path.relative(web, target).startsWith('..'), `${file}: link escapes public site: ${link}`);
    assert(fs.existsSync(target), `${file}: missing public link ${link}`);
    if (fragment && fs.existsSync(target) && target.endsWith('.html')) assert(ids(fs.readFileSync(target, 'utf8')).has(fragment), `${file}: missing anchor ${link}`);
  }
}
assert(fs.existsSync(path.join(web, 'search-index.json')), 'Missing search index');
assert(fs.existsSync(path.join(web, 'sitemap.xml')), 'Missing sitemap');
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`Validated ${files.length} public pages and their local links, anchors, assets, and metadata.`);
