const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
async function main(){
  if(process.env.CI!=='true'||process.platform!=='linux')throw new Error('Observability fixture requires a disposable Linux CI runner');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ops-observability-')),suffix=crypto.randomBytes(5).toString('hex');
  const promName=`ops-prom-${suffix}`,grafanaName=`ops-grafana-${suffix}`;
  const password=crypto.randomBytes(24).toString('hex'),grafanaPassword=crypto.randomBytes(24).toString('hex');
  const app=spawn(process.execPath,['src/start.js'],{stdio:'ignore',env:{...process.env,NODE_ENV:'production',PORT:'19090',HOST:'127.0.0.1',APP_PASSWORD:password,SESSION_SECRET:crypto.randomBytes(32).toString('hex'),SYSTEM_OPS_DATA_DIR:dir,ENABLE_GO_COLLECTOR:'false'}});
  const wait=async(url,options={})=>{for(let i=0;i<60;i++){try{const response=await fetch(url,{...options,signal:AbortSignal.timeout(1000)});if(response.ok)return response;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}throw new Error(`Fixture service did not become ready: ${new URL(url).pathname}`);};
  try{
    await wait('http://127.0.0.1:19090/health');
    fs.writeFileSync(path.join(dir,'token'),password,{mode:0o600});
    fs.writeFileSync(path.join(dir,'prometheus.yml'),'global:\n  scrape_interval: 2s\nscrape_configs:\n  - job_name: system-ops\n    metrics_path: /metrics\n    authorization:\n      credentials_file: /fixture/token\n    static_configs:\n      - targets: ["127.0.0.1:19090"]\n');
    execFileSync('docker',['run','-d','--name',promName,'--network','host','--user','0','-v',`${dir}:/fixture:ro`,'prom/prometheus:v3.5.0','--config.file=/fixture/prometheus.yml','--web.listen-address=127.0.0.1:19091'],{stdio:'ignore'});
    execFileSync('docker',['run','-d','--name',grafanaName,'--network','host','-e','GF_SERVER_HTTP_ADDR=127.0.0.1','-e','GF_SERVER_HTTP_PORT=19092','-e',`GF_SECURITY_ADMIN_PASSWORD=${grafanaPassword}`,'grafana/grafana:12.1.1'],{stdio:'ignore'});
    await wait('http://127.0.0.1:19091/-/ready');await wait('http://127.0.0.1:19092/api/health');
    const auth={Authorization:'Basic '+Buffer.from(`admin:${grafanaPassword}`).toString('base64'),'Content-Type':'application/json'};
    const ds=await fetch('http://127.0.0.1:19092/api/datasources',{method:'POST',headers:auth,body:JSON.stringify({name:'System Ops Prometheus',uid:'system-ops-prom',type:'prometheus',access:'proxy',url:'http://127.0.0.1:19091',isDefault:true})});if(!ds.ok)throw new Error('Grafana datasource creation failed');
    const dashboard=JSON.parse(fs.readFileSync('observability/grafana-dashboard.json','utf8').replaceAll('${DS_PROMETHEUS}','system-ops-prom'));delete dashboard.__inputs;
    const imported=await fetch('http://127.0.0.1:19092/api/dashboards/db',{method:'POST',headers:auth,body:JSON.stringify({dashboard,overwrite:true})});if(!imported.ok)throw new Error('Grafana dashboard import failed');
    let scraped=false;for(let i=0;i<20;i++){const response=await fetch('http://127.0.0.1:19091/api/v1/query?query=system_ops_process_resident_memory_bytes');const result=await response.json();if(result.data?.result?.length){scraped=true;break;}await new Promise(resolve=>setTimeout(resolve,500));}
    if(!scraped)throw new Error('Authenticated Prometheus scrape did not produce samples');
    const unauthenticated=await fetch('http://127.0.0.1:19090/metrics');if(unauthenticated.status!==401)throw new Error('Metrics unexpectedly accessible without authentication');
    fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/observability-fixture.json',JSON.stringify({node:process.version,prometheus:'3.5.0',grafana:'12.1.1',authenticatedScrape:true,unauthenticatedStatus:401,dashboardImported:true,panels:dashboard.panels.length,limitations:['Disposable local CI deployment; extra service resource costs are not included in Node-only baseline.']},null,2));
    console.log('PASS: protected metrics, real Prometheus scrape and Grafana dashboard import');
  }finally{app.kill('SIGTERM');for(const name of [promName,grafanaName])try{execFileSync('docker',['rm','-f',name],{stdio:'ignore'});}catch{}}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
