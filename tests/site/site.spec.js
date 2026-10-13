const {test,expect} = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const pages = require('../../web/pages.json');

for (const width of [1440,390]) test(`public site: navigation, docs search, accessibility, and layout at ${width}px`,async({page,context}) => {
  await page.setViewportSize({width,height:1000});
  const errors = [];page.on('pageerror',error => errors.push(error.message));
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1})).toContainText('your VPS');
  await expect(page.locator('.console-image')).toHaveJSProperty('naturalWidth',1440);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Copy installer download command'}).click();
  await expect(page.getByRole('button',{name:'Copy installer download command'})).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('curl -fsSL');
  const homeAudit = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(homeAudit.violations).toEqual([]);
  await page.evaluate(() => {document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});
  await page.screenshot({path:`artifacts/site/home-${width}.png`,fullPage:true});
  await page.getByRole('link',{name:'Read the docs',exact:true}).click();
  await expect(page).toHaveURL(/docs\/index.html$/);
  await page.getByRole('searchbox',{name:'Search documentation'}).fill('rollback');
  await expect(page.locator('.search-results')).toContainText('matching guides');
  await page.locator('.search-results').getByRole('link',{name:/Updates and recovery/}).click();
  await expect(page.getByRole('heading',{level:1})).toHaveText('Updates and recovery');
  if(width<640) await page.getByText('Browse documentation',{exact:true}).click();
  await page.getByRole('navigation',{name:'Documentation guides'}).getByRole('link',{name:'Configuration',exact:true}).click();
  await expect(page.getByRole('heading',{level:1})).toHaveText('Configuration');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const docsAudit = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(docsAudit.violations).toEqual([]);
  await page.evaluate(() => {document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});
  await page.screenshot({path:`artifacts/site/docs-${width}.png`,fullPage:true});
  await page.getByRole('searchbox',{name:'Search documentation'}).fill('zzzznothing');
  await expect(page.locator('.search-results')).toContainText('No matching guides');
  expect(errors).toEqual([]);
});

test('every guide loads directly and remains readable without JavaScript',async({browser}) => {
  const context = await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
  const page = await context.newPage();
  for(const guide of pages) {
    const response = await page.goto(`/docs/${guide.slug}.html`);
    expect(response.status()).toBe(200);
    await expect(page.locator('main h1')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),guide.slug).toBe(true);
  }
  await page.getByText('Browse documentation',{exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Documentation guides'})).toBeVisible();
  await context.close();
});

test('search failure preserves usable documentation navigation',async({page}) => {
  await page.route('**/search-index.json',route=>route.fulfill({status:503,body:'Unavailable'}));
  await page.goto('/docs/index.html');
  await page.getByRole('searchbox',{name:'Search documentation'}).fill('Docker');
  await expect(page.locator('.search-results')).toContainText('Search could not load');
  await expect(page.getByRole('navigation',{name:'Documentation guides'})).toBeVisible();
});
