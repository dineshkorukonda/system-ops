const path=require('node:path');
function launchUpdate({root,dataDir,script,execute=require('node:child_process').execFileSync}) {
  if(!path.isAbsolute(root)||!path.isAbsolute(dataDir)||!path.isAbsolute(script)||[root,dataDir,script].some(value=>/[\n\r\0]/.test(value)))throw new Error('Invalid update paths');
  const args=['--unit=system-ops-update','--collect','--property=Type=exec',
    `--property=StandardOutput=append:${path.join(dataDir,'update.log')}`,'--property=StandardError=inherit',
    `--setenv=INSTALL_DIR=${root}`,`--setenv=SYSTEM_OPS_DATA_DIR=${dataDir}`,'--setenv=SYSTEM_OPS_UPDATE_UNIT=1',
    '/usr/bin/node',script];
  execute('systemd-run',args,{stdio:'inherit'});
  return {queued:true,unit:'system-ops-update.service'};
}
module.exports={launchUpdate};
