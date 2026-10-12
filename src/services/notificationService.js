function destination(env = process.env) {
  if (!env.SYSTEM_OPS_WEBHOOK_URL) return null;
  const url = new URL(env.SYSTEM_OPS_WEBHOOK_URL);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Webhook must use HTTP(S) without embedded credentials');
  return url.href;
}
class NotificationService {
  constructor(store,{env=process.env,now=Date.now,send=fetch}={}) {this.store=store;this.env=env;this.now=now;this.send=send;this.lastError=null;}
  async deliver(payload, signal) {
    const url=destination(this.env);if(!url)throw new Error('Webhook destination is not configured');
    const response=await this.send(url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':payload.eventId,
      ...(this.env.SYSTEM_OPS_WEBHOOK_TOKEN?{Authorization:`Bearer ${this.env.SYSTEM_OPS_WEBHOOK_TOKEN}`}:{})},body:JSON.stringify(payload),
      redirect:'manual',signal:AbortSignal.any([AbortSignal.timeout(5000),...(signal?[signal]:[])])});
    await response.body?.cancel();if(!response.ok)throw new Error(`Webhook receiver returned HTTP ${response.status}`);
  }
  async run(signal) {
    if(!destination(this.env))return this.status();
    if(!this.store.status().available)throw new Error('Notification persistence unavailable');
    for(const event of this.store.pendingDeliveries(this.now())) {
      const check=this.store.checks().find(config=>config.id===event.check_id);
      if(event.kind==='outage' && (event.acknowledged || event.closed)) {
        this.store.deliveryAttempt(event,{delivered:-1,error:'Suppressed acknowledged or resolved outage',increment:false});continue;
      }
      if(check?.maintenanceUntil>this.now()) {this.store.deliveryAttempt(event,{nextAttempt:check.maintenanceUntil,increment:false});continue;}
      try {
        await this.deliver({schemaVersion:1,eventId:`incident-${event.incident_id}-${event.kind}`,type:event.kind,checkId:event.check_id,
          checkName:check?.name || event.check_id,openedAt:new Date(event.opened).toISOString(),closedAt:event.closed?new Date(event.closed).toISOString():null,reason:event.reason},signal);
        if(!this.store.deliveryAttempt(event,{delivered:this.now()}))throw new Error('Could not persist webhook acknowledgement');
        this.lastError=null;
      }catch(error){this.lastError=error.message;this.store.deliveryAttempt(event,{error:error.message,nextAttempt:this.now()+Math.min(300000,30000*2**event.attempts)});}
    }
    return this.status();
  }
  status(){return {configured:!!this.env.SYSTEM_OPS_WEBHOOK_URL,error:this.lastError,deliveries:this.store.deliveryStatus(),deliveryGuarantee:'at-least-once; receiver must deduplicate Idempotency-Key'};}
  async test(signal){await this.deliver({schemaVersion:1,eventId:`test-${require('node:crypto').randomUUID()}`,type:'test',sentAt:new Date(this.now()).toISOString()},signal);return {success:true,acknowledged:true};}
}
module.exports={destination,NotificationService};
