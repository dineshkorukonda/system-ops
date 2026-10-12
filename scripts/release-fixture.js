const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),net=require('node:net');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {activate,recover}=require('../src/services/atomicRelease');
async function main(){
  if(process.env.CI!=='true'||process.platform!=='linux')throw new Error('Release fixture requires disposable Linux CI');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ops-release-live-')),source=fs.realpathSync('.');
  fs.mkdirSync(path.join(root,'releases'));fs.mkdirSync(path.join(root,'data'));fs.writeFileSync(path.join(root,'data','receipt'),'preserve-me');
  const password=crypto.randomBytes(24).toString('hex');
  for(const name of ['old','new','bad']){
    const release=path.join(root,'releases',name);
    fs.cpSync(source,release,{recursive:true,filter:file=>!['.git','node_modules','data','artifacts','test-results','playwright-report','.env','.env.docker'].includes(path.relative(source,file).split(path.sep)[0])});
    fs.symlinkSync(path.join(source,'node_modules'),path.join(release,'node_modules'),'dir');
  }
  fs.writeFileSync(path.join(root,'releases','bad','src','start.js'),"require('http').createServer((req,res)=>{res.statusCode=503;res.end('injected readiness failure')}).listen(process.env.PORT,'127.0.0.1');");
  const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  fs.symlinkSync(path.join(root,'releases','old'),path.join(root,'current'),'dir');let child;
  const stop=async()=>{if(child&&child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}child=null;};
  const restart=async()=>{await stop();child=spawn(process.execPath,[path.join(root,'current','src','start.js')],{cwd:path.join(root,'current'),stdio:'ignore',env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),APP_PASSWORD:password,SESSION_SECRET:crypto.randomBytes(32).toString('hex'),SYSTEM_OPS_DATA_DIR:path.join(root,'data'),ENABLE_GO_COLLECTOR:'false'}});};
  const ready=async()=>{for(let i=0;i<40;i++){try{const response=await fetch(`http://127.0.0.1:${port}/ready`,{signal:AbortSignal.timeout(300)});if(response.ok)return true;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}return false;};
  try{
    await restart();if(!await ready())throw new Error('Initial real production process failed readiness');
    const oldAssets=fs.readFileSync(path.join(root,'releases','old','dist','index.html'),'utf8');
    await activate({root,release:path.join(root,'releases','new'),validate:async release=>{if(!fs.existsSync(path.join(release,'dist','index.html')))throw new Error('Missing built artifact');},restart,ready});
    let rolledBack=false;try{await activate({root,release:path.join(root,'releases','bad'),validate:async()=>{},restart,ready});}catch(error){if(error.message.includes('rolled back'))rolledBack=true;else throw error;}
    if(!rolledBack||!fs.realpathSync(path.join(root,'current')).endsWith('/new'))throw new Error('Readiness failure did not restore release');
    fs.writeFileSync(path.join(root,'.release-journal.json'),JSON.stringify({previous:path.join(root,'releases','old'),release:path.join(root,'releases','bad')}));await recover({root,restart,ready});
    if(fs.readFileSync(path.join(root,'data','receipt'),'utf8')!=='preserve-me'||fs.readFileSync(path.join(root,'releases','old','dist','index.html'),'utf8')!==oldAssets)throw new Error('Shared data or old assets changed');
    fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/release-fixture.json',JSON.stringify({platform:process.platform,node:process.version,verified:['real production startup/readiness','atomic upgrade activation','failed readiness restores previous real process','interrupted upgrade journal recovery','shared data and prior assets preserved'],limitations:['No live systemd host was upgraded. Installer/account/sudoers permissions still require native-host verification.']},null,2));console.log('PASS: real process upgrade, rollback and interruption recovery');
  }finally{await stop();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
