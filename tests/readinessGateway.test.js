const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {readinessGateway}=require('../scripts/resource-baseline');
test('public lab gateway exposes only GET readiness and converts source failures to 503',async t=>{
  let status=200;
  const source=http.createServer((req,res)=>{res.statusCode=status;res.end('private upstream response');});
  await new Promise(resolve=>source.listen(0,'127.0.0.1',resolve));
  const gateway=await readinessGateway(`http://127.0.0.1:${source.address().port}`,0);
  t.after(async()=>{source.closeAllConnections();gateway.closeAllConnections();await Promise.all([new Promise(resolve=>source.close(resolve)),new Promise(resolve=>gateway.close(resolve))]);});
  const base=`http://127.0.0.1:${gateway.address().port}`;
  let response=await fetch(base+'/ready');assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
  for(const route of ['/','/api/v2/settings','/ready?token=example'])assert.equal((await fetch(base+route)).status,404);
  assert.equal((await fetch(base+'/ready',{method:'POST'})).status,404);
  status=503;response=await fetch(base+'/ready');assert.equal(response.status,503);assert.deepEqual(await response.json(),{ok:false});
});
