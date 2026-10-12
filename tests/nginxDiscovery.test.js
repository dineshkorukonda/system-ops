const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),path = require('node:path'),os=require('node:os');
test('active Nginx configs discover custom access logs and certificates after nested locations', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ops-nginx-'));
  const previous=process.env.NGINX_CONFIG_DIRS;process.env.NGINX_CONFIG_DIRS=dir;
  const log=path.join(dir,'custom-access.log'), cert=path.join(dir,'cert.pem');
  try {
    fs.writeFileSync(path.join(dir,'site.conf'),`# server_name commented.example;\nserver { server_name live.example; location / { proxy_pass http://localhost; } ssl_certificate "${cert.replaceAll('\\','/')}"; access_log "${log.replaceAll('\\','/')}" combined; }`);
    const {discoverNginxDomains,discoverNginxSslMap,discoverNginxLogFiles}=require('../src/utils/domainDiscovery');
    assert.deepEqual(discoverNginxDomains(),['live.example']);
    assert.equal(discoverNginxSslMap().get('live.example'),cert.replaceAll('\\','/'));
    assert.ok(discoverNginxLogFiles().some(file=>file.replaceAll('\\','/')===log.replaceAll('\\','/')));
  } finally { if(previous===undefined)delete process.env.NGINX_CONFIG_DIRS;else process.env.NGINX_CONFIG_DIRS=previous;fs.unlinkSync(path.join(dir,'site.conf'));fs.rmdirSync(dir); }
});
