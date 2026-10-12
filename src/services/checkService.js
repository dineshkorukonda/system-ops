const net = require('node:net');
const { performance } = require('node:perf_hooks');
function validateCheck(input) {
  if (!input || !/^[a-zA-Z0-9_-]{1,64}$/.test(input.id)) throw new Error('Check ID must use 1–64 letters, numbers, underscores or hyphens');
  if (!['http','tcp','external'].includes(input.type)) throw new Error('Check type must be http, tcp or external');
  const config = { id: input.id, name: String(input.name || input.id).slice(0,128), type: input.type,
    enabled: input.enabled !== false, intervalMs: Number(input.intervalMs || 60000), timeoutMs: Number(input.timeoutMs || 5000),
    maintenanceUntil: Number(input.maintenanceUntil || 0) };
  if (!Number.isInteger(config.intervalMs) || config.intervalMs < 15000 || config.intervalMs > 3600000) throw new Error('Interval must be 15 seconds to one hour');
  if (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 100 || config.timeoutMs > 10000) throw new Error('Timeout must be 100ms to 10s');
  if (!Number.isFinite(config.maintenanceUntil) || config.maintenanceUntil < 0 || config.maintenanceUntil > Date.now()+30*86400000) throw new Error('Maintenance window must end within 30 days');
  if (input.type === 'http') {
    const url = new URL(input.url);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || String(input.url).length > 2048) throw new Error('Use an HTTP(S) URL without embedded credentials');
    config.url = url.href; config.expectedStatus = Number(input.expectedStatus || 200);
    if (!Number.isInteger(config.expectedStatus) || config.expectedStatus < 100 || config.expectedStatus > 599) throw new Error('Invalid expected status');
    config.expectedText = input.expectedText ? String(input.expectedText).slice(0,256) : null;
  } else if (input.type === 'tcp') {
    config.host = String(input.host || '').trim(); config.port = Number(input.port);
    if (!config.host || config.host.length > 253 || /[\s/\0]/.test(config.host) || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('Invalid TCP host/port');
  }
  return config;
}
async function probe(config, signal) {
  const start = performance.now();
  const deadline = AbortSignal.any([AbortSignal.timeout(config.timeoutMs), ...(signal ? [signal] : [])]);
  try {
    if (config.type === 'tcp') await new Promise((resolve,reject) => {
      const socket = net.connect({host:config.host,port:config.port});
      const abort=()=>{socket.destroy();reject(new Error('TCP check timed out or cancelled'));};
      deadline.addEventListener('abort',abort,{once:true});
      socket.once('close',()=>deadline.removeEventListener('abort',abort));
      socket.once('connect',()=>{socket.destroy();resolve();});socket.once('error',reject);
      if(deadline.aborted)abort();
    });
    else if(config.type === 'http') {
      const response=await fetch(config.url,{signal:deadline,redirect:'manual'});
      if(response.status!==config.expectedStatus){await response.body?.cancel();throw new Error(`Expected HTTP ${config.expectedStatus}, received ${response.status}`);}
      if(config.expectedText) {
        const reader=response.body?.getReader(); let text='',bytes=0;
        if(reader) try {while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>65536)throw new Error('Response exceeds 64 KiB content-check limit');text+=Buffer.from(chunk.value).toString('utf8');}} finally {await reader.cancel().catch(()=>{});}
        if(!text.includes(config.expectedText))throw new Error('Expected response text was not found');
      } else await response.body?.cancel();
    } else throw new Error('External checks require an independent observer');
    return {status:'up',latencyMs:performance.now()-start,error:null};
  } catch(error) {return {status:signal?.aborted?'unknown':'down',latencyMs:performance.now()-start,error:error.message};}
}
function availability(rows, config, start, end) {
  let upMs=0,downMs=0;
  for(let i=0;i<rows.length;i++) {
    const row=rows[i];const from=Math.max(start,row.time);
    const until=Math.min(end,rows[i+1]?.time ?? end,row.time+config.intervalMs*1.5);
    const duration=Math.max(0,until-from);
    if(row.status==='up')upMs+=duration;else if(row.status==='down')downMs+=duration;
  }
  const observedMs=upMs+downMs,windowMs=Math.max(0,end-start);
  return {upMs,downMs,unknownMs:Math.max(0,windowMs-observedMs),coveragePercent:windowMs?100*observedMs/windowMs:0,uptimePercent:observedMs?100*upMs/observedMs:null,denominator:'observed up + down time; unknown gaps excluded'};
}
class CheckService {
  constructor(store,{now=Date.now,probeFn=probe}={}){this.store=store;this.now=now;this.probe=probeFn;}
  async runDue(signal) {
    if(!this.store.status().available) throw new Error('Check persistence unavailable');
    const due=this.store.checks().filter(config=>config.enabled&&config.type!=='external').filter(config=>{
      const last=this.store.observations(config.id).at(-1);return !last||this.now()-last.time>=config.intervalMs;
    }).slice(0,2);
    await Promise.all(due.map(async config=>{
      const result=config.maintenanceUntil>this.now()?{status:'unknown',error:'Maintenance window',latencyMs:null}:await this.probe(config,signal);
      if(!this.store.observation(config.id,result,this.now()))throw new Error('Check result could not be persisted');
    }));
    return this.snapshot();
  }
  snapshot(windowMs=86400000) {
    const end=this.now(),start=end-windowMs;
    return {timestamp:new Date(end).toISOString(),perspective:'local process; external checks require independent observer',persistence:this.store.status(),checks:this.store.checks().map(config=>{
      const rows=this.store.observations(config.id,start-config.intervalMs*1.5);const latest=rows.at(-1);
      const fresh=config.enabled&&latest&&end-latest.time<=config.intervalMs*1.5;
      return {...config,status:config.maintenanceUntil>end?'maintenance':!config.enabled?'disabled':fresh?latest.status:'unknown',lastObservation:latest||null,availability:availability(rows,config,start,end)};
    }),incidents:this.store.incidents()};
  }
}
module.exports={validateCheck,probe,availability,CheckService};
