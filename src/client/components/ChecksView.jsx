import React,{useState} from 'react';
import {Button} from './ui/Button';
import {Badge} from './ui/Badge';
export function ChecksView({data,onChanged}) {
  const [form,setForm]=useState({id:'',name:'',type:'http',url:'',host:'',port:'',expectedText:''});
  const [error,setError]=useState(null),[busy,setBusy]=useState(false);
  const request=async(route,method,body)=>{setBusy(true);setError(null);try{const res=await fetch(route,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await res.json();if(!res.ok)throw new Error(result.error || 'Request failed');await onChanged();}catch(err){setError(err.message);}finally{setBusy(false);}};
  return <div className="space-y-5">
    <div className="setup-note"><strong>Availability from this observer</strong><span>Local checks cannot detect a complete host outage while this app is offline. Unknown periods are excluded from observed uptime and reported separately.</span></div>
    {error && <p role="alert" className="error-message">{error}</p>}
    {data?.persistence && !data.persistence.available && <p role="alert" className="error-message">Persistence unavailable. Check results cannot be saved.</p>}
    <section className="source-section"><h2>Configured checks</h2>{!data?.checks?.length?<div className="empty-state">No checks configured. Add an endpoint below.</div>:<div className="source-grid">{data.checks.map(check=><article className="source-card" key={check.id}><div className="source-card-heading"><h3>{check.name}</h3><Badge variant={check.status==='down'?'err':check.status==='up'?'ok':'neutral'}>{check.status}</Badge></div>
      <p>{check.type==='http'?check.url:check.type==='tcp'?`${check.host}:${check.port}`:'Independent observer'}</p>
      <dl><dt>Observed uptime (24h)</dt><dd>{check.availability.uptimePercent===null?'Unknown':`${check.availability.uptimePercent.toFixed(2)}%`}</dd><dt>Coverage</dt><dd>{check.availability.coveragePercent.toFixed(2)}% · unknown {(check.availability.unknownMs/3600000).toFixed(2)}h</dd><dt>Last observation</dt><dd>{check.lastObservation?new Date(check.lastObservation.time).toLocaleString():'None'}</dd></dl>
      {check.lastObservation?.error && <p className="error-message">{check.lastObservation.error}</p>}
      <div className="source-actions"><Button variant="outline" disabled={busy} onClick={()=>request(`/api/v2/checks/${check.id}`,'PUT',{...check,enabled:!check.enabled})}>{check.enabled?'Disable':'Enable'}</Button><Button variant="outline" disabled={busy} onClick={()=>request(`/api/v2/checks/${check.id}`,'PUT',{...check,maintenanceUntil:Date.now()+3600000})}>Maintenance: 1h</Button><Button variant="ghost" disabled={busy} onClick={()=>request(`/api/v2/checks/${check.id}`,'DELETE')}>Remove</Button></div>
    </article>)}</div>}</section>
    <section className="source-section"><h2>Add a check</h2><form className="check-form" onSubmit={event=>{event.preventDefault();request(`/api/v2/checks/${encodeURIComponent(form.id)}`,'PUT',form);}}>
      <label>Check ID<input required pattern="[a-zA-Z0-9_-]{1,64}" value={form.id} onChange={event=>setForm({...form,id:event.target.value})}/></label>
      <label>Name<input value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></label>
      <label>Check type<select value={form.type} onChange={event=>setForm({...form,type:event.target.value})}><option value="http">HTTP</option><option value="tcp">TCP</option><option value="external">External observer</option></select></label>
      {form.type==='http'&&<><label>Endpoint URL<input required type="url" value={form.url} onChange={event=>setForm({...form,url:event.target.value})}/></label><label>Expected text (optional)<input value={form.expectedText} onChange={event=>setForm({...form,expectedText:event.target.value})}/></label></>}
      {form.type==='tcp'&&<><label>Host<input required value={form.host} onChange={event=>setForm({...form,host:event.target.value})}/></label><label>Port<input required type="number" min="1" max="65535" value={form.port} onChange={event=>setForm({...form,port:event.target.value})}/></label></>}
      <Button disabled={busy} type="submit">{busy?'Saving…':'Save check'}</Button>
    </form></section>
    <section className="source-section"><h2>Incidents</h2>{!data?.incidents?.length?<p className="empty-state">No persisted incidents.</p>:<div className="space-y-3">{data.incidents.slice(0,50).map(incident=><article className="setup-note" key={incident.id}><strong>{incident.check_id} · {incident.closed?'Recovered':'Open'}</strong><span>{incident.reason} · {new Date(incident.opened).toLocaleString()}</span>{!incident.acknowledged&&<Button variant="outline" disabled={busy} onClick={()=>request(`/api/v2/incidents/${incident.id}/acknowledge`,'POST')}>Acknowledge</Button>}</article>)}</div>}</section>
  </div>;
}
