const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DurableStore}=require('../src/services/durableStore');
test('SQLite schema, settings, zero-valued rollups and history recover after restart',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ops-sqlite-')),filename=path.join(dir,'data.sqlite');
  let store=new DurableStore(filename);
  try {
    assert.equal(store.status().available,true);assert.equal(store.saveSetting('settings',{siteName:'persisted'}),true);
    store.metrics({cpu:0,ram:10},60000);store.metrics({cpu:10,ram:30},65000);
    store.close();store=new DurableStore(filename);
    assert.equal(store.setting('settings').siteName,'persisted');
    assert.deepEqual(store.history().cpu.map(row=>row.value),[5]);assert.equal(store.history().cpu[0].samples,2);
    const {StateStore}=require('../src/core/stateStore');const state=new StateStore({persistence:store});assert.equal(state.history.cpu.length,1);
  } finally {store.close();for(const file of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,file));fs.rmdirSync(dir);}
});
test('history and observation retention bound rows and outage/recovery persists one incident',()=>{
  const store=new DurableStore(':memory:',{historyLimit:3,observationLimit:3});
  try {
    assert.equal(store.saveCheck({id:'app'}),true);
    for(let i=0;i<10;i++){store.metrics({cpu:i},i*60000);store.observation('app',{status:i<8?'down':'up',error:'failure'},i*60000);}
    assert.equal(store.history().cpu.length,3);assert.equal(store.observations('app').length,3);
    assert.equal(store.incidents().length,1);assert.equal(store.incidents()[0].closed,8*60000);
    assert.equal(store.removeCheck('app'),true);assert.equal(store.incidents().length,0);
  }finally{store.close();}
});
test('read-only/full-storage failures are visible and do not claim successful writes',()=>{
  const store=new DurableStore(':memory:');
  try {
    store.db.exec('PRAGMA query_only=ON');assert.equal(store.metrics({cpu:1}),false);
    assert.equal(store.status().available,false);assert.match(store.status().error,/readonly/i);
    assert.equal(store.saveSetting('settings',{}),false);
  }finally{store.close();}
});
test('unknown future schemas and corrupt databases are not overwritten',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ops-schema-'));const filename=path.join(dir,'db');
  let store=new DurableStore(filename);store.db.exec('PRAGMA user_version=99');store.close();
  store=new DurableStore(filename);assert.equal(store.status().available,false);assert.match(store.status().error,/newer/);store.close();
  fs.unlinkSync(filename);fs.writeFileSync(filename,'corrupt');store=new DurableStore(filename);assert.equal(store.status().available,false);assert.equal(fs.readFileSync(filename,'utf8'),'corrupt');
  store.close();for(const file of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,file));fs.rmdirSync(dir);
});
