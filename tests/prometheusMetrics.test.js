const {test}=require('node:test'),assert=require('node:assert/strict');
const {renderMetrics}=require('../src/services/prometheusMetrics');
test('Prometheus exporter uses finite values, escaped bounded collector labels and seconds/bytes units',()=>{
  const health={ok:false,collectors:Object.fromEntries(Array.from({length:100},(_,i)=>[i===0?'quoted"\\\n':`collector${i}`,{enabled:true,fresh:false,lastSuccess:null}]))};
  const text=renderMetrics({health,diagnostics:{systemOpsMemory:{rssBytes:1024},uptimeSeconds:1,collectorStats:{}},runtime:{eventLoopDelay:{p95:20},commands:{active:0}},persistence:{available:true}});
  assert.ok(text.endsWith('\n'));assert.match(text,/system_ops_event_loop_delay_p95_seconds 0.02/);assert.match(text,/system_ops_monitoring_ready 0/);
  assert.equal(text.includes('collector99'),false);assert.equal(text.includes('NaN'),false);assert.equal(text.includes('url='),false);assert.match(text,/quoted\\"\\\\\\n/);
});
