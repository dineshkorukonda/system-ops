// Explicit asset capture only: use the actual console with sanitized demo responses.
const {test,expect}=require('@playwright/test');
test('capture resources and availability views for the public product tour',async({page})=>{
  test.skip(process.env.CAPTURE_MARKETING!=='true','Run explicitly when updating marketing screenshots.');
  const fixed=Date.parse('2026-10-14T09:00:00Z');
  const collection={status:'healthy',fresh:true,lastSuccess:new Date().toISOString(),staleAfterMs:60000,source:'Demo host collection',ageMs:0};
  const capabilities=Object.fromEntries(['pm2','docker','systemd','tls','traffic','security','databases','backups','certbot','osUpdates'].map(key=>[key,{available:true,enabled:true,status:'detected',evidence:[{target:'Demo '+key,readable:true}]}]));
  capabilities.ollama={available:false,enabled:false};
  await page.route('**/api/v2/system/capabilities',route=>route.fulfill({json:capabilities}));
  await page.route('**/api/v2/ops/health',route=>route.fulfill({json:{ok:true,collectors:{system:{enabled:true,critical:true,...collection},processes:{enabled:true,critical:true,...collection}}}}));
  let sample=0;
  await page.route('**/api/v2/system/snapshot',route=>route.fulfill({json:{
    collection,persistence:{available:true},monitoringHealth:{ok:true,collectors:{system:{enabled:true,critical:true,...collection}}},history:{cpu:[18,24,21,29,33,25,42,31,22,28,19,23,35,38,29,22,31,25,20,23].map(value=>({value})),ram:[28,29,30].map(value=>({value})),swap:[0,0,0].map(value=>({value}))},uptime:{cpuPercent:[18,24,21,29,33,25,42,31,22,28,19,23][sample++%12],cpus:4,load1m:0.42,load5m:0.51,load15m:0.46,uptimeText:'12d 4h',hostname:'demo-vps'},
    memory:{formattedUsed:'2.4 GiB',formattedTotal:'8 GiB',usagePercent:30},swap:{formattedUsed:'0 B',formattedTotal:'2 GiB',usagePercent:0},
    disk:[{path:'/',filesystem:'/dev/vda1',formattedUsed:'18.6 GiB',formattedTotal:'80 GiB',percent:23}],
    services:['nginx','postgresql','system-ops'].map((name,i)=>({fullUnit:name+'.service',isActive:true,activeState:'active',formattedMemory:['12 MiB','84 MiB','46 MiB'][i],pid:100+i})),
    ports:[{name:'PostgreSQL',host:'127.0.0.1',port:5432,bound:true}],tls:[]
  }}));
  await page.route('**/api/v2/system/updates',route=>route.fulfill({json:{available:true,pendingCount:0,collection}}));
  await page.route('**/api/v2/checks',route=>route.fulfill({json:{persistence:{available:true},checks:[
    {id:'web',name:'Website',url:'https://demo.example',type:'http',status:'up',enabled:true,availability:{uptimePercent:99.96,coveragePercent:98.4,unknownMs:1382400},lastObservation:{time:fixed}},
    {id:'api',name:'Application API',url:'https://api.example/health',type:'http',status:'down',enabled:true,availability:{uptimePercent:98.75,coveragePercent:98.4,unknownMs:1382400},lastObservation:{time:fixed,error:'HTTP 503 — service unavailable'}},
    {id:'database',name:'PostgreSQL',host:'127.0.0.1',port:5432,type:'tcp',status:'up',enabled:true,availability:{uptimePercent:100,coveragePercent:98.4,unknownMs:1382400},lastObservation:{time:fixed}}
  ],incidents:[{id:1,check_id:'api',reason:'HTTP 503 — service unavailable',opened:fixed-120000,closed:null,acknowledged:false}]}}));
  await page.setViewportSize({width:1440,height:960});
  await page.goto('/');
  await page.getByLabel('Access password').fill('ui-fixture-password');
  await page.getByRole('button',{name:'Initialize Secure Session',exact:true}).click();
  await expect(page.getByRole('heading',{name:'A clearer view of what’s running.'})).toBeVisible();
  await page.getByLabel('Refresh interval').selectOption('0');
  await page.goto('/#system');
  await expect(page.getByText('CPU UTILIZATION',{exact:true})).toBeVisible();
  for(let i=0;i<11;i++){
    const response=page.waitForResponse(url=>url.url().endsWith('/api/v2/system/snapshot'));
    await page.getByRole('button',{name:'Refresh telemetry',exact:true}).click();await response;
  }
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:'artifacts/marketing/resources.png'});
  await page.goto('/#checks');
  await expect(page.getByRole('heading',{name:'Application API',exact:true})).toBeVisible();
  await page.screenshot({path:'artifacts/marketing/checks.png'});
});
