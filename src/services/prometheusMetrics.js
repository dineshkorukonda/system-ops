function renderMetrics({health,diagnostics,runtime,persistence}) {
  const lines=[];
  const metric=(name,type,help,samples)=>{
    lines.push(`# HELP ${name} ${help}`,`# TYPE ${name} ${type}`);
    for(const {value,label} of samples) if(Number.isFinite(value)) lines.push(`${name}${label?`{collector="${String(label).replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\n','\\n')}"}`:''} ${value}`);
  };
  const gauge=(name,help,value)=>metric(name,'gauge',help,[{value}]);
  gauge('system_ops_monitoring_ready','Critical collectors are fresh (not application uptime).',Number(health.ok));
  gauge('system_ops_persistence_available','Durable storage is available.',Number(persistence.available));
  gauge('system_ops_process_resident_memory_bytes','Node resident memory in bytes.',diagnostics.systemOpsMemory.rssBytes);
  gauge('system_ops_process_uptime_seconds','Node process uptime in seconds.',diagnostics.uptimeSeconds);
  gauge('system_ops_event_loop_delay_p95_seconds','Event loop delay p95 in seconds.',runtime.eventLoopDelay.p95/1000);
  gauge('system_ops_commands_active','Active app-owned subprocess commands.',runtime.commands.active);
  const entries=Object.entries(health.collectors).slice(0,32);
  metric('system_ops_collector_enabled','gauge','Collector scheduling enabled.',entries.map(([label,col])=>({label,value:Number(col.enabled)})));
  metric('system_ops_collector_fresh','gauge','Collector has a fresh successful sample.',entries.map(([label,col])=>({label,value:Number(col.fresh)})));
  metric('system_ops_collector_last_success_timestamp_seconds','gauge','Unix timestamp of last successful sample.',entries.map(([label,col])=>({label,value:col.lastSuccess?Date.parse(col.lastSuccess)/1000:0})));
  metric('system_ops_collector_duration_seconds','gauge','Most recent collector duration.',entries.map(([label])=>({label,value:(diagnostics.collectorStats[label]?.lastDurationMs || 0)/1000})));
  metric('system_ops_collector_failures_total','counter','Collection failures since this process started.',entries.map(([label])=>({label,value:diagnostics.collectorStats[label]?.failures || 0})));
  metric('system_ops_collector_skipped_total','counter','Skipped executions since this process started.',entries.map(([label,col])=>({label,value:col.skippedRuns || 0})));
  return lines.join('\n')+'\n';
}
module.exports={renderMetrics};
