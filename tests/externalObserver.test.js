const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {execFile}=require('node:child_process');
function observe(url){return new Promise((resolve,reject)=>execFile(process.execPath,['scripts/external-observer.js',url,'--once'],{env:{...process.env},timeout:10000},(error,stdout)=>error?reject(error):resolve(JSON.parse(stdout))));}
test('independent observer process detects endpoint loss while console reporting is unavailable',async()=>{
  const server=http.createServer((req,res)=>res.end('ready'));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
  try{assert.equal((await observe(url)).status,'up');}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  assert.equal((await observe(url)).status,'down');
});
