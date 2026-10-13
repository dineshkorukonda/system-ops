// Run on a different host. Keep receipts there while the monitored console is offline.
const fs=require('node:fs'),path=require('node:path');
async function observe(url) {
  const started=performance.now(),time=Date.now();
  try {const response=await fetch(url,{signal:AbortSignal.timeout(5000),redirect:'manual'});await response.body?.cancel();return {time,status:response.status===200?'up':'down',latencyMs:performance.now()-started,error:response.status===200?null:`HTTP ${response.status}`};}
  catch(error){return {time,status:'down',latencyMs:performance.now()-started,error:error.message.slice(0,1000)};}
}
async function main(){
  const url=new URL(process.argv[2]);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Use HTTP(S) without embedded credentials');
  const filename=process.argv[3] && process.argv[3]!=='--once'?path.resolve(process.argv[3]):null;
  const interval=Math.max(15000,Math.min(3600000,Number(process.env.PROBE_INTERVAL_MS)||60000));
  const duration=Number(process.env.PROBE_SECONDS||0);
  if(!Number.isFinite(duration)||duration<0||duration>21600)throw new Error('PROBE_SECONDS must be 0 (continuous) or at most 21600');
  const deadline=duration ? performance.now()+duration*1000 : Infinity;
  const sample=async()=>{const result=await observe(url.href);if(filename){let rows=[];try{if(fs.statSync(filename).size>16*1024*1024)throw new Error('Receipt file exceeds 16 MiB limit');rows=fs.readFileSync(filename,'utf8').trim().split('\n').filter(Boolean);}catch(error){if(error.code!=='ENOENT')throw error;}
    rows.push(JSON.stringify(result));fs.writeFileSync(filename+'.tmp',rows.slice(-10000).join('\n')+'\n',{mode:0o600});fs.renameSync(filename+'.tmp',filename);}else console.log(JSON.stringify(result));};
  await sample();if(!process.argv.includes('--once')){const loop=async()=>{if(performance.now()>=deadline)return;await sample();if(performance.now()<deadline)setTimeout(loop,Math.min(interval,deadline-performance.now()));};setTimeout(loop,Math.min(interval,Math.max(0,deadline-performance.now())));}
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={observe};
