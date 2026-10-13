# Publishing the public site

The public site is static. It publishes product information, documentation, and community policies without serving the authenticated operations API.

## Build and preview

From the repository root with Node.js 24:

```bash
npm ci
npm run docs:build
npm run docs:check
npm run site:dev
```

Open http://127.0.0.1:4174. Keep documentation sources in `docs/` and root community files; update the explicit catalog in `web/pages.json` when adding a guide. Generated HTML/search/sitemap files are ignored by Git and must be built before deployment. Marketing HTML/CSS/JS and the demonstration screenshot are tracked in `web/`.

## Vercel

Set the project's Root Directory to the repository root. The tracked `vercel.json` selects a static build, runs documentation generation/checks, and publishes `web/`. The [official configuration reference](https://vercel.com/docs/project-configuration/vercel-json) documents the build/output overrides. A project configured with `web/` as its root must be changed to the repository root so the generator can read all Markdown sources.

Review the generated preview, including a direct `/docs/quickstart.html` visit, before promoting a deployment. Do not point this static host at `dist/`: that directory contains the authenticated console frontend, not the marketing/docs site. GitHub's existing integration may create previews automatically when a PR changes.

## Other static hosts

Use the same build command at the repository root and publish the complete `web/` directory, including generated `docs/`, `search-index.json`, and `sitemap.xml`. Preserve `.html` paths, serve correct MIME types, and use HTTPS. An Nginx/static-file deployment can use the prepared website archive from `npm run release:pack`; inspect its contents before replacing the live document root.

Publishing the website does not install, update, or operate a VPS console. Do not upload `.env`, data directories, node_modules, test receipts, or backup contents. Live production publication is separate from preparing a reviewable PR.
