const assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path'),tls=require('node:tls');
async function main() {
  const dir=process.env.ADAPTER_FIXTURE_DIR;
  const certPath=path.join(dir,'cert.pem');
  const {getDockerSnapshot,getDockerLogs}=require('../src/collectors/docker');
  const docker=await getDockerSnapshot();
  assert.equal(docker.daemonReachable,true);assert.ok(docker.containers.some(container=>container.name===process.env.ADAPTER_FIXTURE_CONTAINER));
  assert.match((await getDockerLogs(process.env.ADAPTER_FIXTURE_CONTAINER,20)).output,/adapter-fixture-log/);
  const {readCertFromFile,checkNetworkTlsCert}=require('../src/collectors/tlsCerts');
  const file=await readCertFromFile(certPath);assert.equal(file.valid,true);assert.equal(file.source,'file');
  assert.equal(await readCertFromFile(path.join(dir,'missing.pem')),null);
  const server=tls.createServer({key:fs.readFileSync(path.join(dir,'key.pem')),cert:fs.readFileSync(certPath)},socket=>socket.end());
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let network;
  try { network=await checkNetworkTlsCert('127.0.0.1',server.address().port);assert.equal(network.valid,true); }
  finally { await new Promise(resolve=>server.close(resolve)); }
  const log=path.join(dir,'access.log');fs.writeFileSync(log,'fixture.test 203.0.113.5 - - [12/Oct/2026:17:00:00 +0530] "GET /fixture HTTP/1.1" 200 10 "-" "FixtureAgent"\n');
  const {parseTrafficAnalytics}=require('../src/collectors/trafficAnalytics');
  const traffic=await parseTrafficAnalytics(log);assert.equal(traffic.summary.total_hits,1);
  const {discover}=require('../src/collectors/discovery');
  const capabilities=discover({snapshots:{docker},enabled:{docker:true},logPaths:[log],sslPaths:[certPath]});
  assert.equal(capabilities.docker.available,true);assert.equal(capabilities.traffic.available,true);assert.equal(capabilities.tls.available,true);
  fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/adapter-fixture.json',JSON.stringify({platform:process.platform,node:process.version,verified:['real Docker container inventory','real Docker log tail','native X509 file expiry','live local TLS handshake','real access log ingestion','source evidence discovery'],limitations:['Disposable fixture; production permissions and reverse-proxy configuration are not validated.']},null,2));
  console.log('PASS: Docker, SSL and traffic adapter fixture');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
