const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const {VIEWS}=require('../../src/client/lib/navigation.mjs');
async function fixture(page) {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const capabilities=Object.fromEntries(['pm2','docker','systemd','tls','traffic','security','databases','backups','ollama','certbot','osUpdates'].map(key=>[key,{available:true,enabled:true,status:'detected',evidence:[{target:`Fixture ${key}`,readable:true}],count:null}]));
  capabilities.ollama.available=false;capabilities.ollama.enabled=false;
  await page.route('**/api/v2/system/capabilities',route=>route.fulfill({json:capabilities}));
  await page.goto('/');await page.getByPlaceholder('Enter console password...').fill('ui-fixture-password');
  await page.getByRole('button',{name:'AUTHENTICATE',exact:true}).click();
  await expect(page.getByRole('heading',{name:'A clearer view of what’s running.'})).toBeVisible();
  await page.getByLabel('Refresh interval').selectOption('0');
  return {errors,capabilities};
}
test('detected-first onboarding, categories, preferences, monitoring errors and rescan',async({page})=>{
  const {errors,capabilities}=await fixture(page);
  const docker=page.getByRole('article',{name:'Docker',exact:true});
  await expect(docker).toBeVisible();await expect(page.getByRole('article',{name:'Ollama',exact:true})).toHaveCount(0);
  await page.getByLabel('Show undetected sources').check();await expect(page.getByRole('article',{name:'Ollama',exact:true})).toBeVisible();
  await docker.getByLabel('Show in navigation').uncheck();
  await page.reload();await expect(page.getByRole('article',{name:'Docker',exact:true}).getByLabel('Show in navigation')).not.toBeChecked();
  await page.getByRole('article',{name:'Docker',exact:true}).getByLabel('Show in navigation').check();
  await page.route('**/api/v2/settings',route=>route.request().method()==='PUT'?route.fulfill({status:500,json:{error:'Fixture settings failure'}}):route.continue());
  await page.getByRole('article',{name:'Docker',exact:true}).getByRole('button',{name:'Disable monitoring'}).click();
  await expect(page.getByRole('alert')).toContainText('Fixture settings failure');
  await page.unroute('**/api/v2/settings');
  await page.route('**/api/v2/settings',async route=>{
    if(route.request().method()!=='PUT')return route.continue();
    const response=await route.fetch();capabilities.docker.enabled=false;capabilities.docker.status='disabled';await route.fulfill({response});
  });
  await page.getByRole('article',{name:'Docker',exact:true}).getByRole('button',{name:'Disable monitoring'}).click();
  await expect(page.getByRole('article',{name:'Docker',exact:true}).getByRole('button',{name:'Enable monitoring'})).toBeVisible();
  await page.getByRole('button',{name:'Rescan server'}).click();
  await expect(page.getByRole('button',{name:'Rescan server'})).toBeEnabled();
  expect(errors).toEqual([]);
});
for(const theme of ['dark','light']) test(`${theme}: all feature views render, navigation works and controls remain readable`,async({page})=>{
  const {errors}=await fixture(page);
  if(theme==='light')await page.getByRole('button',{name:'Switch to light theme'}).click();
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  const audit=await new AxeBuilder({page}).include('.app-sidebar').include('.app-topbar').include('.discovery-view').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({path:`artifacts/ui/overview-${theme}.png`,fullPage:true});
  for(const id of Object.keys(VIEWS).filter(id=>id!=='discovery')) {
    await page.goto(`/#${id}`);
    await expect(page.locator('.view-heading h1')).toHaveText(VIEWS[id][0]);
    await expect(page.locator('main')).toBeVisible();
    const noOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
    expect(noOverflow,`${id} desktop overflow`).toBe(true);
    if(id==='settings') {
      await page.getByPlaceholder('system-ops',{exact:true}).fill('Fixture workspace');
      await page.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();
      await expect(page.getByText('Settings saved',{exact:true})).toBeVisible();
    }
  }
  expect(errors).toEqual([]);
});
test('PM2 duplicate names use exact IDs, SSL observations and source failures stay visible',async({page})=>{
  await fixture(page);
  await page.route('**/api/v2/pm2/snapshot',route=>route.fulfill({json:{allUsers:[{user:'deploy',processes:[0,1].map(id=>({pm_id:id,name:'same-name',pid:id+20,status:'online',memory:1024,memoryFormatted:'1 KiB',restart_time:0,cpu:0,uptimeText:'1m'}))},{user:'root',processes:[],error:'Fixture permission denied'}]}}));
  let requested=[];await page.route('**/api/v2/pm2/logs?*',route=>{requested.push(new URL(route.request().url()).searchParams.get('app'));return route.fulfill({json:{output:'Fixture log for ID '+requested.at(-1)}});});
  await page.goto('/#pm2');await expect(page.getByText('Fixture permission denied')).toBeVisible();
  expect(requested).toEqual([]);await page.getByRole('button',{name:/same-name.*ID: 1/}).click();
  await expect(page).toHaveURL(/#pm2\/deploy\/1$/);await expect(page.getByText('Fixture log for ID 1')).toBeVisible();
  await page.reload();await expect(page.getByText('Fixture log for ID 1')).toBeVisible();
  await page.route('**/api/v2/docker/snapshot',route=>route.fulfill({status:503,json:{error:'Fixture Docker daemon stopped'}}));
  await page.goto('/#docker');await expect(page.getByRole('alert')).toContainText('Fixture Docker daemon stopped');
  await page.route('**/api/v2/system/snapshot',async route=>{
    const response=await route.fetch(), body=await response.json();
    body.tls=[{target:'fixture.example',source:'file',valid:false,statusText:'EXPIRED',formattedValidTo:'Oct 1, 2026',issuer:'Fixture issuer'}];
    await route.fulfill({json:body});
  });
  await page.goto('/#tls');await expect(page.getByText('fixture.example',{exact:true})).toBeVisible();await expect(page.getByText('EXPIRED',{exact:true})).toBeVisible();
});
test('mobile category navigation, light theme, empty discovery and login/logout',async({page})=>{
  await page.setViewportSize({width:390,height:844});await fixture(page);
  await page.getByRole('button',{name:'Switch to light theme'}).click();
  await page.getByRole('button',{name:'Open navigation'}).click();
  await page.locator('.app-sidebar').getByRole('button',{name:/Host/}).click();
  await expect(page.locator('.view-heading h1')).toHaveText('Resources');
  await page.getByRole('button',{name:'Processes',exact:true}).click();
  await expect(page.locator('.view-heading h1')).toHaveText('Processes');
  for(const id of Object.keys(VIEWS).filter(id=>id!=='discovery')) {
    await page.goto(`/#${id}`);await expect(page.locator('.view-heading h1')).toHaveText(VIEWS[id][0]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${id} mobile overflow`).toBe(true);
  }
  await page.goto('/#discovery');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/ui/mobile-light.png',fullPage:true});
  await page.getByRole('button',{name:'Log out'}).click();await expect(page.getByRole('button',{name:'AUTHENTICATE'})).toBeVisible();
});
test('empty discovery and capability API failures are explicit, keyboard navigation reaches content',async({page})=>{
  await fixture(page);
  await page.route('**/api/v2/system/capabilities',route=>route.fulfill({json:{}}));
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(page.getByRole('heading',{name:'No sources detected in this category'})).toBeVisible();
  await page.route('**/api/v2/system/capabilities',route=>route.fulfill({status:503,json:{error:'Fixture discovery unavailable'}}));
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Fixture discovery unavailable');
  await page.locator('.skip-link').focus();await page.keyboard.press('Enter');await expect(page.locator('main')).toBeFocused();
});
