const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {validateCheck,probe,availability,CheckService}=require('../src/services/checkService');
const {DurableStore}=require('../src/services/durableStore');
test('check validation rejects unsafe schemes, credentials and invalid scheduling',()=>{
  assert.throws(()=>validateCheck({id:'x',type:'http',url:'file:///etc/passwd'}));
  assert.throws(()=>validateCheck({id:'x',type:'http',url:'http://user:pw@localhost'}));
  assert.throws(()=>validateCheck({id:'x',type:'tcp',host:'localhost',port:0}));
  assert.throws(()=>validateCheck({id:'x',type:'tcp',host:'localhost',port:80,intervalMs:1}));
});
test('actual HTTP/TCP success, expected content, redirect/body bounds, outage and deadlines',async()=>{
  const server=http.createServer((req,res)=>{if(req.url==='/hang')return;if(req.url==='/large')return res.end('x'.repeat(70000));if(req.url==='/redirect'){res.writeHead(302,{Location:'/'});return res.end();}res.end('fixture ready');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
  // Successful I/O should not race the minimum timeout on a busy server.
  // Exercise the short deadline separately against an endpoint that never replies.
  const config=validateCheck({id:'web',type:'http',url:`http://127.0.0.1:${port}`,expectedText:'fixture ready',timeoutMs:2000});
  try {
    assert.equal((await probe(config)).status,'up');assert.equal((await probe({...config,type:'tcp',host:'127.0.0.1',port})).status,'up');
    assert.equal((await probe({...config,url:config.url+'redirect'})).status,'down');
    assert.match((await probe({...config,url:config.url+'large'})).error,/limit/);
    const hanging=await probe({...config,url:config.url+'hang',timeoutMs:100});
    assert.equal(hanging.status,'down');
    assert.match(hanging.error,/timeout|aborted/i);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  assert.equal((await probe(config)).status,'down');
});
test('availability denominator excludes unknown gaps and caps last observation validity',()=>{
  const result=availability([{time:0,status:'up'},{time:100,status:'down'}],{intervalMs:100},0,500);
  assert.equal(result.upMs,100);assert.equal(result.downMs,150);assert.equal(result.unknownMs,250);assert.equal(result.uptimePercent,40);
  assert.equal(availability([],{intervalMs:100},0,500).uptimePercent,null);
});
test('bounded due checks, outage deduplication, maintenance and recovery lifecycle',async()=>{
  let now=1000,status='down';const store=new DurableStore(':memory:');
  const config=validateCheck({id:'app',type:'tcp',host:'localhost',port:80});store.saveCheck(config);
  const service=new CheckService(store,{now:()=>now,probeFn:async()=>({status,error:status==='down'?'fixture outage':null})});
  try {
    await service.runDue();now+=60000;await service.runDue();assert.equal(store.incidents().length,1);
    store.saveCheck({...config,maintenanceUntil:now+120000});now+=60000;await service.runDue();assert.equal(service.snapshot().checks[0].status,'maintenance');
    now+=120000;status='up';await service.runDue();assert.ok(store.incidents()[0].closed);assert.equal(service.snapshot().checks[0].status,'up');
    now+=120000;assert.equal(service.snapshot().checks[0].status,'unknown');
  }finally{store.close();}
});
