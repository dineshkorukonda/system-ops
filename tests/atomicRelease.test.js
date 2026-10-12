const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {activate,recover}=require('../src/services/atomicRelease');
function setup(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ops-release-'));fs.mkdirSync(path.join(root,'releases'));for(const name of ['old','new']){fs.mkdirSync(path.join(root,'releases',name));fs.writeFileSync(path.join(root,'releases',name,'asset'),name);}fs.symlinkSync(path.join(root,'releases','old'),path.join(root,'current'),'dir');return root;}
// Production symlink activation targets Ubuntu. Windows has different rename semantics.
test('candidate build failure preserves the active release and its assets',{skip:process.platform==='win32'},async()=>{
  const root=setup();let restarts=0;
  await assert.rejects(activate({root,release:path.join(root,'releases','new'),validate:async()=>{throw new Error('build failed');},restart:async()=>restarts++,ready:async()=>true}),/build failed/);
  assert.equal(fs.readFileSync(path.join(root,'current','asset'),'utf8'),'old');assert.equal(restarts,0);
});
test('successful activation and failed readiness rollback preserve prior artifacts',{skip:process.platform==='win32'},async()=>{
  const root=setup();let attempts=0;
  await assert.rejects(activate({root,release:path.join(root,'releases','new'),validate:async()=>{},restart:async()=>{},ready:async()=>++attempts>1}),/rolled back/);
  assert.equal(fs.readFileSync(path.join(root,'current','asset'),'utf8'),'old');
  await activate({root,release:path.join(root,'releases','new'),validate:async()=>{},restart:async()=>{},ready:async()=>true});assert.equal(fs.readFileSync(path.join(root,'current','asset'),'utf8'),'new');
});
test('interrupted activation journal recovers the previous pointer; outside roots are refused',{skip:process.platform==='win32'},async()=>{
  const root=setup(),old=path.join(root,'releases','old'),candidate=path.join(root,'releases','new');fs.unlinkSync(path.join(root,'current'));fs.symlinkSync(candidate,path.join(root,'current'),'dir');fs.writeFileSync(path.join(root,'.release-journal.json'),JSON.stringify({previous:old,release:candidate}));
  assert.equal(await recover({root,restart:async()=>{},ready:async()=>true}),true);assert.equal(fs.readFileSync(path.join(root,'current','asset'),'utf8'),'old');
  await assert.rejects(activate({root,release:os.tmpdir(),validate:async()=>{},restart:async()=>{},ready:async()=>true}),/inside/);
});
