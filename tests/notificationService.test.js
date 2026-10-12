const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {DurableStore}=require('../src/services/durableStore');const {NotificationService}=require('../src/services/notificationService');
test('real webhook receiver failure/retry, delivery acknowledgement, outage deduplication and recovery',async()=>{
  let code=500;const receipts=[];
  const receiver=http.createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{receipts.push({key:req.headers['idempotency-key'],payload:JSON.parse(body)});res.writeHead(code);res.end();});});
  await new Promise(resolve=>receiver.listen(0,'127.0.0.1',resolve));
  const store=new DurableStore(':memory:');store.saveCheck({id:'web',name:'Fixture web'});let now=1000;
  const service=new NotificationService(store,{env:{SYSTEM_OPS_WEBHOOK_URL:`http://127.0.0.1:${receiver.address().port}`},now:()=>now});
  try{
    store.observation('web',{status:'down',error:'fixture failure'},now);await service.run();assert.equal(store.deliveryStatus()[0].attempts,1);assert.match(service.status().error,/500/);
    await service.run();assert.equal(receipts.length,1);
    code=200;now+=30000;await service.run();assert.equal(receipts.length,2);assert.equal(receipts[0].key,receipts[1].key);assert.ok(store.deliveryStatus()[0].delivered);
    store.observation('web',{status:'down'},++now);await service.run();assert.equal(receipts.length,2);
    store.observation('web',{status:'up'},++now);await service.run();assert.equal(receipts.at(-1).payload.type,'recovery');
    await service.test();assert.equal(receipts.at(-1).payload.type,'test');
  }finally{store.close();receiver.closeAllConnections();await new Promise(resolve=>receiver.close(resolve));}
});
test('maintenance and acknowledgement suppress unsent alerts; destinations and credentials stay private',async()=>{
  const store=new DurableStore(':memory:');let calls=0;
  store.saveCheck({id:'x',maintenanceUntil:2000});store.observation('x',{status:'down'},1000);
  const service=new NotificationService(store,{env:{SYSTEM_OPS_WEBHOOK_URL:'http://localhost',SYSTEM_OPS_WEBHOOK_TOKEN:'fixture-secret'},now:()=>1000,send:async()=>{calls++;return new Response();}});
  try{await service.run();assert.equal(calls,0);assert.equal(JSON.stringify(service.status()).includes('fixture-secret'),false);store.acknowledge(store.incidents()[0].id);store.db.exec('UPDATE deliveries SET next_attempt=0');await service.run();assert.equal(calls,0);assert.equal(store.deliveryStatus()[0].delivered,-1);}finally{store.close();}
});
