// Disposable UI contract fixture. No production services or settings are used.
const os=require('node:os'), fs=require('node:fs'), path=require('node:path');
process.env.NODE_ENV='test';process.env.PORT='19086';process.env.HOST='127.0.0.1';
process.env.APP_PASSWORD='ui-fixture-password';process.env.SESSION_SECRET=require('node:crypto').randomBytes(32).toString('hex');
process.env.ENABLE_GO_COLLECTOR='false';process.env.SYSTEM_OPS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'ops-ui-'));
require('../src/server');
const {collectorManager}=require('../src/core/collectorManager');
Promise.all([collectorManager.runCollector('system'),collectorManager.runCollector('processes'),collectorManager.runCollector('capabilities')]).catch(error=>{console.error(error);process.exitCode=1;});
