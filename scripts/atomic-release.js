const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {activate,recover}=require('../src/services/atomicRelease');
async function main(){
  if(process.platform!=='linux'||process.getuid()!==0)throw new Error('Run this release helper as root on Linux');
  const root=fs.realpathSync(process.env.INSTALL_DIR||'/opt/system-ops'),user=process.env.OPS_USER||'ops';
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(user))throw new Error('Invalid service account');
  const environment=require('dotenv').parse(fs.readFileSync(path.join(root,'.env')));
  const dataDir=process.env.SYSTEM_OPS_DATA_DIR || environment.SYSTEM_OPS_DATA_DIR || path.join(root,'data');
  fs.mkdirSync(dataDir,{recursive:true});
  if(process.argv.includes('--background')) return require('../src/services/updateLauncher').launchUpdate({root,dataDir,script:__filename});
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
      // Validate and install only the exact background launcher permission.
      require(path.join(stage,'scripts','setup-update-permissions')).installUpdatePermissions({root,user});
      },restart,ready});
    // Refresh only the fixed launcher after a healthy activation. Older root
    // wrappers did not forward --background into the active release helper.
    const wrapper=path.join(root,'scripts','deploy.sh'),temporaryWrapper=wrapper+'.next';
    fs.copyFileSync(path.join(stage,'scripts','deploy.sh'),temporaryWrapper);
    fs.chmodSync(temporaryWrapper,0o755);fs.chownSync(temporaryWrapper,0,0);fs.renameSync(temporaryWrapper,wrapper);
    console.log(`=== Update successful: ${commit} ===`);
  } catch(error){if(oldConfig)fs.writeFileSync(previousDropin,oldConfig);else if(fs.existsSync(previousDropin))fs.unlinkSync(previousDropin);execFileSync('systemctl',['daemon-reload']);throw error;}
}
function recordResult(success,message) {
  const root=process.env.INSTALL_DIR||'/opt/system-ops';
  const environment=require('dotenv').parse(fs.readFileSync(path.join(root,'.env')));
  const dir=process.env.SYSTEM_OPS_DATA_DIR||environment.SYSTEM_OPS_DATA_DIR||path.join(root,'data');
  fs.mkdirSync(dir,{recursive:true});
  const filename=path.join(dir,'update-result.json'),temporary=filename+'.tmp';
  fs.writeFileSync(temporary,JSON.stringify({phase:success?'success':'failed',success,failed:!success,message,needsRefresh:success,finishedAt:new Date().toISOString()}),{mode:0o640,flush:true});
  const user=process.env.OPS_USER||'ops';
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(user))throw new Error('Invalid service account');
  fs.chownSync(temporary,Number(execFileSync('id',['-u',user],{encoding:'utf8'})),Number(execFileSync('id',['-g',user],{encoding:'utf8'})));
  fs.renameSync(temporary,filename);
  const lock=path.join(dir,'.update.lock');if(fs.existsSync(lock))fs.unlinkSync(lock);
}
main().then(result=>{if(!result?.queued)recordResult(true,'Update complete. Refresh to load the new version.');}).catch(error=>{
  console.error(`=== Update failed: ${error.message} ===`);
  if(!process.argv.includes('--background'))try{recordResult(false,error.message);}catch(statusError){console.error(`Could not record update result: ${statusError.message}`);}
  process.exitCode=1;
});
