const { test } = require('node:test');
const assert = require('node:assert/strict');
const { discover } = require('../src/collectors/discovery');
const fakeIo = entries => ({ accessSync(target) { const entry = entries[target.replaceAll('\\','/')]; if (!entry) throw Object.assign(new Error(),{code:'ENOENT'}); if (entry === 'denied') throw Object.assign(new Error(),{code:'EACCES'}); } });
test('empty and failed cached objects do not invent installed services or healthy zeros', () => {
  const caps = discover({env:{}, io:fakeIo({}), snapshots:{ollama:{status:null,models:null}, docker:{error:'daemon stopped'},pm2:{allUsers:[{user:'missing',error:'not configured'}]}}});
  assert.equal(caps.ollama.available,false); assert.equal(caps.docker.available,false);
  assert.equal(caps.pm2.available,false); assert.equal(caps.docker.count,null);
  assert.equal(caps.docker.status,'error');
});
test('configured missing sources stay configured, disabled installed sources stay visible', () => {
  const caps = discover({env:{PM2_USERS:'missing',DOCKER_HOST:'tcp://remote:2376',TLS_HOSTS:'example.org'},io:fakeIo({'/var/log/nginx/custom.log':true}),pm2Users:['missing'],logPaths:['/var/log/nginx/custom.log']});
  assert.equal(caps.pm2.status,'configured');assert.equal(caps.pm2.available,false);
  assert.equal(caps.docker.status,'configured');assert.equal(caps.tls.status,'configured');
  assert.equal(caps.traffic.status,'disabled'); assert.equal(caps.traffic.available,true);
});
test('rootless Docker, explicit PM2 home and denied certificate/log access retain evidence', () => {
  const caps = discover({env:{XDG_RUNTIME_DIR:'/run/user/1000',PM2_HOME:'/srv/private-pm2'},io:fakeIo({'/run/user/1000/docker.sock':true,'/srv/private-pm2':true,'/logs/access.log':'denied','/cert/site.pem':'denied'}),logPaths:['/logs/access.log'],sslPaths:['/cert/site.pem']});
  assert.equal(caps.docker.available,true); assert.equal(caps.pm2.available,true);
  assert.equal(caps.traffic.permissionIssue,true);assert.equal(caps.tls.status,'error');
  assert.match(caps.tls.evidence[0].target,/site.pem/);
});
test('monitored PM2 counts preserve zero and incomplete inventory errors', () => {
  const caps=discover({env:{},io:fakeIo({}),enabled:{pm2:true},snapshots:{pm2:{totalProcesses:0,allUsers:[{user:'ok',pm2Path:'/bin/pm2',error:null},{user:'root',error:'denied'}]}},stats:{pm2:{lastSuccess:new Date().toISOString()}}});
  assert.equal(caps.pm2.count,0);assert.equal(caps.pm2.available,true);assert.equal(caps.pm2.status,'error');assert.match(caps.pm2.error,/root: denied/);
});
test('healthy monitored evidence expires instead of reporting permanently healthy', () => {
  const caps=discover({env:{},io:fakeIo({}),enabled:{docker:true},snapshots:{docker:{daemonReachable:true,total:0}},stats:{docker:{lastSuccess:new Date(Date.now()-300000).toISOString()}}});
  assert.equal(caps.docker.status,'stale');assert.equal(caps.docker.count,0);
});
test('category navigation filters missing sources and user preferences without breaking deep links', async () => {
  const {CATEGORIES,visibleViews,routeFromHash}=await import('../src/client/lib/navigation.mjs');
  const apps=CATEGORIES.find(category=>category.id==='apps');
  assert.deepEqual(visibleViews(apps,{pm2:{available:true},docker:{configured:true}}),['pm2','docker']);
  assert.deepEqual(visibleViews(apps,{pm2:{available:true}},['pm2']),[]);
  assert.equal(routeFromHash('#pm2/root/2'),'pm2');assert.equal(routeFromHash('#not-a-view'),'discovery');
});
