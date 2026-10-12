const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function approved(root,target,{legacy=false}={}) {
  const base=fs.realpathSync(root),actual=fs.realpathSync(target),releases=fs.realpathSync(path.join(base,'releases'));
  const relative=path.relative(releases,actual);
  if(legacy&&actual===base)return actual;
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||relative.split(path.sep).length!==1)throw new Error('Release must be a direct directory inside the release root');
  if(!fs.statSync(actual).isDirectory())throw new Error('Release is not a directory');return actual;
}
function switchPointer(root,target) {
  approved(root,target,{legacy:true});const current=path.join(root,'current');
  if(fs.existsSync(current)&&!fs.lstatSync(current).isSymbolicLink())throw new Error('Current path is not a symlink; refusing replacement');
  const temporary=path.join(root,`.current-${crypto.randomUUID()}`);
  fs.symlinkSync(target,temporary,'dir');fs.renameSync(temporary,current);
}
function journalFile(root){return path.join(root,'.release-journal.json');}
async function recover({root,restart,ready}) {
  const file=journalFile(root);if(!fs.existsSync(file))return false;
  const journal=JSON.parse(fs.readFileSync(file,'utf8'));const previous=approved(root,journal.previous,{legacy:true});
  switchPointer(root,previous);await restart();if(!await ready())throw new Error('Interrupted-upgrade rollback did not become ready; journal retained');fs.unlinkSync(file);return true;
}
async function activate({root,release,validate,restart,ready}) {
  if(process.platform==='win32')throw new Error('Atomic symlink release activation requires Linux');
  await recover({root,restart,ready});release=approved(root,release);
  // Build/smoke validation precedes every change to the active pointer.
  await validate(release);
  const current=path.join(root,'current'),previous=fs.existsSync(current)?approved(root,current,{legacy:true}):fs.realpathSync(root);
  const file=journalFile(root),temporary=file+'.tmp';fs.writeFileSync(temporary,JSON.stringify({previous,release}),{mode:0o600,flush:true});fs.renameSync(temporary,file);
  try {switchPointer(root,release);await restart();if(!await ready())throw new Error('Candidate failed readiness gate');fs.unlinkSync(file);return {success:true,release,previous};}
  catch(error){switchPointer(root,previous);await restart();if(!await ready())throw new Error(`Upgrade failed and rollback is not ready: ${error.message}; journal retained`);fs.unlinkSync(file);throw new Error(`Upgrade rolled back: ${error.message}`);}
}
module.exports={approved,switchPointer,activate,recover};
