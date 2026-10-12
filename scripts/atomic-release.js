const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {activate,recover}=require('../src/services/atomicRelease');
async function main(){
  if(process.platform!=='linux'||process.getuid()!==0)throw new Error('Run this release helper as root on Linux');
  const root=fs.realpathSync(process.env.INSTALL_DIR||'/opt/system-ops'),user=process.env.OPS_USER||'ops';
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(user))throw new Error('Invalid service account');
  fs.mkdirSync(path.join(root,'releases'),{recursive:true});
  const run=(file,args,cwd=root,extraEnv={})=>execFileSync('runuser',['-u',user,'--',file,...args],{cwd,stdio:'inherit',env:{...process.env,NODE_ENV:'development',...extraEnv}});
  fs.accessSync(path.join(root,'.env'),fs.constants.R_OK);
  const dropin='/etc/systemd/system/system-ops.service.d',previousDropin=path.join(dropin,'release.conf');
  const restart=async()=>{fs.mkdirSync(dropin,{recursive:true});fs.writeFileSync(previousDropin,`[Service]\nWorkingDirectory=${root}/current\nExecStart=\nExecStart=/usr/bin/node ${root}/current/src/start.js\n`);execFileSync('systemctl',['daemon-reload'],{stdio:'inherit'});execFileSync('systemctl',['restart','system-ops.service'],{stdio:'inherit'});};
  const credentials=require('dotenv').parse(fs.readFileSync(path.join(root,'.env')));
  const ready=async()=>{const url=process.env.READINESS_URL||'http://127.0.0.1:9080/ready';for(let i=0;i<90;i++){try{const response=await fetch(url,{signal:AbortSignal.timeout(1000),redirect:'manual'});if(response.ok){
    const current=fs.existsSync(path.join(root,'current'))?fs.realpathSync(path.join(root,'current')):root;
    if(!fs.existsSync(path.join(current,'src','services','durableStore.js')))return true;
    const history=await fetch(new URL('/api/v2/history',url),{headers:{Authorization:`Bearer ${credentials.APP_PASSWORD}`},signal:AbortSignal.timeout(1000),redirect:'manual'});if(history.ok)return true;
  }}catch{}await new Promise(resolve=>setTimeout(resolve,1000));}return false;};
  await recover({root,restart,ready});
  run('git',['fetch','origin','main']);
  const uid=Number(execFileSync('id',['-u',user],{encoding:'utf8'}).trim()),gid=Number(execFileSync('id',['-g',user],{encoding:'utf8'}).trim());
  const commit=execFileSync('runuser',['-u',user,'--','git','rev-parse','origin/main'],{cwd:root,encoding:'utf8'}).trim();if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('Invalid release revision');
  const stage=fs.mkdtempSync(path.join(root,'releases',`.stage-${commit}-`));fs.chownSync(stage,uid,gid);fs.chmodSync(stage,0o700);
  const archive=path.join(stage,'.source.tar');const source=execFileSync('runuser',['-u',user,'--','git','archive',commit],{cwd:root,maxBuffer:64*1024*1024});fs.writeFileSync(archive,source);fs.chownSync(archive,uid,gid);
  run('tar',['--no-same-owner','-xf',archive,'-C',stage],stage);fs.unlinkSync(archive);
  fs.writeFileSync(path.join(stage,'.release-revision'),commit+'\n');
  for(const [name,target] of [['.env',path.join(root,'.env')],['data',path.join(root,'data')]]){
    if(fs.existsSync(path.join(stage,name)))throw new Error(`Release contains tracked ${name}; refusing shared-data replacement`);
    if(name==='data'){fs.mkdirSync(target,{recursive:true});fs.chownSync(target,uid,gid);}
    fs.symlinkSync(target,path.join(stage,name));
  }
  const oldConfig=fs.existsSync(previousDropin)?fs.readFileSync(previousDropin):null;
  try {
    await activate({root,release:stage,validate:async()=>{
      const testData=fs.mkdtempSync(path.join(stage,'.validation-data-'));fs.chownSync(testData,uid,gid);
      run('npm',['ci'],stage);run('npm',['test'],stage,{NODE_ENV:'test',SYSTEM_OPS_DATA_DIR:testData});run('npm',['run','build'],stage);run('npm',['run','test:smoke'],stage);
      },restart,ready});
    console.log(`=== Update successful: ${commit} ===`);
  } catch(error){if(oldConfig)fs.writeFileSync(previousDropin,oldConfig);else if(fs.existsSync(previousDropin))fs.unlinkSync(previousDropin);execFileSync('systemctl',['daemon-reload']);throw error;}
}
main().catch(error=>{console.error(`=== Update failed: ${error.message} ===`);process.exitCode=1;});
